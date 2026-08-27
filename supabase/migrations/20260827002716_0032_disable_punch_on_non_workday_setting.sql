alter table public.org_settings
  add column disable_punch_on_non_workday boolean not null default true;
