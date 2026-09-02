-- 加班預報線上自報功能目前預設關閉：員工要加班須先找負責人用紙本填寫理由，
-- 負責人再到「加班預報」頁面代為輸入。這張表只是負責人「今天要不要開放某位
-- 成員自己上線預報」的每日開關，跟實際的預報紀錄（overtime_pre_reports）分開
-- 存放，因為開關可能在任何一筆預報存在之前就先被打開。
create table public.overtime_report_gates (
  member_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  is_open boolean not null default false,
  opened_by uuid references public.profiles(id),
  opened_at timestamptz,
  primary key (member_id, work_date)
);

alter table public.overtime_report_gates enable row level security;

create policy overtime_report_gates_select_self on public.overtime_report_gates
  for select using (member_id = auth.uid());
create policy overtime_report_gates_select_owner on public.overtime_report_gates
  for select using (public.is_owner());
create policy overtime_report_gates_owner_write on public.overtime_report_gates
  for all using (public.is_owner()) with check (public.is_owner());
