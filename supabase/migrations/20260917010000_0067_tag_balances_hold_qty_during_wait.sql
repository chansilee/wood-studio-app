-- auto_advance_wait_node() immediately inserts a production_logs row that
-- consumes qty from the tag feeding a 等待乾燥 (wait) node the instant it
-- arrives there, but resolve_matured_wait_logs() only fills in that row's
-- output once wait_days has passed. Between those two moments the qty was
-- previously invisible: already subtracted from the input tag's balance,
-- not yet added to the output tag's. Fix: exclude a wait-node log's
-- qty_consumed from outflow until it has actually resolved (has a matching
-- production_log_outputs row), so the qty stays visible on the input tag
-- for the whole waiting period and only moves at the moment it resolves.
create or replace view public.tag_balances as
select
  n.id as tag_id,
  n.product_id,
  coalesce(inflow.qty, 0::bigint) - coalesce(outflow.qty, 0::bigint) + coalesce(adj.qty, 0::bigint) as available_qty
from process_nodes n
left join (
  select production_log_outputs.output_tag_id,
         sum(production_log_outputs.qty) as qty
  from production_log_outputs
  group by production_log_outputs.output_tag_id
) inflow on inflow.output_tag_id = n.id
left join (
  select pl.input_tag_id,
         sum(pl.qty_consumed) as qty
  from production_logs pl
  join process_nodes pn on pn.id = pl.action_node_id
  where pn.wait_days is null
     or exists (select 1 from production_log_outputs plo where plo.log_id = pl.id)
  group by pl.input_tag_id
) outflow on outflow.input_tag_id = n.id
left join (
  select stock_adjustments.tag_id,
         sum(stock_adjustments.qty_delta) as qty
  from stock_adjustments
  group by stock_adjustments.tag_id
) adj on adj.tag_id = n.id
where n.kind = 'tag'::process_node_kind and n.product_id is not null;
