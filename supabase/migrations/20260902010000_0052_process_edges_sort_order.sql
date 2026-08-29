-- Without an explicit order, an action's output list (and a tag's list of
-- possible next actions) rendered in whatever order Postgres happened to
-- return rows in — not something the owner could control, and it showed up
-- wrong (fail-reason before the pass state) in at least one real graph.
alter table public.process_edges add column sort_order integer not null default 0;

-- backfill preserving current relative order (by created_at, which is what
-- was implicitly being relied on) so nothing visually reshuffles for graphs
-- nobody asked to reorder
with ranked as (
  select id, row_number() over (partition by from_node_id order by created_at) - 1 as rn
  from public.process_edges
)
update public.process_edges e
set sort_order = ranked.rn
from ranked
where ranked.id = e.id;
