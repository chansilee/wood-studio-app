-- turns 加班事實 from freeform text into a structured owner decision for the
-- part of a day's excess that isn't already covered by an approved 加班預報：
-- 方案A（核算加班費，計入給薪時數）or 方案B（員工簽認自主練習，不計入）
alter table public.attendance_overtime_facts
  add column resolution text not null default 'unresolved'
    check (resolution in ('unresolved', 'paid_as_overtime', 'self_practice'));
