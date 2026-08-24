create type public.leave_type as enum ('personal', 'sick', 'marriage', 'bereavement', 'official', 'absence');
create type public.leave_duration_type as enum ('full_day', 'partial');
create type public.leave_status as enum ('pending', 'approved', 'rejected');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  leave_date date not null,
  leave_type public.leave_type not null,
  duration_type public.leave_duration_type not null default 'full_day',
  hours numeric(4,2),
  reason text,
  status public.leave_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.leave_requests enable row level security;

create policy "leave_requests_select_self" on public.leave_requests
  for select using (member_id = auth.uid());

create policy "leave_requests_select_owner_all" on public.leave_requests
  for select using (public.is_owner());

create policy "leave_requests_insert_self" on public.leave_requests
  for insert with check (
    member_id = auth.uid() and public.current_role_name() is distinct from 'guest'
  );

create policy "leave_requests_update_self_pending" on public.leave_requests
  for update using (member_id = auth.uid() and status = 'pending')
  with check (member_id = auth.uid());

create policy "leave_requests_owner_update" on public.leave_requests
  for update using (public.is_owner()) with check (public.is_owner());

create policy "leave_requests_owner_delete" on public.leave_requests
  for delete using (public.is_owner());
