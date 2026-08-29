-- A product with real production history must never be silently wiped by
-- deleting the product row — previously production_logs.product_id cascaded,
-- so deleting a product would delete all its logs too. Switch to the default
-- (restrict) so the delete fails with a foreign key violation instead, which
-- the UI surfaces as a friendly blocking message.
alter table public.production_logs
  drop constraint production_logs_product_id_fkey,
  add constraint production_logs_product_id_fkey foreign key (product_id) references public.products(id);
