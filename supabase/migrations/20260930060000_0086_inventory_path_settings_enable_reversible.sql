-- 「啟用」原本設計成單向鎖（只能勾、不能取消），結果跟「已鎖定的葉節點不
-- 能延展/刪除」這條規則疊在一起，變成一旦有產品啟用過某條路徑，那個節點
-- 就永遠無法再往下細分——這不是原本要的效果。改成啟用可以取消：取消時前端
-- 直接刪掉這筆 product_inventory_path_settings（不是留著改成 enabled=false），
-- 這樣 recompute_diagram_paths() 的「這條路徑還有沒有被引用」檢查自然就會
-- 通過，節點才真的解鎖。
drop trigger if exists trg_validate_inventory_path_setting on public.product_inventory_path_settings;
drop function if exists public.validate_inventory_path_setting();

-- updated_at 原本靠上面那個 trigger 順便維護，拿掉 trigger 後改用一個只管
-- updated_at 的小 trigger 頂上
create or replace function public.touch_inventory_path_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_touch_inventory_path_setting
  before update on public.product_inventory_path_settings
  for each row execute function public.touch_inventory_path_setting();
