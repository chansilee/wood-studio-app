alter table public.org_settings
  add column default_next_month_after_25 boolean not null default true,
  add column default_last_month_before_5 boolean not null default true;
