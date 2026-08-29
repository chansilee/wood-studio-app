-- Per-user display preferences for the 生產紀錄 logging form. Unlike
-- 日誌管理 (owner-only), every member has their own independent set — this
-- is purely "how my dropdowns look", not a business rule, so it's scoped
-- entirely to the calling user (no owner override needed).
create table public.journal_preferences (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  hide_unavailable_inputs boolean not null default false,
  action_first boolean not null default false,
  auto_fill_first_output boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.journal_preferences enable row level security;
create policy "journal_preferences_select_self" on public.journal_preferences for select using (member_id = auth.uid());
create policy "journal_preferences_write_self" on public.journal_preferences for all using (member_id = auth.uid()) with check (member_id = auth.uid());
