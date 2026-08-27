-- 主管同意提早下班 belongs to 請假系統, not 打卡系統 — its deletion shouldn't
-- depend on 打卡設定's 啟用刪除紀錄功能 toggle (which is meant to gate
-- punch/backfill record deletion only). The owner can now always delete a
-- manager-override leave record, same as any other owner-created record.
drop policy "leave_requests_owner_delete" on public.leave_requests;
create policy "leave_requests_owner_delete" on public.leave_requests
  for delete using (is_owner());
