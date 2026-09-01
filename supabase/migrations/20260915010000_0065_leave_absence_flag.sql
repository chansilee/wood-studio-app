-- 曠職 (unexcused absence): a system-generated leave_requests row, created
-- only when the owner confirms the "still-red" warning while producing a
-- monthly settlement — same shape as is_manager_override (no leave_type_id,
-- owner-only, auto-approved), but represents the opposite outcome. Once the
-- settlement is produced the month-lock trigger (added earlier) protects it
-- from being touched until the owner deletes that settlement snapshot.
alter table public.leave_requests
  add column is_absence boolean not null default false;

alter table public.leave_requests drop constraint leave_requests_override_xor_type;
alter table public.leave_requests add constraint leave_requests_type_xor_flags check (
  (is_manager_override and not is_absence and leave_type_id is null)
  or (is_absence and not is_manager_override and leave_type_id is null)
  or (not is_manager_override and not is_absence and leave_type_id is not null)
);

create or replace function public.validate_leave_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_status_val public.shift_status;
  attendance_status_val text;
  type_hidden boolean;
begin
  select status into shift_status_val from public.schedules
    where member_id = new.member_id and work_date = new.leave_date;

  if shift_status_val is distinct from 'normal' then
    raise exception '只能針對「正常班」的日期申請假別';
  end if;

  if new.is_manager_override then
    select attendance_status into attendance_status_val
      from public.attendance_summary
      where member_id = new.member_id and work_date = new.leave_date;

    if attendance_status_val is null then
      raise exception '該日未有上班打卡，無法使用「主管同意提早下班」';
    elsif attendance_status_val <> 'abnormal' then
      raise exception '該日出勤非異常，無法使用「主管同意提早下班」';
    end if;
  elsif new.is_absence then
    if not public.is_owner() then
      raise exception '只有負責人可以設定曠職';
    end if;
  else
    if new.duration_type = 'partial' and (new.hours is null or new.hours <= 0) then
      raise exception '部分時數請假必須填寫時數';
    end if;

    select hidden_from_members into type_hidden from public.leave_types where id = new.leave_type_id;
    if type_hidden then
      raise exception '此假別已停用，無法選用申報';
    end if;
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
end;
$$;
