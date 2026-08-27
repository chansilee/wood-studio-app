-- Distinguish "no check-in at all" from "already normal attendance" when the
-- owner tries to use 「主管同意提早下班」on a day that doesn't qualify.
create or replace function public.validate_leave_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_status_val public.shift_status;
  attendance_status_val text;
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
  elsif new.duration_type = 'partial' and (new.hours is null or new.hours <= 0) then
    raise exception '部分時數請假必須填寫時數';
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
