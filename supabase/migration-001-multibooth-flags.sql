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
