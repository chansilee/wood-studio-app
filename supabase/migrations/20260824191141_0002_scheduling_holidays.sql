create type public.shift_status as enum ('normal', 'unscheduled', 'regular_off', 'special_off');
create type public.calendar_override_type as enum ('national_holiday', 'disaster_leave', 'election_leave', 'other');

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  status public.shift_status not null default 'unscheduled',
  note text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (member_id, work_date)
);

alter table public.schedules enable row level security;

create policy "schedules_select_self" on public.schedules
  for select using (member_id = auth.uid());

create policy "schedules_select_owner_all" on public.schedules
  for select using (public.is_owner());

create policy "schedules_owner_write" on public.schedules
  for all using (public.is_owner()) with check (public.is_owner());

create table public.calendar_overrides (
  id uuid primary key default gen_random_uuid(),
  override_date date not null unique,
  name text not null,
  type public.calendar_override_type not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.calendar_overrides enable row level security;

create policy "calendar_overrides_select_non_guest" on public.calendar_overrides
  for select using (public.current_role_name() is distinct from 'guest');

create policy "calendar_overrides_owner_write" on public.calendar_overrides
  for all using (public.is_owner()) with check (public.is_owner());
