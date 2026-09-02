# 柴柴疤疤工作室管理系統

架構說明見 [docs/architecture.md](docs/architecture.md)，資料庫 schema 見 [docs/db-schema.md](docs/db-schema.md)。

## 開發
```bash
npm install
npm run dev
```

## 部署
push 到 `main` 分支會透過 GitHub Actions 自動 build 並部署到 GitHub Pages（需先在 repo Secrets 設定 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`，並在 repo Settings → Pages 選擇 GitHub Actions 作為部署來源）。
