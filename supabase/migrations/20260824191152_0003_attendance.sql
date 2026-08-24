create type public.attendance_event_type as enum ('clock_in', 'clock_out');

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  event_type public.attendance_event_type not null,
  occurred_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  distance_m numeric,
  is_within_geofence boolean not null,
  created_at timestamptz not null default now()
);

alter table public.attendance_events enable row level security;

create policy "attendance_events_select_self" on public.attendance_events
  for select using (member_id = auth.uid());

create policy "attendance_events_select_owner_all" on public.attendance_events
  for select using (public.is_owner());

create policy "attendance_events_insert_self" on public.attendance_events
  for insert with check (
    member_id = auth.uid()
    and public.current_role_name() in ('owner', 'staff')
  );

create policy "attendance_events_owner_update" on public.attendance_events
  for update using (public.is_owner()) with check (public.is_owner());

create policy "attendance_events_owner_delete" on public.attendance_events
  for delete using (public.is_owner());

create view public.attendance_daily
with (security_invoker = true)
as
select
  member_id,
  (occurred_at at time zone 'Asia/Taipei')::date as work_date,
  min(occurred_at) filter (where event_type = 'clock_in') as clock_in_at,
  max(occurred_at) filter (where event_type = 'clock_out') as clock_out_at
from public.attendance_events
group by member_id, (occurred_at at time zone 'Asia/Taipei')::date;
