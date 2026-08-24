import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 部署到 GitHub Pages 時，base 要改成你的 repo 名稱，例如 '/wood-studio-app/'
// 若之後改用自訂網域或 Cloudflare Pages 等根路徑部署，base 改回 '/' 即可
export default defineConfig({
  plugins: [react()],
  base: '/wood-studio-app/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
