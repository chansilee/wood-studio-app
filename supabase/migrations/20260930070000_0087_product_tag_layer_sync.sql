-- 同一個產品底下不同成品tag（例如坐柴的赤/黑/白/奶油柴）在入庫分類圖上
-- 常常會走過完全一樣的下游節點（眉型/眼型/嘴型…對每個顏色多半一樣），
-- 這張表讓某個tag在某一層打開「Sync」：打開後，之後在畫面上勾/取消勾
-- 這一層的節點，會單向廣播套用到同一個產品的其他tag（前提是對方也有
-- 走到那個節點；沒有就跳過，不報錯）。存在一筆row＝這個tag這一層有開
-- Sync，跟其他「啟用＝存在一筆row」的表是同一個習慣。
create table public.product_tag_layer_sync (
  product_tag_node_id uuid not null references public.process_nodes(id) on delete cascade,
  layer_id uuid not null references public.inventory_diagram_layers(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  primary key (product_tag_node_id, layer_id)
);

alter table public.product_tag_layer_sync enable row level security;

create policy product_tag_layer_sync_select_all on public.product_tag_layer_sync
  for select using (auth.uid() is not null);
create policy product_tag_layer_sync_owner_write on public.product_tag_layer_sync
  for all using (public.is_owner()) with check (public.is_owner());
