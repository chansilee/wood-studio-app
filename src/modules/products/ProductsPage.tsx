export function ProductsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">產品參考頁面</h1>
      <p className="text-gray-600">
        TODO：依彈數(1-6)/pose 條列產品、關鍵字搜尋、產品細節照片與製作工序；admin/負責人可編輯，其餘僅可瀏覽/搜尋。
        資料表 <code>products</code> / <code>product_images</code> 已建立。
        圖片走 Cloudflare R2，需要另外實作 <code>supabase/functions/r2-presign</code> 產生簽名上傳網址（尚未建立，需要你提供 R2 帳號資訊）。
        可獨立開 task 實作。
      </p>
    </div>
  )
}
