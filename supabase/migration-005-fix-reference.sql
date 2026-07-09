-- ============================================================
-- PATCH 5 (July 2026): fix "gen_random_bytes does not exist"
-- New Supabase projects keep pgcrypto outside the public schema,
-- so reference generation failed on every submission.
-- This version uses built in functions only. Run once.
-- ============================================================

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
    v_ref := 'HS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.registrations where reference = v_ref);
  end loop;
  return v_ref;
end $$;

grant execute on function public.generate_reference() to authenticated;
