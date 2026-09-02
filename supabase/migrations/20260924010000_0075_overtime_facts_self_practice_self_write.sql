-- 請假系統新增「超出緩衝上限時，員工可自行簽認自主練習」流程：讓本人可以
-- 對自己的紀錄寫入 resolution='self_practice'（不涉及金錢，等同自我限縮聲
-- 明），但核算加班費（paid_as_overtime，會影響給薪）仍然只能由負責人決定，
-- 沿用既有的 overtime_facts_owner_write 政策。
create policy overtime_facts_self_write_self_practice on public.attendance_overtime_facts
  for all
  using (member_id = auth.uid() and resolution = 'self_practice')
  with check (member_id = auth.uid() and resolution = 'self_practice');
