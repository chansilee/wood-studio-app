-- 加班預報：只能預報「當天」的加班，並在當天結束前由負責人核准/不核准；
-- 逾期未處理視同不核准（見 expire_stale_overtime_reports）。月結系統用已核准
-- 的上限，去 cap 實際超出契約工時的部分，決定多少超時算「給薪時數」。
create table public.overtime_pre_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  requested_hours numeric not null check (
    requested_hours > 0 and requested_hours <= 4
    and requested_hours * 2 = round(requested_hours * 2)
  ),
  status public.leave_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (member_id, work_date)
);

alter table public.overtime_pre_reports enable row level security;

create policy overtime_pre_reports_select_self on public.overtime_pre_reports
  for select using (member_id = auth.uid());
create policy overtime_pre_reports_select_owner on public.overtime_pre_reports
  for select using (public.is_owner());
create policy overtime_pre_reports_insert_self on public.overtime_pre_reports
  for insert with check (member_id = auth.uid());
create policy overtime_pre_reports_update_self on public.overtime_pre_reports
  for update
  using (member_id = auth.uid() and status = 'pending')
  with check (member_id = auth.uid());
create policy overtime_pre_reports_update_owner on public.overtime_pre_reports
  for update using (public.is_owner()) with check (public.is_owner());

create or replace function public.validate_overtime_pre_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Taipei')::date;
begin
  -- escape hatch for expire_stale_overtime_reports()'s system-driven update
  if tg_op = 'UPDATE' and current_setting('app.overtime_auto_expire', true) = 'true' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.work_date <> today then
      raise exception '只能預報當天的加班';
    end if;
    if public.is_owner() then
      new.status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
    return new;
  end if;

  -- UPDATE by a real user
  if public.is_owner() and new.status is distinct from old.status then
    if new.requested_hours is distinct from old.requested_hours then
      raise exception '負責人只能核准或不核准，不可更動預報時數';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    return new;
  end if;

  if not public.is_owner() then
    if old.status <> 'pending' then
      raise exception '已審核的加班預報無法再修改';
    end if;
    if old.work_date <> today then
      raise exception '加班預報已逾期，無法修改';
    end if;
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  return new;
end;
$$;

create trigger trg_validate_overtime_pre_report
  before insert or update on public.overtime_pre_reports
  for each row execute function public.validate_overtime_pre_report();

-- system sweep: anything still pending once its work_date has passed is
-- treated as not-approved (reviewed_by stays null so the UI can tell this
-- apart from an explicit owner rejection)
create or replace function public.expire_stale_overtime_reports()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.overtime_auto_expire', 'true', true);
  update public.overtime_pre_reports
  set status = 'rejected', reviewed_by = null, reviewed_at = now()
  where status = 'pending' and work_date < (now() at time zone 'Asia/Taipei')::date;
end;
$$;
