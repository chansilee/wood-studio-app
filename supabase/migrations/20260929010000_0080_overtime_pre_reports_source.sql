-- 區分一筆加班預報究竟是「員工自己線上申報」還是「負責人依紙本代為輸入」，
-- 讓加班預報頁面的狀態文字能分別呈現「負責人同意員工線上申報時數」跟「負責人
-- 依紙本約定代為輸入」，而不是不管來源一律顯示同一種文字。source 只在
-- INSERT 當下由 trigger 依當時操作者是不是負責人來決定，後續編輯（負責人用
-- 「手動編輯」改時數、或負責人核准/不核准）都不會回頭改動它，維持「這筆最初
-- 是誰送出的」的稽核意義。
alter table public.overtime_pre_reports
  add column source text not null default 'self' check (source in ('self', 'owner_manual'));

create or replace function public.validate_overtime_pre_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Taipei')::date;
begin
  -- escape hatch for expire_stale_overtime_reports()'s system-driven update
  if tg_op = 'UPDATE' and current_setting('app.overtime_auto_expire', true) = 'true' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.work_date <> today then
      raise exception '只能預報當天的加班';
    end if;
    if public.is_owner() then
      new.status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      new.source := 'owner_manual';
    else
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.source := 'self';
    end if;
    return new;
  end if;

  -- UPDATE by a real user
  if public.is_owner() and new.status is distinct from old.status then
    if new.requested_hours is distinct from old.requested_hours then
      raise exception '負責人只能核准或不核准，不可更動預報時數';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    return new;
  end if;

  if not public.is_owner() then
    if old.status <> 'pending' then
      raise exception '已審核的加班預報無法再修改';
    end if;
    if old.work_date <> today then
      raise exception '加班預報已逾期，無法修改';
    end if;
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  return new;
end;
$$;
