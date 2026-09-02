-- 加班事實：負責人針對「超出契約工時 > 0.25 小時」的日子填寫的書面註記
-- （不管當天有沒有核准加班預報都可能需要），純稽核留痕用途，跟給不給薪水
-- 是兩件事，所以獨立於 overtime_pre_reports 之外。
create table public.attendance_overtime_facts (
  member_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  note text not null default '',
  recorded_by uuid references public.profiles(id),
  recorded_at timestamptz not null default now(),
  primary key (member_id, work_date)
);

alter table public.attendance_overtime_facts enable row level security;

create policy overtime_facts_select_self on public.attendance_overtime_facts
  for select using (member_id = auth.uid());
create policy overtime_facts_select_owner on public.attendance_overtime_facts
  for select using (public.is_owner());
create policy overtime_facts_owner_write on public.attendance_overtime_facts
  for all using (public.is_owner()) with check (public.is_owner());
