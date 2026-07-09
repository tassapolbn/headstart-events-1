-- ============================================================
-- PATCH 4 (July 2026)
-- Simpler vendor type restrictions: each booth can be marked with
-- the vendor types allowed to select it (e.g. Outside Provider).
-- Replaces the group based zone mapping from PATCH 3.
-- Run this whole file once in: Supabase Dashboard -> SQL Editor
-- ============================================================

alter table public.booths add column if not exists allowed_types jsonb;

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
  v_type_field text;
  v_type_val text;
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

  v_ids := coalesce(p_booth_ids, case when p_booth_id is null then null else array[p_booth_id] end);
  if v_ids is not null then
    select array_agg(distinct x) into v_ids from unnest(v_ids) x where x is not null;
  end if;

  if v_ids is not null and array_length(v_ids, 1) > v_max_booths then
    raise exception 'TOO_MANY_BOOTHS';
  end if;

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

    -- Booth level vendor type restriction: if a requested booth lists
    -- allowed types, the registrant's answer must be one of them.
    v_type_field := coalesce(v_event.floor_plan->>'vendorTypeField', '');
    v_type_val := case when v_type_field <> '' then coalesce(p_data->>v_type_field, '') else '' end;

    if exists (
      select 1 from public.booths b
      where b.id = any(v_ids)
        and b.allowed_types is not null
        and jsonb_typeof(b.allowed_types) = 'array'
        and jsonb_array_length(b.allowed_types) > 0
        and (v_type_val = '' or not exists (
          select 1 from jsonb_array_elements_text(b.allowed_types) t(val) where t.val = v_type_val
        ))
    ) then
      raise exception 'BOOTH_NOT_ALLOWED';
    end if;
  else
    v_ids := null;
  end if;

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
