import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
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
  const [newCategory, setNewCategory] = useState('')
  const [newTags, setNewTags] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    setProducts(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q))
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
      .insert({ name: newName.trim(), category: newCategory.trim() || null, tags, created_by: profile?.id })
    if (error) {
      setError(error.message)
      return
    }
    setNewName('')
    setNewCategory('')
    setNewTags('')
    setAdding(false)
    load()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1 className="text-xl font-semibold">產品參考</h1>
        {isOwner && (
          <div className="flex items-center gap-2">
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

      <div className="relative mb-4 max-w-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="產品搜尋（名稱或 tag）"
          className="w-full border rounded pl-9 pr-3 py-2 text-sm"
        />
      </div>

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
              placeholder="類別，例如：木雕柴犬"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
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
              {p.category && <p className="text-xs text-gray-500 mb-1">{p.category}</p>}
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
