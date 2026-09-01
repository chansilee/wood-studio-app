-- The 曠職 (is_absence) feature added a CHECK constraint and trigger that
-- allow an owner-created is_absence row, but never added a matching RLS
-- INSERT policy — leave_requests_insert_self requires member_id = auth.uid()
-- (fails: the owner is inserting for a DIFFERENT member), and
-- leave_requests_owner_insert_override only covers is_manager_override =
-- true (fails: this row has is_manager_override = false). With neither
-- permissive INSERT policy passing, Postgres rejected every 曠職
-- auto-conversion with "new row violates row-level security policy".
create policy leave_requests_owner_insert_absence on public.leave_requests
  for insert
  with check (is_owner() and is_absence = true);
