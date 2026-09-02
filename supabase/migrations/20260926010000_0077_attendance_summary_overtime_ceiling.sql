-- 出勤狀態的「正常」上界，若當天有核准的加班預報，直接從契約工時+0.25小時
-- 緩衝延伸為契約工時+核准時數（不疊加緩衝）；沒有核准預報則維持原本的緩衝
-- 判斷。下界（契約工時-0.25小時）不受加班預報影響。跟請假系統/月結系統的
-- computeAttendanceStatus() 共用同一套門檻，三邊顯示才不會走鐘。
create or replace view public.attendance_summary as
with computed as (
  select
    d.member_id,
    d.work_date,
    d.clock_in_at,
    d.clock_out_at,
    p.default_daily_hours,
    ot.requested_hours as approved_overtime_hours,
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
  left join overtime_pre_reports ot
    on ot.member_id = d.member_id and ot.work_date = d.work_date and ot.status = 'approved'
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
    when worked_hours < default_daily_hours - 0.25 then 'abnormal'::text
    when coalesce(approved_overtime_hours, 0) > 0 then
      case when worked_hours > default_daily_hours + approved_overtime_hours then 'abnormal'::text else 'normal'::text end
    when worked_hours > default_daily_hours + 0.25 then 'abnormal'::text
    else 'normal'::text
  end as attendance_status
from computed;
