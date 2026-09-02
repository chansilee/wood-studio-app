-- append-only log of "員工線上打卡與工作時間確認條款" acknowledgments —
-- who agreed and when, for the owner's records
create table public.attendance_terms_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now()
);

alter table public.attendance_terms_acknowledgments enable row level security;

create policy attendance_terms_ack_insert_self on public.attendance_terms_acknowledgments
  for insert
  with check (member_id = auth.uid());

create policy attendance_terms_ack_select_self on public.attendance_terms_acknowledgments
  for select
  using (member_id = auth.uid());

create policy attendance_terms_ack_select_owner on public.attendance_terms_acknowledgments
  for select
  using (public.is_owner());
