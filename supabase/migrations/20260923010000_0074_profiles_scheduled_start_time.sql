-- 約定上班時間：搭配約定每日工時使用，用來限制「太早打卡上班」（只能在約定
-- 時間前15分鐘內打卡）；每個成員各自可設定，先預填 10:00
alter table public.profiles
  add column scheduled_start_time time not null default '10:00:00';
