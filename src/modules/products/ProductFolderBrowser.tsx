import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import type { Tables } from '@/shared/types/database'

type Product = Tables<'products'>
type ProductFolder = Tables<'product_folders'>

// A product "belongs" to a folder purely because one of its tags is a
// literal substring of the folder's name — nothing is ever stored, so this
// is recomputed on every render from whatever the current tags/name are.
function productMatchesFolder(product: Product, folderName: string): boolean {
  return product.tags.some((tag) => tag.trim() !== '' && folderName.includes(tag))
}

function collectDescendantIds(folderId: string, all: ProductFolder[]): Set<string> {
  const ids = new Set<string>()
  const queue = [folderId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const f of all) {
      if (f.parent_id === current && !ids.has(f.id)) {
        ids.add(f.id)
        queue.push(f.id)
      }
    }
  }
  return ids
}

export function ProductFolderBrowser({ products }: { products: Product[] }) {
  const { profile } = useAuth()
  const [folders, setFolders] = useState<ProductFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('product_folders')
      .select('*')
      .eq('owner_member_id', profile.id)
      .then(({ data }) => {
        setFolders(data ?? [])
        setLoading(false)
      })
  }, [profile])

  if (loading) return <div>載入中…</div>

  // ancestors from root down to (but not including) the current folder
  const path: ProductFolder[] = []
  var walk = currentFolderId
  while (walk) {
    var f = folders.find((x) => x.id === walk)
    if (!f) break
    path.unshift(f)
    walk = f.parent_id
  }

  const childFolders = folders
    .filter((f) => f.parent_id === currentFolderId)
    .sort((a, b) => a.sort_order - b.sort_order)

  // products matching every folder name along the current path (cumulative
  // AND as you drill down); root (empty path) matches everything
  const matchingProducts = products.filter((p) => path.every((f) => productMatchesFolder(p, f.name)))
  // a product with a more specific home in a direct child folder surfaces
  // there instead, so it doesn't also clutter this level
  const visibleProducts = matchingProducts.filter((p) => !childFolders.some((child) => productMatchesFolder(p, child.name)))

  const createFolder = async () => {
    var clean = newFolderName.trim()
    if (!clean || !profile) return
    setError(null)
    var siblingOrders = childFolders.map((f) => f.sort_order)
    var sortOrder = siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 0
    const { data, error } = await supabase
      .from('product_folders')
      .insert({ owner_member_id: profile.id, parent_id: currentFolderId, name: clean, sort_order: sortOrder })
      .select()
      .single()
    if (error || !data) {
      setError(error?.message ?? '建立失敗')
      return
    }
    setFolders((prev) => [...prev, data])
    setCreating(false)
    setNewFolderName('')
  }

  const renameFolder = async (id: string) => {
    var clean = renameValue.trim()
    if (!clean) {
      setRenamingId(null)
      return
    }
    setError(null)
    const { error } = await supabase.from('product_folders').update({ name: clean }).eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: clean } : f)))
    setRenamingId(null)
  }

  const deleteFolder = async (folder: ProductFolder) => {
    var descendantIds = collectDescendantIds(folder.id, folders)
    var confirmMsg =
      descendantIds.size > 0
        ? `確定要刪除資料夾「${folder.name}」嗎？裡面的子資料夾也會一併刪除，此動作無法復原。`
        : `確定要刪除資料夾「${folder.name}」嗎？此動作無法復原。`
    if (!window.confirm(confirmMsg)) return
    setError(null)
    const { error } = await supabase.from('product_folders').delete().eq('id', folder.id)
    if (error) {
      setError(error.message)
      return
    }
    setFolders((prev) => prev.filter((f) => f.id !== folder.id && !descendantIds.has(f.id)))
    if (currentFolderId === folder.id || descendantIds.has(currentFolderId ?? '')) {
      setCurrentFolderId(folder.parent_id)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1 text-sm text-gray-500 mb-3 flex-wrap">
        <button onClick={() => setCurrentFolderId(null)} className="hover:underline hover:text-black">
          根目錄
        </button>
        {path.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <span>/</span>
            <button onClick={() => setCurrentFolderId(f.id)} className="hover:underline hover:text-black">
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg p-3 text-sm text-blue-700 hover:bg-blue-100 flex items-center justify-center min-h-[64px]"
          >
            ＋ 新增資料夾
          </button>
        ) : (
          <div className="border-2 border-blue-300 bg-blue-50 rounded-lg p-3">
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              placeholder="資料夾名稱"
              className="w-full border rounded px-2 py-1 text-sm mb-1"
            />
            {newFolderName.trim() && (
              <p className="text-[11px] text-blue-700 mb-1">
                目前符合 {matchingProducts.filter((p) => productMatchesFolder(p, newFolderName.trim())).length} 個商品
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={createFolder} className="bg-black text-white rounded px-2 py-1 text-xs">
                建立
              </button>
              <button
                onClick={() => {
                  setCreating(false)
                  setNewFolderName('')
                }}
                className="border rounded px-2 py-1 text-xs hover:bg-gray-100"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {childFolders.map((f) =>
          renamingId === f.id ? (
            <div key={f.id} className="border-2 border-blue-300 bg-blue-50 rounded-lg p-3">
              <input
                autoFocus
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && renameFolder(f.id)}
                className="w-full border rounded px-2 py-1 text-sm mb-1"
              />
              {renameValue.trim() && (
                <p className="text-[11px] text-blue-700 mb-1">
                  目前符合 {matchingProducts.filter((p) => productMatchesFolder(p, renameValue.trim())).length} 個商品
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => renameFolder(f.id)} className="bg-black text-white rounded px-2 py-1 text-xs">
                  儲存
                </button>
                <button onClick={() => setRenamingId(null)} className="border rounded px-2 py-1 text-xs hover:bg-gray-100">
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div key={f.id} className="border border-blue-200 bg-blue-50 rounded-lg p-3 hover:border-blue-400">
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentFolderId(f.id)} className="flex-1 min-w-0 text-left">
                  <p className="font-bold text-sm truncate">📁 {f.name}</p>
                </button>
                <button
                  onClick={() => setExpandedMenuId((cur) => (cur === f.id ? null : f.id))}
                  className="text-xs border border-blue-300 rounded px-1.5 py-0.5 text-blue-700 hover:bg-blue-100 flex-shrink-0"
                  title="管理資料夾"
                >
                  M
                </button>
              </div>
              {expandedMenuId === f.id && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      setRenamingId(f.id)
                      setRenameValue(f.name)
                      setExpandedMenuId(null)
                    }}
                    className="text-xs text-blue-700 underline"
                  >
                    重新命名
                  </button>
                  <button onClick={() => deleteFolder(f)} className="text-xs text-red-600 underline">
                    刪除
                  </button>
                </div>
              )}
            </div>
          )
        )}

        {visibleProducts.map((p) => (
          <Link key={p.id} to={`/products/${p.id}`} className="border rounded-lg p-3 hover:border-gray-400 hover:bg-gray-50 block">
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

      {childFolders.length === 0 && visibleProducts.length === 0 && (
        <p className="text-sm text-gray-400 mt-3">這個資料夾目前是空的</p>
      )}
    </div>
  )
}
