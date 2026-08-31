-- Free-text grouping for TAG nodes (前段工序/後段工序/成品/...), deliberately
-- not a fixed enum — the UI offers a dropdown of categories already used in
-- the same scope plus a "new category" entry, so the set of valid values
-- grows per-product/template without ever needing a migration. category =
-- '成品' (by convention, picked from the same dropdown so it's never
-- hand-typed twice) is what drives the product page's SKU chip list.
alter table public.process_nodes
  add column category text,
  add constraint process_nodes_category_tag_only check (category is null or kind = 'tag');
