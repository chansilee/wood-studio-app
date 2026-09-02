-- 出勤狀態現在對稱套用 15 分鐘（0.25 小時）緩衝：跟契約工時差距在緩衝內
-- （不管是提早離場還是多待一點）都算「正常出勤」；超過緩衝，不管是不足還是
-- 超出，才算「異常出勤」。之前只看「有沒有達到契約工時」，超出契約工時多少
-- 都算 normal，跟月結/請假系統新的緩衝邏輯不一致，這裡補齊。
create or replace view public.attendance_summary as
with computed as (
  select
    d.member_id,
    d.work_date,
    d.clock_in_at,
    d.clock_out_at,
    p.default_daily_hours,
    case
      when d.clock_in_at is null or d.clock_out_at is null then null::numeric
      else round(
        (
          extract(epoch from d.clock_out_at - d.clock_in_at)
          - greatest(0::numeric, extract(epoch from least(d.clock_out_at, ((d.work_date + coalesce(s.lunch_end, '00:00:00'::time without time zone)) at time zone 'Asia/Taipei'::text)) - greatest(d.clock_in_at, ((d.work_date + coalesce(s.lunch_start, '00:00:00'::time without time zone)) at time zone 'Asia/Taipei'::text))))
          - greatest(0::numeric, extract(epoch from least(d.clock_out_at, ((d.work_date + coalesce(s.dinner_end, '00:00:00'::time without time zone)) at time zone 'Asia/Taipei'::text)) - greatest(d.clock_in_at, ((d.work_date + coalesce(s.dinner_start, '00:00:00'::time without time zone)) at time zone 'Asia/Taipei'::text))))
        ) / 3600.0,
        2
      )
    end as worked_hours
  from attendance_daily d
  join profiles p on p.id = d.member_id
  cross join org_settings s
)
select
  member_id,
  work_date,
  clock_in_at,
  clock_out_at,
  worked_hours,
  default_daily_hours,
  case
    when clock_in_at is null or clock_out_at is null then 'abnormal'::text
    when abs(worked_hours - default_daily_hours) <= 0.25 then 'normal'::text
    else 'abnormal'::text
  end as attendance_status
from computed;
