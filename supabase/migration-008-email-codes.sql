-- ============================================================
-- PATCH 8 (October 2026): confirm the registrant's email with a
-- 6-digit code, for forms that switch it on
-- (Event -> Settings -> "Confirm email with a 6-digit code").
-- ------------------------------------------------------------
-- 1. The form asks the database for a code (request_email_code).
-- 2. The email relay (Apps Script) emails that code, once.
-- 3. The person types it in; check_email_code confirms it and hands
--    back a one-time token.
-- 4. The submission carries the token, and a check before every new
--    registration (require_verified_email) only accepts a public
--    submission for that form when the token matches its email.
--
-- Parents never sign in, so this adds no accounts. Codes cannot be
-- read by the public or by staff; only the email relay can read them.
-- Safe to run more than once. Run in: Supabase Dashboard -> SQL Editor
-- ============================================================

create table if not exists public.email_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null,
  code text not null,
  attempts int not null default 0,
  token text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  sent_at timestamptz,
  verified_at timestamptz,
  used_at timestamptz
);

create index if not exists idx_email_codes_lookup on public.email_codes(event_id, email, created_at desc);

-- No policies: nobody can read or change codes through the website.
alter table public.email_codes enable row level security;

-- ------------------------------------------------------------
-- Ask for a code. Returns the request id the relay needs.
-- One code a minute and five an hour per address, and 300 an hour
-- per form, so nobody can use the form to flood an inbox or use up
-- the school's daily email allowance.
-- ------------------------------------------------------------
create or replace function public.request_email_code(p_event_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_random bytea := decode(md5(gen_random_uuid()::text), 'hex');
  v_id uuid;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status in ('draft', 'closed') then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if not coalesce((v_event.settings->>'verifyEmail')::boolean, false) then
    raise exception 'EMAIL_CODE_NOT_USED';
  end if;
  if v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if exists (
    select 1 from public.email_codes
    where event_id = p_event_id and email = v_email and created_at > now() - interval '60 seconds'
  ) then
    raise exception 'EMAIL_CODE_TOO_SOON';
  end if;
  if (select count(*) from public.email_codes
      where event_id = p_event_id and email = v_email and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.email_codes
      where event_id = p_event_id and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'EMAIL_CODE_TOO_MANY';
  end if;

  insert into public.email_codes (event_id, email, code)
  values (
    p_event_id, v_email,
    lpad(((get_byte(v_random, 0) * 65536 + get_byte(v_random, 1) * 256 + get_byte(v_random, 2)) % 1000000)::text, 6, '0')
  )
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.request_email_code(uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Check a typed code. Returns {"token": "..."} when it is right, or
-- {"error": "wrong" | "locked" | "expired"}. Five wrong tries lock the
-- code, and the count is kept, because nothing here raises an error.
-- ------------------------------------------------------------
create or replace function public.check_email_code(p_event_id uuid, p_email text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_id uuid;
  v_token text;
begin
  select id into v_id from public.email_codes
  where event_id = p_event_id and email = v_email and code = v_code
    and used_at is null and expires_at > now() and attempts < 5
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.email_codes
    set verified_at = coalesce(verified_at, now()), token = coalesce(token, gen_random_uuid()::text)
    where id = v_id
    returning token into v_token;
    return jsonb_build_object('token', v_token);
  end if;

  if not exists (
    select 1 from public.email_codes
    where event_id = p_event_id and email = v_email and used_at is null and expires_at > now()
  ) then
    return jsonb_build_object('error', 'expired');
  end if;

  update public.email_codes set attempts = attempts + 1
  where event_id = p_event_id and email = v_email and used_at is null and expires_at > now();

  if not exists (
    select 1 from public.email_codes
    where event_id = p_event_id and email = v_email and used_at is null and expires_at > now() and attempts < 5
  ) then
    return jsonb_build_object('error', 'locked');
  end if;
  return jsonb_build_object('error', 'wrong');
end $$;

grant execute on function public.check_email_code(uuid, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Before every new registration: a public submission to a form with
-- "Confirm email" on must carry the token for the email it gives.
-- The token travels in data.__email_token and is removed before saving.
-- Staff (signed in) and the email relay are not affected, so the
-- office can still add or duplicate registrations by hand. Anonymous
-- survey answers without an email have nothing to confirm.
-- ------------------------------------------------------------
create or replace function public.require_verified_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := new.data->>'__email_token';
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  v_id uuid;
begin
  new.data := coalesce(new.data, '{}'::jsonb) - '__email_token';

  if v_role in ('authenticated', 'service_role') then
    return new;
  end if;
  if not coalesce((select (settings->>'verifyEmail')::boolean from public.events where id = new.event_id), false) then
    return new;
  end if;
  if coalesce(trim(new.email), '') = '' then
    return new;
  end if;

  select id into v_id from public.email_codes
  where event_id = new.event_id and email = lower(trim(new.email)) and token = v_token
    and verified_at > now() - interval '2 hours' and used_at is null
  order by verified_at desc
  limit 1
  for update;

  if not found then
    raise exception 'EMAIL_NOT_VERIFIED';
  end if;

  update public.email_codes set used_at = now() where id = v_id;
  return new;
end $$;

drop trigger if exists trg_regs_require_verified_email on public.registrations;
create trigger trg_regs_require_verified_email
  before insert on public.registrations
  for each row execute function public.require_verified_email();

-- Old codes are not needed: clear anything older than a day whenever a
-- new code is asked for, so the table stays small.
create or replace function public.prune_email_codes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.email_codes where created_at < now() - interval '1 day';
  return new;
end $$;

drop trigger if exists trg_email_codes_prune on public.email_codes;
create trigger trg_email_codes_prune
  after insert on public.email_codes
  for each statement execute function public.prune_email_codes();
