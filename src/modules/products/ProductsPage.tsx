import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { ProductFolderBrowser, clearRememberedProductFolder } from './ProductFolderBrowser'
import type { Tables } from '@/shared/types/database'

type Product = Tables<'products'>

export function ProductsPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTags, setNewTags] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [folderMode, setFolderMode] = useState(false)
  const [showFolderHelp, setShowFolderHelp] = useState(false)
  const [prices, setPrices] = useState<Record<string, number>>({})

  const load = async () => {
    setLoading(true)
    const [{ data, error }, { data: priceRows }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('current_product_prices').select('product_id, price'),
    ])
    if (error) setError(error.message)
    setProducts(data ?? [])
    setPrices(
      Object.fromEntries((priceRows ?? []).filter((r) => r.product_id && r.price !== null).map((r) => [r.product_id as string, r.price as number]))
    )
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('product_view_preferences')
      .select('folder_mode_enabled')
      .eq('member_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setFolderMode(data.folder_mode_enabled)
      })
  }, [profile])

  const toggleFolderMode = async (v: boolean) => {
    setFolderMode(v)
    if (!v) clearRememberedProductFolder()
    if (!profile) return
    await supabase.from('product_view_preferences').upsert({ member_id: profile.id, folder_mode_enabled: v })
  }

  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    const priceStr = prices[p.id] !== undefined ? String(prices[p.id]) : ''
    return p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)) || priceStr.includes(q)
  })

  const submitAdd = async () => {
    if (!newName.trim()) {
      setError('請填寫產品名稱')
      return
    }
    setError(null)
    const tags = newTags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
    const { error } = await supabase
      .from('products')
      .insert({ name: newName.trim(), tags, created_by: profile?.id })
    if (error) {
      setError(error.message)
      return
    }
    setNewName('')
    setNewTags('')
    setAdding(false)
    load()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1 className="text-xl font-semibold">產品參考</h1>
        {isOwner && (
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setAdding((v) => !v)}
              className="bg-black text-white rounded px-4 py-1.5 text-sm"
            >
              ＋ 新增產品
            </button>
            <Link to="/process-templates" className="border rounded px-4 py-1.5 text-sm hover:bg-gray-50">
              編輯生產流程
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        {!folderMode && (
          <div className="relative max-w-sm flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="產品搜尋（名稱、tag 或價格）"
              className="w-full border rounded pl-9 pr-3 py-2 text-sm"
            />
          </div>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer ml-auto flex-shrink-0">
          <input type="checkbox" checked={folderMode} onChange={(e) => toggleFolderMode(e.target.checked)} />
          資料夾模式顯示
        </label>
        <button
          onClick={() => setShowFolderHelp(true)}
          className="w-5 h-5 rounded-full border text-xs text-gray-500 hover:bg-gray-100 flex items-center justify-center flex-shrink-0"
          title="資料夾模式說明"
        >
          ?
        </button>
      </div>

      {showFolderHelp && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowFolderHelp(false)}
        >
          <div className="bg-white rounded-lg p-5 max-w-md w-full text-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">資料夾模式說明</h3>
              <button onClick={() => setShowFolderHelp(false)} className="text-gray-400 hover:text-black text-lg leading-none">
                ✕
              </button>
            </div>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>在資料夾模式下，使用者可以創建屬於你自己的分類規則。</p>
              <p>譬如：在根目錄下創建「大頭柴系列」，裡面再創建「第一彈商品」、「第二彈商品」⋯⋯</p>
              <p>商品將依 tags 內容、以及目前的基礎價格，「自動解析」分派到所屬的資料夾內。</p>
              <p>刪除或重新命名資料夾，不會對實體產品資料造成影響。</p>
              <p>此設計下，一個產品可以分屬於「多個地方呈現」。</p>
              <p>
                譬如可以創造資料夾「880 元系列」，未來如果有在商品內新增 tag：880，則他會分別呈現於原本依照彈數排序之位置，以及「880
                元系列」資料夾位置。
              </p>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {adding && (
        <div className="border rounded-lg p-4 mb-4 bg-gray-50 max-w-md">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="產品名稱，例如：坐柴"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder="Tags，用逗號分隔，例如：木雕,柴犬,大頭柴,第一彈"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={submitAdd} className="bg-black text-white rounded px-3 py-1.5 text-sm">
                建立
              </button>
              <button
                onClick={() => setAdding(false)}
                className="border rounded px-3 py-1.5 text-sm hover:bg-gray-100"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div>載入中…</div>
      ) : folderMode ? (
        <ProductFolderBrowser products={products} prices={prices} />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">{products.length === 0 ? '尚無產品' : '找不到符合的產品'}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to={`/products/${p.id}`}
              className="border rounded-lg p-3 hover:border-gray-400 hover:bg-gray-50 block"
            >
              <p className="font-medium text-sm mb-1">{p.name}</p>
              {prices[p.id] !== undefined && <p className="text-xs text-gray-500 mb-1">${prices[p.id]}</p>}
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <span key={t} className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
