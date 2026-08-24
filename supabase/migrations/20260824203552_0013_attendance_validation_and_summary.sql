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
begin
  select * into settings from public.org_settings where id = 1;

  work_date_check := (new.occurred_at at time zone 'Asia/Taipei')::date;

  select status into shift_status_val from public.schedules
    where member_id = new.member_id and work_date = work_date_check;

  if shift_status_val is distinct from 'normal' then
    raise exception '今日非「正常班」，無法打卡';
  end if;

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

  return new;
end;
$$;

create trigger trg_validate_attendance_event
  before insert on public.attendance_events
  for each row execute function public.validate_attendance_event();

create or replace view public.attendance_summary
with (security_invoker = true)
as
with computed as (
  select
    d.member_id,
    d.work_date,
    d.clock_in_at,
    d.clock_out_at,
    p.default_daily_hours,
    case
      when d.clock_in_at is null or d.clock_out_at is null then null
      else round((
        extract(epoch from (d.clock_out_at - d.clock_in_at))
        - greatest(0, extract(epoch from (
            least(d.clock_out_at, ((d.work_date + coalesce(s.lunch_end, '00:00'::time)) at time zone 'Asia/Taipei'))
            - greatest(d.clock_in_at, ((d.work_date + coalesce(s.lunch_start, '00:00'::time)) at time zone 'Asia/Taipei'))
          )))
        - greatest(0, extract(epoch from (
            least(d.clock_out_at, ((d.work_date + coalesce(s.dinner_end, '00:00'::time)) at time zone 'Asia/Taipei'))
            - greatest(d.clock_in_at, ((d.work_date + coalesce(s.dinner_start, '00:00'::time)) at time zone 'Asia/Taipei'))
          )))
      ) / 3600.0, 2)
    end as worked_hours
  from public.attendance_daily d
  join public.profiles p on p.id = d.member_id
  cross join public.org_settings s
)
select
  member_id,
  work_date,
  clock_in_at,
  clock_out_at,
  worked_hours,
  default_daily_hours,
  case
    when clock_in_at is null or clock_out_at is null then 'abnormal'
    when worked_hours >= default_daily_hours then 'normal'
    else 'abnormal'
  end as attendance_status
from computed;
