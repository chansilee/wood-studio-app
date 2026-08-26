-- "特殊流程": owner can mark another (or their own) abnormal-attendance day as
-- manager-approved early leave, unconditionally counted as a normal full day.
alter table public.leave_requests
  alter column leave_type_id drop not null;

alter table public.leave_requests
  add column is_manager_override boolean not null default false;

alter table public.leave_requests
  add constraint leave_requests_override_xor_type check (
    (is_manager_override = true and leave_type_id is null)
    or (is_manager_override = false and leave_type_id is not null)
  );

-- normal self-declare flow must never carry the override flag
drop policy "leave_requests_insert_self" on public.leave_requests;
create policy "leave_requests_insert_self" on public.leave_requests
  for insert
  with check (
    member_id = auth.uid()
    and current_role_name() is distinct from 'guest'
    and is_manager_override = false
  );

-- owner-only: mark anyone's (including their own) abnormal day as manager-approved early leave
create policy "leave_requests_owner_insert_override" on public.leave_requests
  for insert
  with check (
    is_owner()
    and is_manager_override = true
  );

create or replace function public.validate_leave_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_status_val public.shift_status;
begin
  select status into shift_status_val from public.schedules
    where member_id = new.member_id and work_date = new.leave_date;

  if shift_status_val is distinct from 'normal' then
    raise exception '只能針對「正常班」的日期申請假別';
  end if;

  if new.is_manager_override then
    if not exists (
      select 1 from public.attendance_summary
      where member_id = new.member_id
        and work_date = new.leave_date
        and attendance_status = 'abnormal'
    ) then
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

-- override rows are only deletable by the owner, gated by the same 打卡系統 delete toggle
drop policy "leave_requests_self_delete" on public.leave_requests;
create policy "leave_requests_self_delete" on public.leave_requests
  for delete using (member_id = auth.uid() and is_manager_override = false);

drop policy "leave_requests_owner_delete" on public.leave_requests;
create policy "leave_requests_owner_delete" on public.leave_requests
  for delete using (
    is_owner()
    and (
      is_manager_override = false
      or exists (select 1 from public.org_settings where id = 1 and allow_delete_records = true)
    )
  );
