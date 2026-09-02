-- 前一版政策的 USING 子句只允許本人更新「本來就已經是 self_practice」的舊
-- 列，但實務上第一次確認時，舊列通常是預設的 'unresolved'（或曾被負責人按
-- 過「修改」重置回 unresolved），導致 upsert 走到 UPDATE 分支時被 RLS 擋下
-- （USING expression 違規）。放寬 USING：只要舊列本來就是 unresolved 或
-- self_practice（本人所有），就允許改成 self_practice；一旦被負責人核算成
-- paid_as_overtime，USING 就不再放行，本人無法覆寫。
drop policy overtime_facts_self_write_self_practice on public.attendance_overtime_facts;

create policy overtime_facts_self_write_self_practice on public.attendance_overtime_facts
  for all
  using (member_id = auth.uid() and resolution in ('unresolved', 'self_practice'))
  with check (member_id = auth.uid() and resolution = 'self_practice');
