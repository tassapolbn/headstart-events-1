-- ============================================================
-- HeadStart Events Registration Platform
-- Supabase database schema
-- Run this entire file in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABLES
-- ------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  event_date date,
  end_date date,
  start_time text,
  end_time text,
  location text not null default '',
  reg_opens_at timestamptz,
  reg_closes_at timestamptz,
  max_registrations int,
  status text not null default 'draft'
    check (status in ('draft','published','open','closed','waitlist')),
  branding jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  form_schema jsonb not null default '[]'::jsonb,
  policies jsonb not null default '[]'::jsonb,
  email_template jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  floor_plan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booths (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null default '',
  number text not null default '',
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 120,
  h double precision not null default 80,
  rotation double precision not null default 0,
  color text,
  status text not null default 'available'
    check (status in ('available','reserved','booked','disabled','sponsor','vip',
                      'food_zone','activity_zone','stage','info_desk','toilet','emergency_exit')),
  hidden boolean not null default false,
  group_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reference text unique not null,
  booth_id uuid references public.booths(id) on delete set null,
  status text not null default 'confirmed'
    check (status in ('pending','confirmed','waitlist','rejected','cancelled')),
  name text,
  email text,
  phone text,
  data jsonb not null default '{}'::jsonb,
  checked_in_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  school_name text not null default 'HeadStart International School Phuket',
  logo_url text,
  admin_email text,
  webhook_url text,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------

create index if not exists idx_booths_event on public.booths(event_id);
create index if not exists idx_regs_event on public.registrations(event_id);
create index if not exists idx_regs_email on public.registrations(event_id, lower(email));
create index if not exists idx_events_slug on public.events(slug);

-- THE booth guarantee: at most one active registration may hold a booth.
-- The database itself makes double booking impossible.
create unique index if not exists one_active_registration_per_booth
  on public.registrations(booth_id)
  where booth_id is not null and status not in ('rejected','cancelled');

-- ------------------------------------------------------------
-- updated_at trigger
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_events_updated on public.events;
create trigger trg_events_updated before update on public.events
  for each row execute function public.set_updated_at();

drop trigger if exists trg_regs_updated on public.registrations;
create trigger trg_regs_updated before update on public.registrations
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Admins are authenticated users (create them in Auth -> Users).
-- The public (anon) can only read published events and visible booths,
-- and can only write through the submit_registration function below.
-- ------------------------------------------------------------

alter table public.events enable row level security;
alter table public.booths enable row level security;
alter table public.registrations enable row level security;
alter table public.event_templates enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "anon read published events" on public.events;
create policy "anon read published events" on public.events
  for select to anon using (status <> 'draft');

drop policy if exists "admin full access events" on public.events;
create policy "admin full access events" on public.events
  for all to authenticated using (true) with check (true);

drop policy if exists "anon read visible booths" on public.booths;
create policy "anon read visible booths" on public.booths
  for select to anon using (hidden = false);

drop policy if exists "admin full access booths" on public.booths;
create policy "admin full access booths" on public.booths
  for all to authenticated using (true) with check (true);

drop policy if exists "admin full access registrations" on public.registrations;
create policy "admin full access registrations" on public.registrations
  for all to authenticated using (true) with check (true);

drop policy if exists "admin full access templates" on public.event_templates;
create policy "admin full access templates" on public.event_templates
  for all to authenticated using (true) with check (true);

drop policy if exists "anyone read app settings" on public.app_settings;
create policy "anyone read app settings" on public.app_settings
  for select to anon, authenticated using (true);

drop policy if exists "admin write app settings" on public.app_settings;
create policy "admin write app settings" on public.app_settings
  for update to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- STORAGE BUCKETS
-- event-assets: public images (posters, banners, logos, floor plan backgrounds)
-- vendor-uploads: private vendor documents, photos and signatures
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('event-assets', 'event-assets', true, 10485760)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('vendor-uploads', 'vendor-uploads', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "public read event assets" on storage.objects;
create policy "public read event assets" on storage.objects
  for select using (bucket_id = 'event-assets');

drop policy if exists "admin write event assets" on storage.objects;
create policy "admin write event assets" on storage.objects
  for insert to authenticated with check (bucket_id = 'event-assets');

drop policy if exists "admin update event assets" on storage.objects;
create policy "admin update event assets" on storage.objects
  for update to authenticated using (bucket_id = 'event-assets');

drop policy if exists "admin delete event assets" on storage.objects;
create policy "admin delete event assets" on storage.objects
  for delete to authenticated using (bucket_id = 'event-assets');

drop policy if exists "public upload vendor docs" on storage.objects;
create policy "public upload vendor docs" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'vendor-uploads');

drop policy if exists "admin read vendor docs" on storage.objects;
create policy "admin read vendor docs" on storage.objects
  for select to authenticated using (bucket_id = 'vendor-uploads');

drop policy if exists "admin delete vendor docs" on storage.objects;
create policy "admin delete vendor docs" on storage.objects
  for delete to authenticated using (bucket_id = 'vendor-uploads');

-- ------------------------------------------------------------
-- REAL TIME
-- Booth changes stream to every open registration page instantly.
-- ------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.booths;
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- FUNCTIONS
-- ------------------------------------------------------------

-- Unique human friendly reference, e.g. HS-4F7A2C
create or replace function public.generate_reference()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  loop
    v_ref := 'HS-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.registrations where reference = v_ref);
  end loop;
  return v_ref;
end $$;

grant execute on function public.generate_reference() to authenticated;

-- The single public entry point for submitting a registration.
-- Validates the event window, capacity, duplicates and spam signals,
-- and claims the booth atomically so two vendors can never share one.
create or replace function public.submit_registration(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text default null,
  p_data jsonb default '{}'::jsonb,
  p_booth_id uuid default null,
  p_ack boolean default false,
  p_hp text default '',
  p_elapsed_seconds int default 9999
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_booth public.booths%rowtype;
  v_ref text;
  v_id uuid;
  v_status text := 'confirmed';
  v_active_count int;
  v_allow_dup boolean;
  v_waitlist_enabled boolean;
  v_require_approval boolean;
  v_min_seconds int;
  v_require_ack boolean;
  v_use_booth boolean := false;
begin
  -- Honeypot: real people never fill the hidden field.
  if coalesce(p_hp, '') <> '' then
    raise exception 'SPAM_DETECTED';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status = 'draft' then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  v_allow_dup        := coalesce((v_event.settings->>'allowDuplicateEmail')::boolean, false);
  v_waitlist_enabled := coalesce((v_event.settings->>'waitlistEnabled')::boolean, false);
  v_require_approval := coalesce((v_event.settings->>'requireApproval')::boolean, false);
  v_min_seconds      := coalesce((v_event.settings->>'minSubmitSeconds')::int, 3);
  v_require_ack      := coalesce((v_event.settings->>'requirePolicyAck')::boolean, true);

  -- Bots submit instantly; humans need at least a few seconds.
  if p_elapsed_seconds < v_min_seconds then
    raise exception 'SPAM_DETECTED';
  end if;

  if v_event.status = 'closed' then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_event.reg_opens_at is not null and now() < v_event.reg_opens_at then
    raise exception 'REGISTRATION_NOT_OPEN';
  end if;

  if v_event.reg_closes_at is not null and now() > v_event.reg_closes_at then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if coalesce(p_email, '') = '' or p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'INVALID_EMAIL';
  end if;

  if v_require_ack and not coalesce(p_ack, false) then
    raise exception 'POLICY_NOT_ACKNOWLEDGED';
  end if;

  if not v_allow_dup then
    if exists (
      select 1 from public.registrations
      where event_id = p_event_id
        and lower(email) = lower(p_email)
        and status not in ('rejected','cancelled')
    ) then
      raise exception 'DUPLICATE_EMAIL';
    end if;
  end if;

  -- Capacity and waitlist
  select count(*) into v_active_count
  from public.registrations
  where event_id = p_event_id and status in ('pending','confirmed');

  if v_event.status = 'waitlist' then
    v_status := 'waitlist';
  elsif v_event.max_registrations is not null and v_active_count >= v_event.max_registrations then
    if v_waitlist_enabled then
      v_status := 'waitlist';
    else
      raise exception 'EVENT_FULL';
    end if;
  elsif v_require_approval then
    v_status := 'pending';
  end if;

  -- Atomic booth claim. The row lock plus the unique index make
  -- it impossible for two submissions to take the same booth.
  if p_booth_id is not null and v_status <> 'waitlist' then
    select * into v_booth
    from public.booths
    where id = p_booth_id and event_id = p_event_id
    for update;

    if not found or v_booth.hidden or v_booth.status <> 'available' then
      raise exception 'BOOTH_TAKEN';
    end if;
    v_use_booth := true;
  end if;

  v_ref := public.generate_reference();

  insert into public.registrations (event_id, reference, booth_id, status, name, email, phone, data)
  values (p_event_id, v_ref, case when v_use_booth then p_booth_id else null end,
          v_status, p_name, p_email, p_phone, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  if v_use_booth then
    update public.booths set status = 'booked' where id = p_booth_id;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'reference', v_ref,
    'status', v_status,
    'booth_label', case when v_use_booth then v_booth.label else null end,
    'booth_number', case when v_use_booth then v_booth.number else null end
  );
end $$;

grant execute on function public.submit_registration(uuid, text, text, text, jsonb, uuid, boolean, text, int) to anon, authenticated;

-- Public lookup used by the QR code and the check in page.
-- Returns only non sensitive fields.
create or replace function public.get_registration_by_reference(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'reference', r.reference,
    'name', r.name,
    'status', r.status,
    'checked_in_at', r.checked_in_at,
    'created_at', r.created_at,
    'event', jsonb_build_object(
      'name', e.name, 'event_date', e.event_date, 'start_time', e.start_time,
      'end_time', e.end_time, 'location', e.location, 'slug', e.slug
    ),
    'booth', case when b.id is null then null
      else jsonb_build_object('label', b.label, 'number', b.number) end
  ) into v
  from public.registrations r
  join public.events e on e.id = r.event_id
  left join public.booths b on b.id = r.booth_id
  where upper(r.reference) = upper(trim(p_reference));

  if v is null then
    raise exception 'NOT_FOUND';
  end if;
  return v;
end $$;

grant execute on function public.get_registration_by_reference(text) to anon, authenticated;

-- Check in by reference, admins only.
create or replace function public.checkin_by_reference(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.registrations
  set checked_in_at = coalesce(checked_in_at, now())
  where upper(reference) = upper(trim(p_reference))
  returning id into v_id;

  if v_id is null then
    raise exception 'NOT_FOUND';
  end if;
  return public.get_registration_by_reference(p_reference);
end $$;

grant execute on function public.checkin_by_reference(text) to authenticated;

-- ============================================================
-- PATCH 1 is included below so fresh installs are complete.
-- ============================================================

-- ============================================================
-- PATCH 1 (July 2026)
-- 1. Vendors can book more than one booth in a single registration
-- 2. Booked booths can display a label (e.g. country flag and name)
-- Run this whole file once in: Supabase Dashboard -> SQL Editor
-- Safe to run on a live project; existing data is untouched.
-- ============================================================

-- Booked booths can carry a public display label (e.g. "Thailand")
alter table public.booths add column if not exists booked_label text;

-- One registration can hold several booths
create table if not exists public.registration_booths (
  registration_id uuid not null references public.registrations(id) on delete cascade,
  booth_id uuid not null references public.booths(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (registration_id, booth_id)
);

-- THE guarantee, extended: a booth can only ever be held by one registration.
create unique index if not exists one_holder_per_booth
  on public.registration_booths(booth_id);

alter table public.registration_booths enable row level security;

drop policy if exists "admin full access registration_booths" on public.registration_booths;
create policy "admin full access registration_booths" on public.registration_booths
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- Automatic booth release when a registration is rejected,
-- cancelled or deleted.
-- ------------------------------------------------------------
create or replace function public.release_booths_core(p_reg_id uuid, p_single uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.booths set status = 'available', booked_label = null
  where id in (select booth_id from public.registration_booths where registration_id = p_reg_id)
     or (p_single is not null and id = p_single);
  delete from public.registration_booths where registration_id = p_reg_id;
end $$;

create or replace function public.trg_release_booths()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.release_booths_core(old.id, old.booth_id);
    return old;
  end if;
  if new.status in ('rejected','cancelled') and old.status not in ('rejected','cancelled') then
    perform public.release_booths_core(new.id, old.booth_id);
    new.booth_id = null;
  end if;
  return new;
end $$;

drop trigger if exists trg_regs_release on public.registrations;
create trigger trg_regs_release before update of status on public.registrations
  for each row execute function public.trg_release_booths();

drop trigger if exists trg_regs_release_del on public.registrations;
create trigger trg_regs_release_del before delete on public.registrations
  for each row execute function public.trg_release_booths();

-- Admin helper: release every booth held by a registration.
create or replace function public.admin_release_registration_booths(p_reg_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;
  perform public.release_booths_core(p_reg_id, (select booth_id from public.registrations where id = p_reg_id));
  update public.registrations set booth_id = null where id = p_reg_id;
end $$;

grant execute on function public.admin_release_registration_booths(uuid) to authenticated;

-- ------------------------------------------------------------
-- submit_registration, now with multi booth support and
-- the booked booth display label.
-- ------------------------------------------------------------
drop function if exists public.submit_registration(uuid, text, text, text, jsonb, uuid, boolean, text, int);

create or replace function public.submit_registration(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text default null,
  p_data jsonb default '{}'::jsonb,
  p_booth_id uuid default null,
  p_ack boolean default false,
  p_hp text default '',
  p_elapsed_seconds int default 9999,
  p_booth_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_ref text;
  v_id uuid;
  v_status text := 'confirmed';
  v_active_count int;
  v_allow_dup boolean;
  v_waitlist_enabled boolean;
  v_require_approval boolean;
  v_min_seconds int;
  v_require_ack boolean;
  v_ids uuid[];
  v_cnt int;
  v_max_booths int;
  v_label_field text;
  v_label text;
  v_booth_text text;
begin
  if coalesce(p_hp, '') <> '' then
    raise exception 'SPAM_DETECTED';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status = 'draft' then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  v_allow_dup        := coalesce((v_event.settings->>'allowDuplicateEmail')::boolean, false);
  v_waitlist_enabled := coalesce((v_event.settings->>'waitlistEnabled')::boolean, false);
  v_require_approval := coalesce((v_event.settings->>'requireApproval')::boolean, false);
  v_min_seconds      := coalesce((v_event.settings->>'minSubmitSeconds')::int, 3);
  v_require_ack      := coalesce((v_event.settings->>'requirePolicyAck')::boolean, true);
  v_max_booths       := greatest(1, coalesce((v_event.settings->>'maxBooths')::int, 1));

  if p_elapsed_seconds < v_min_seconds then
    raise exception 'SPAM_DETECTED';
  end if;

  if v_event.status = 'closed' then
    raise exception 'REGISTRATION_CLOSED';
  end if;
  if v_event.reg_opens_at is not null and now() < v_event.reg_opens_at then
    raise exception 'REGISTRATION_NOT_OPEN';
  end if;
  if v_event.reg_closes_at is not null and now() > v_event.reg_closes_at then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if coalesce(p_email, '') = '' or p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'INVALID_EMAIL';
  end if;

  if v_require_ack and not coalesce(p_ack, false) then
    raise exception 'POLICY_NOT_ACKNOWLEDGED';
  end if;

  if not v_allow_dup then
    if exists (
      select 1 from public.registrations
      where event_id = p_event_id
        and lower(email) = lower(p_email)
        and status not in ('rejected','cancelled')
    ) then
      raise exception 'DUPLICATE_EMAIL';
    end if;
  end if;

  select count(*) into v_active_count
  from public.registrations
  where event_id = p_event_id and status in ('pending','confirmed');

  if v_event.status = 'waitlist' then
    v_status := 'waitlist';
  elsif v_event.max_registrations is not null and v_active_count >= v_event.max_registrations then
    if v_waitlist_enabled then
      v_status := 'waitlist';
    else
      raise exception 'EVENT_FULL';
    end if;
  elsif v_require_approval then
    v_status := 'pending';
  end if;

  -- Collect the requested booths (new array parameter, or the old single one).
  v_ids := coalesce(p_booth_ids, case when p_booth_id is null then null else array[p_booth_id] end);
  if v_ids is not null then
    select array_agg(distinct x) into v_ids from unnest(v_ids) x where x is not null;
  end if;

  if v_ids is not null and array_length(v_ids, 1) > v_max_booths then
    raise exception 'TOO_MANY_BOOTHS';
  end if;

  -- Atomic claim of every requested booth. Rows are locked in a
  -- consistent order; the unique index on registration_booths makes
  -- a double booking impossible even under a race.
  if v_ids is not null and array_length(v_ids, 1) > 0 and v_status <> 'waitlist' then
    select count(*) into v_cnt from (
      select id from public.booths
      where id = any(v_ids) and event_id = p_event_id
        and hidden = false and status = 'available'
      order by id
      for update
    ) locked;
    if v_cnt <> array_length(v_ids, 1) then
      raise exception 'BOOTH_TAKEN';
    end if;
  else
    v_ids := null;
  end if;

  -- Optional public label shown on booked booths (e.g. the country).
  v_label_field := coalesce(v_event.floor_plan->>'bookedLabelField', '');
  if v_label_field <> '' then
    v_label := nullif(left(trim(coalesce(p_data->>v_label_field, '')), 60), '');
  end if;

  v_ref := public.generate_reference();

  insert into public.registrations (event_id, reference, booth_id, status, name, email, phone, data)
  values (p_event_id, v_ref, case when v_ids is null then null else v_ids[1] end,
          v_status, p_name, p_email, p_phone, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  if v_ids is not null then
    insert into public.registration_booths (registration_id, booth_id)
    select v_id, x from unnest(v_ids) x;

    update public.booths
    set status = 'booked', booked_label = v_label
    where id = any(v_ids);

    select string_agg(trim(label || ' ' || number), ' + ' order by number, label)
    into v_booth_text
    from public.booths where id = any(v_ids);
  end if;

  return jsonb_build_object(
    'id', v_id,
    'reference', v_ref,
    'status', v_status,
    'booth_label', v_booth_text,
    'booth_number', null
  );
end $$;

grant execute on function public.submit_registration(uuid, text, text, text, jsonb, uuid, boolean, text, int, uuid[]) to anon, authenticated;

-- ------------------------------------------------------------
-- Lookup now returns every booth held by the registration.
-- ------------------------------------------------------------
create or replace function public.get_registration_by_reference(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'reference', r.reference,
    'name', r.name,
    'status', r.status,
    'checked_in_at', r.checked_in_at,
    'created_at', r.created_at,
    'event', jsonb_build_object(
      'name', e.name, 'event_date', e.event_date, 'start_time', e.start_time,
      'end_time', e.end_time, 'location', e.location, 'slug', e.slug
    ),
    'booth', case when b.id is null then null
      else jsonb_build_object('label', b.label, 'number', b.number) end,
    'booths', coalesce(
      (select jsonb_agg(jsonb_build_object('label', b2.label, 'number', b2.number) order by b2.number, b2.label)
       from public.registration_booths rb
       join public.booths b2 on b2.id = rb.booth_id
       where rb.registration_id = r.id),
      case when b.id is null then null
        else jsonb_build_array(jsonb_build_object('label', b.label, 'number', b.number)) end
    )
  ) into v
  from public.registrations r
  join public.events e on e.id = r.event_id
  left join public.booths b on b.id = r.booth_id
  where upper(r.reference) = upper(trim(p_reference));

  if v is null then
    raise exception 'NOT_FOUND';
  end if;
  return v;
end $$;

grant execute on function public.get_registration_by_reference(text) to anon, authenticated;

-- ============================================================
-- PATCH 2 is included below so fresh installs are complete.
-- ============================================================

-- ============================================================
-- PATCH 2 (July 2026)
-- 1. New booth status: Entrance
-- 2. Check in works like a single use ticket: scanning a QR that
--    was already used reports it loudly instead of passing silently
-- Run this whole file once in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- Allow the new 'entrance' status (old statuses stay valid).
alter table public.booths drop constraint if exists booths_status_check;
alter table public.booths add constraint booths_status_check
  check (status in ('available','reserved','booked','disabled','sponsor','vip',
                    'food_zone','activity_zone','stage','info_desk','toilet',
                    'emergency_exit','entrance'));

-- Ticket style check in, admins only.
-- First scan: marks attendance and returns the ticket details.
-- Second scan: returns already_checked_in = true so staff see a red warning.
create or replace function public.checkin_by_reference(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg public.registrations%rowtype;
  v_already boolean := false;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_reg
  from public.registrations
  where upper(reference) = upper(trim(p_reference));

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_reg.checked_in_at is not null then
    v_already := true;
  else
    update public.registrations set checked_in_at = now() where id = v_reg.id;
    v_reg.checked_in_at := now();
  end if;

  return public.get_registration_by_reference(p_reference)
    || jsonb_build_object(
         'already_checked_in', v_already,
         'checked_in_at', v_reg.checked_in_at,
         'email', v_reg.email,
         'data', v_reg.data
       );
end $$;

grant execute on function public.checkin_by_reference(text) to authenticated;
