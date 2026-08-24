# 資料庫 Schema 摘要

Migration 檔案在 `supabase/migrations/`，依模組拆分，已套用到專案 `xlfdukavxjaflsfwolrk`。

## profiles
使用者角色與基本資料，`id` 對應 `auth.users.id`。新使用者註冊時由 trigger `handle_new_user` 自動建立一筆，`role` 預設 `guest`。

| 欄位 | 說明 |
|---|---|
| role | owner / staff / apprentice / guest |
| default_daily_hours | 約定每日工時，預設 6 |

角色與工時只有 owner 能改（`protect_profile_privileged_fields` trigger 擋下其他人）。

## org_settings
單列設定表（id 固定為 1）：公司座標、地理圍欄半徑、午休/晚餐時段。打卡與工時計算會用到。

## schedules
`(member_id, work_date)` 唯一。`status`：normal(正常班) / unscheduled(未排班) / regular_off(例假) / special_off(休假)。只有 owner 可寫入，本人與 owner 可讀。

## calendar_overrides
國定假日 / 特殊假（天災假、選舉假）遮罩，`override_date` 唯一。前端排班月曆要先檢查當天是否有 override，有的話優先顯示且不可手動改班別狀態。

## attendance_events / attendance_daily
每次打卡是一筆事件（clock_in / clock_out + 座標 + 是否在圍欄內）。`attendance_daily` 是 view，取每天最早的 clock_in 與最晚的 clock_out。出勤狀態（正常/異常出勤）與扣除午休晚餐後的工時，交由前端或另一個 view 依 `org_settings` 計算。

## leave_requests
`leave_type`：personal(事假) / sick(病假) / marriage(婚假) / bereavement(喪假) / official(公出) / absence(曠職)。`duration_type`：full_day / partial。狀態 pending/approved/rejected，owner 審核。

## work_logs
`log_type`：production(製作) / learning(學習)。本人與 owner 可讀寫。

## products / product_images
`series` 1-6，null 代表未分類。圖片存 `r2_key` + `r2_url`，實際檔案在 Cloudflare R2。僅 owner 可寫，其餘登入使用者（非訪客）可讀。

## 重新產生 TypeScript 型別
schema 有變動時，透過 Supabase MCP 的 `generate_typescript_types` 重新產生，貼回 `src/shared/types/database.ts`。
