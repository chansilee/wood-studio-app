create type public.work_log_type as enum ('production', 'learning');

create table public.work_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  log_type public.work_log_type not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.work_logs enable row level security;

create policy "work_logs_select_self" on public.work_logs
  for select using (member_id = auth.uid());

create policy "work_logs_select_owner_all" on public.work_logs
  for select using (public.is_owner());

create policy "work_logs_insert_self" on public.work_logs
  for insert with check (
    member_id = auth.uid() and public.current_role_name() is distinct from 'guest'
  );

create policy "work_logs_update_self" on public.work_logs
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());

create policy "work_logs_owner_manage" on public.work_logs
  for all using (public.is_owner()) with check (public.is_owner());
