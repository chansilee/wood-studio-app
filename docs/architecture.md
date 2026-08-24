# 架構總覽

## 技術棧
- 前台：React + Vite + TypeScript（純 SPA），部署到 GitHub Pages
- 後台：Supabase（Auth + Postgres + RLS + Edge Functions）
- 圖片：Cloudflare R2，透過 Supabase Edge Function 產生 presigned URL 上傳

## Supabase 專案
- 名稱：`wood-studio-app`
- Project ref：`xlfdukavxjaflsfwolrk`
- Region：ap-northeast-1（東京）
- URL：https://xlfdukavxjaflsfwolrk.supabase.co

## 安全模型
所有權限都在資料庫層用 RLS 控管，不能只靠前端隱藏頁面/按鈕（因為前台是靜態站，anon key 是公開的）。
- `profiles.role`：owner(負責人) / staff(正式員工) / apprentice(學徒) / guest(訪客)，新註冊帳號預設 guest
- `is_owner()` / `current_role_name()`：security definer 函式，供 RLS policy 判斷身分
- 只有 owner 能修改別人的 `role` / `default_daily_hours`（由 trigger 擋下非 owner 的修改）

## 模組拆分（可個別交付 task）
| 模組 | 前端路徑 | 相依資料表 | 狀態 |
|---|---|---|---|
| 共用層（auth/路由/權限守門） | `src/shared`, `src/app` | `profiles` | 已完成 |
| 成員管理 | `src/modules/members` | `profiles` | 已完成 |
| 排班系統 | `src/modules/scheduling` | `schedules`, `calendar_overrides` | 骨架/TODO |
| 打卡系統 | `src/modules/attendance` | `attendance_events`, `attendance_daily`(view), `org_settings` | 骨架/TODO |
| 請假系統 | `src/modules/leave` | `leave_requests` | 骨架/TODO |
| 日誌系統 | `src/modules/journal` | `work_logs` | 骨架/TODO |
| 產品參考頁面 | `src/modules/products` | `products`, `product_images` | 骨架/TODO，需 R2 帳號資訊 |

各模組只透過共用層（`shared/lib/supabase.ts`、`shared/hooks/useAuth.tsx`、`shared/components/RequireRole.tsx`、`shared/constants/roles.ts`、`shared/types/database.ts`）耦合，彼此互相獨立，之後可以個別開 task 修改，不會互相影響。

## 待辦與需要你提供的資訊
1. **Cloudflare R2**：需要 Account ID / Access Key ID / Secret Access Key / Bucket 名稱，才能實作 `supabase/functions/r2-presign`（圖片上傳簽名）與產品參考頁面。
2. **公司座標與地理圍欄半徑**：打卡系統需要，填入 `org_settings.company_lat` / `company_lng` / `geofence_radius_m`。
3. **午休/晚餐時段預設值**：`org_settings.lunch_start/end`、`dinner_start/end`。
4. **GitHub repo**：建立後，把 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 加到 repo 的 GitHub Actions Secrets，並在 repo Settings → Pages 開啟 GitHub Actions 部署來源。若 repo 名稱不是 `wood-studio-app`，記得同步修改 `vite.config.ts` 的 `base` 和 `src/App.tsx` 的 `basename`。

## 本機開發
```bash
npm install
npm run dev
```
`.env.local` 已內建目前 Supabase 專案的 URL 與 anon key（此為公開金鑰，可安全存在前端）。
