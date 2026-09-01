-- Once a member has a settlement_snapshots row for a given month, that whole
-- calendar month becomes immutable for that member: no leave request,
-- attendance backfill/approval/delete, or schedule edit/revert/delete may
-- touch a date inside it, by either the member or the owner. Deleting the
-- snapshot (already an owner-only action) is the only way to unlock it again.
create or replace function public.is_month_settled(p_member_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.settlement_snapshots
    where member_id = p_member_id
      and year_month = date_trunc('month', p_date)::date
  );
$$;

create or replace function public.validate_attendance_month_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if public.is_month_settled(old.member_id, (old.occurred_at at time zone 'Asia/Taipei')::date) then
      raise exception '本月已產生月結報表，不能再進行異動';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if public.is_month_settled(new.member_id, (new.occurred_at at time zone 'Asia/Taipei')::date) then
      raise exception '本月已產生月結報表，不能再進行異動';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_attendance_month_lock
before insert or update or delete on public.attendance_events
for each row execute function public.validate_attendance_month_lock();

create or replace function public.validate_leave_month_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if public.is_month_settled(old.member_id, old.leave_date) then
      raise exception '本月已產生月結報表，不能再進行異動';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if public.is_month_settled(new.member_id, new.leave_date) then
      raise exception '本月已產生月結報表，不能再進行異動';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_leave_month_lock
before insert or update or delete on public.leave_requests
for each row execute function public.validate_leave_month_lock();

create or replace function public.validate_schedule_month_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if public.is_month_settled(old.member_id, old.work_date) then
      raise exception '本月已產生月結報表，不能再進行異動';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if public.is_month_settled(new.member_id, new.work_date) then
      raise exception '本月已產生月結報表，不能再進行異動';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_schedule_month_lock
before insert or update or delete on public.schedules
for each row execute function public.validate_schedule_month_lock();
