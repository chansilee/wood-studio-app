-- member_wage_rates.effective_date was CHECK-constrained to always be the 1st
-- of a month, but the trigger (and the 成員管理 UI) anchor a member's very
-- first wage row to their exact hire_date, which is only the 1st for members
-- hired on the 1st. Anyone hired mid-month could never save their first wage
-- row: the CHECK rejected the raw hire date, and "1st of hire month" would
-- fail the trigger's "生效日不可早於到職日" check instead. Move the day-1
-- rule into the trigger itself, with an explicit exception when the date is
-- exactly the member's hire_date.
alter table public.member_wage_rates drop constraint member_wage_rates_effective_date_first_of_month;

create or replace function public.validate_member_wage_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hire date;
begin
  select hire_date into hire from public.profiles where id = new.member_id;
  if hire is null then
    raise exception '該成員尚未設定到職日，無法建立約定月薪表';
  end if;
  if new.effective_date < hire then
    raise exception '生效日不可早於到職日';
  end if;
  if new.effective_date <> hire and extract(day from new.effective_date) <> 1 then
    raise exception '生效日必須是每月1號，到職當天除外';
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;
