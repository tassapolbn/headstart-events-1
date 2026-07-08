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
