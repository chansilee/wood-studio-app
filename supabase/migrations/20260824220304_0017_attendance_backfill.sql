create type public.attendance_approval_status as enum ('pending', 'approved', 'rejected');

alter table public.attendance_events
  add column is_backfill boolean not null default false,
  add column approval_status public.attendance_approval_status not null default 'approved',
  add column reviewed_by uuid references public.profiles(id),
  add column reviewed_at timestamptz;

alter table public.attendance_events alter column is_within_geofence drop not null;

create or replace view public.attendance_daily
with (security_invoker = true)
as
select
  member_id,
  (occurred_at at time zone 'Asia/Taipei')::date as work_date,
  min(occurred_at) filter (where event_type = 'clock_in') as clock_in_at,
  max(occurred_at) filter (where event_type = 'clock_out') as clock_out_at
from public.attendance_events
where approval_status = 'approved'
group by member_id, (occurred_at at time zone 'Asia/Taipei')::date;

create or replace function public.validate_attendance_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings record;
  work_date_check date;
  shift_status_val public.shift_status;
  computed_distance double precision;
  today_taipei date;
begin
  select * into settings from public.org_settings where id = 1;
  today_taipei := (now() at time zone 'Asia/Taipei')::date;

  if new.is_backfill then
    new.occurred_at := date_trunc('minute', new.occurred_at);
  end if;

  work_date_check := (new.occurred_at at time zone 'Asia/Taipei')::date;

  if new.is_backfill and work_date_check >= today_taipei then
    raise exception '補登日期必須是昨天以前';
  end if;

  select status into shift_status_val from public.schedules
    where member_id = new.member_id and work_date = work_date_check;

  if shift_status_val is distinct from 'normal' then
    raise exception '該日非「正常班」，無法打卡/補登';
  end if;

  if new.is_backfill then
    new.is_within_geofence := null;
    new.distance_m := null;
    if public.is_owner() then
      new.approval_status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.approval_status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  else
    new.approval_status := 'approved';
    new.reviewed_by := null;
    new.reviewed_at := null;

    if settings.geofence_disabled then
      new.is_within_geofence := true;
      new.distance_m := null;
    else
      if settings.company_lat is null or settings.company_lng is null then
        raise exception '尚未設定公司座標，請聯絡負責人';
      end if;

      computed_distance := 2 * 6371000 * asin(sqrt(
        power(sin(radians((new.lat - settings.company_lat) / 2.0)), 2)
        + cos(radians(settings.company_lat)) * cos(radians(new.lat))
          * power(sin(radians((new.lng - settings.company_lng) / 2.0)), 2)
      ));

      new.distance_m := round(computed_distance::numeric, 1);
      new.is_within_geofence := computed_distance <= settings.geofence_radius_m;

      if not new.is_within_geofence then
        raise exception '不在公司地理圍欄範圍內（距離約 % 公尺，允許範圍 % 公尺）',
          round(computed_distance::numeric), settings.geofence_radius_m;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop policy "attendance_events_owner_delete" on public.attendance_events;

create policy "attendance_events_owner_delete" on public.attendance_events
  for delete using (
    public.is_owner()
    and exists (select 1 from public.org_settings where id = 1 and allow_delete_records = true)
    and (
      is_backfill
      or (occurred_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date
    )
  );
