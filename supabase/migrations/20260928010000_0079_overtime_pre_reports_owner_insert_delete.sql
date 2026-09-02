-- 原本的政策只讓本人 insert 自己的加班預報，負責人只能 update（核准/不核准）
-- 既有紀錄，沒有任何政策讓負責人「代員工建立」一筆新的預報——這就是加班預報
-- 頁面新增的「手動編輯」代為輸入功能會被 RLS 擋下的原因。另外整張表完全沒有
-- delete 政策，導致負責人也無法刪除任何一筆（不論是自己代填的還是員工自己
-- 送出的），一併補上負責人刪除的權限。
create policy overtime_pre_reports_insert_owner on public.overtime_pre_reports
  for insert with check (public.is_owner());

create policy overtime_pre_reports_delete_owner on public.overtime_pre_reports
  for delete using (public.is_owner());
