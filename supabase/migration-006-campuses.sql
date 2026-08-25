-- ============================================================
-- PATCH 6 (July 2026): Multiple campuses (HSC / HSN) + multi
-- recipient notification emails.
-- Existing data is preserved: every current event becomes an HSC
-- event, and the current global settings are copied into HSC.
-- Run this whole file once in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- CAMPUSES
-- One row per campus. Holds the branding and the list of people
-- who should be notified about new registrations for that campus.
-- ------------------------------------------------------------
create table if not exists public.campuses (
  id text primary key,               -- 'hsc', 'hsn', future short codes
  name text not null,                -- short label shown in the switcher
  school_name text not null default 'HeadStart International School',
  logo_url text,
  email_logo_url text,
  webhook_url text,                  -- optional per-campus relay, else the global one
  notify_emails jsonb not null default '[]'::jsonb,
  accent text not null default '#1a3c5e',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.campuses (id, name, school_name, accent, sort_order) values
  ('hsc', 'HSC', 'HeadStart International School Phuket', '#1a3c5e', 1),
  ('hsn', 'HSN', 'HeadStart International School Phuket', '#0e7490', 2)
on conflict (id) do nothing;

-- Copy the current global settings into HSC so nothing is lost.
update public.campuses c set
  school_name    = coalesce(nullif(s.school_name, ''), c.school_name),
  logo_url       = s.logo_url,
  email_logo_url = s.email_logo_url,
  webhook_url    = s.webhook_url,
  notify_emails  = case
                     when coalesce(s.admin_email, '') <> ''
                     then jsonb_build_array(s.admin_email)
                     else '[]'::jsonb
                   end
from public.app_settings s
where c.id = 'hsc' and s.id = 1;

-- ------------------------------------------------------------
-- EVENTS and TEMPLATES gain a campus
-- ------------------------------------------------------------
alter table public.events add column if not exists campus_id text;
update public.events set campus_id = 'hsc' where campus_id is null;
alter table public.events alter column campus_id set default 'hsc';
alter table public.events alter column campus_id set not null;

do $$
begin
  alter table public.events
    add constraint events_campus_fk foreign key (campus_id) references public.campuses(id);
exception when duplicate_object then null;
end $$;

create index if not exists idx_events_campus on public.events(campus_id);

alter table public.event_templates add column if not exists campus_id text;
update public.event_templates set campus_id = 'hsc' where campus_id is null;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.campuses enable row level security;

drop policy if exists "anyone read campuses" on public.campuses;
create policy "anyone read campuses" on public.campuses
  for select to anon, authenticated using (true);

drop policy if exists "admin write campuses" on public.campuses;
create policy "admin write campuses" on public.campuses
  for all to authenticated using (true) with check (true);
