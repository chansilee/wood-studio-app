-- 假別管理: 給薪係數 (pay_coefficient), 假別說明 (description), and a per-type
-- 對使用者隱藏 (hidden_from_members) flag that removes it from the self-declare
-- picker and blocks it server-side for the normal (non-override) leave flow.
alter table public.leave_types
  add column pay_coefficient numeric(4,2) not null default 1,
  add column description text not null default '',
  add column hidden_from_members boolean not null default false;

update public.leave_types set pay_coefficient = 0, description = '事假無薪' where name = '事假';
update public.leave_types set pay_coefficient = 0.5, description = '病假半薪' where name = '病假';
update public.leave_types set pay_coefficient = 1, description = '婚假全薪' where name = '婚假';
update public.leave_types set pay_coefficient = 1, description = '喪假全薪' where name = '喪假';
update public.leave_types set pay_coefficient = 1, description = '公出全薪' where name = '公出';
update public.leave_types set pay_coefficient = 0, description = '曠職無薪', hidden_from_members = true where name = '曠職';

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
