create policy "leave_requests_self_delete" on public.leave_requests
  for delete using (member_id = auth.uid());
