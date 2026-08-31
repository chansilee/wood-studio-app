import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import type { Tables } from '@/shared/types/database'

type Product = Tables<'products'>
type ProductFolder = Tables<'product_folders'>

// A product "belongs" to a folder purely because one of its tags — or its
// current price, treated the same way — is a literal substring of the
// folder's name. Nothing is ever stored, so this is recomputed on every
// render from whatever the current tags/price/name are.
export function productMatchesFolder(product: Product, folderName: string, price: number | undefined): boolean {
  if (product.tags.some((tag) => tag.trim() !== '' && folderName.includes(tag))) return true
  if (price !== undefined && folderName.includes(String(price))) return true
  return false
}

// root-down-to-folderId, e.g. [null, 大頭柴id, 第一彈id] — used to seed
// back/forward history when resuming at a remembered folder after a
// remount, so ← still has the ancestor trail to walk back through instead
// of looking like this is the very first navigation
function ancestorChain(folderId: string | null, all: ProductFolder[]): (string | null)[] {
  const chain: (string | null)[] = []
  let walk = folderId
  while (walk) {
    chain.unshift(walk)
    const f = all.find((x) => x.id === walk)
    walk = f ? f.parent_id : null
  }
  chain.unshift(null)
  return chain
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

// remembers the last folder browsed this tab session, so navigating into a
// product and back via "返回產品參考" resumes where you were instead of
// resetting to the root — deliberately sessionStorage, not a synced
// preference, since it's transient "where was I" state, not a setting
const FOLDER_STORAGE_KEY = 'productFolderLastId'

function readStoredFolderId(): string | null {
  try {
    return sessionStorage.getItem(FOLDER_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredFolderId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(FOLDER_STORAGE_KEY, id)
    else sessionStorage.removeItem(FOLDER_STORAGE_KEY)
  } catch {
    // ignore (private browsing etc.)
  }
}

// called from ProductsPage when 資料夾模式顯示 is turned off, so leaving
// folder mode always starts back at the root next time it's turned on
export function clearRememberedProductFolder() {
  writeStoredFolderId(null)
}

export function ProductFolderBrowser({ products, prices }: { products: Product[]; prices: Record<string, number> }) {
  const { profile } = useAuth()
  const [folders, setFolders] = useState<ProductFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [currentFolderId, setCurrentFolderIdState] = useState<string | null>(readStoredFolderId)
  const [creating, setCreating] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // drag-to-reorder among siblings: draggedFolderId is the card being
  // dragged; dragOrderIds is a live-reordered snapshot of the current
  // level's ids, shuffled in real time as the drag passes over other cards,
  // then persisted as the new sort_order once the drag ends
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null)
  const [dragOrderIds, setDragOrderIds] = useState<string[] | null>(null)

  // browser-style back/forward history: a stack of visited folder ids plus a
  // pointer into it, separate from currentFolderId itself so back/forward can
  // move the pointer without treating the move as a brand-new navigation
  const [historyStack, setHistoryStack] = useState<(string | null)[]>(() => [readStoredFolderId()])
  const [historyIndex, setHistoryIndex] = useState(0)

  const setCurrentFolderId = (id: string | null) => {
    setCurrentFolderIdState(id)
    writeStoredFolderId(id)
  }

  // user-initiated navigation (clicking a folder/breadcrumb): moves location
  // and records a new history entry, discarding any forward history
  const navigateTo = (id: string | null) => {
    setCurrentFolderId(id)
    setHistoryStack((prev) => [...prev.slice(0, historyIndex + 1), id])
    setHistoryIndex((i) => i + 1)
  }

  const goBack = () => {
    if (historyIndex === 0) return
    const newIndex = historyIndex - 1
    setCurrentFolderId(historyStack[newIndex])
    setHistoryIndex(newIndex)
  }

  const goForward = () => {
    if (historyIndex >= historyStack.length - 1) return
    const newIndex = historyIndex + 1
    setCurrentFolderId(historyStack[newIndex])
    setHistoryIndex(newIndex)
  }

  useEffect(() => {
    if (!profile) return
    supabase
      .from('product_folders')
      .select('*')
      .eq('owner_member_id', profile.id)
      .then(({ data }) => {
        var loaded = data ?? []
        setFolders(loaded)
        setLoading(false)
        // the remembered folder may have been renamed away/deleted since —
        // fall back to root rather than showing a dead end
        if (currentFolderId && !loaded.some((f) => f.id === currentFolderId)) {
          setCurrentFolderId(null)
          setHistoryStack([null])
          setHistoryIndex(0)
        } else {
          // resuming at a remembered folder (or root) after a fresh mount —
          // seed history with its real ancestor chain rather than a bare
          // single entry, so ← has something to go back through immediately
          const chain = ancestorChain(currentFolderId, loaded)
          setHistoryStack(chain)
          setHistoryIndex(chain.length - 1)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // while a drag is in progress, render dragOrderIds' live-shuffled order
  // instead of the DB-backed sort_order
  const displayChildFolders = dragOrderIds
    ? (dragOrderIds.map((id) => childFolders.find((f) => f.id === id)).filter(Boolean) as ProductFolder[])
    : childFolders

  const handleFolderDragOver = (targetId: string) => {
    if (!draggedFolderId || draggedFolderId === targetId || !dragOrderIds) return
    const from = dragOrderIds.indexOf(draggedFolderId)
    const to = dragOrderIds.indexOf(targetId)
    if (from === -1 || to === -1 || from === to) return
    const next = [...dragOrderIds]
    next.splice(from, 1)
    next.splice(to, 0, draggedFolderId)
    setDragOrderIds(next)
  }

  const handleFolderDragEnd = async () => {
    if (dragOrderIds) {
      const finalOrder = dragOrderIds
      setFolders((prev) =>
        prev.map((f) => {
          const idx = finalOrder.indexOf(f.id)
          return idx === -1 ? f : { ...f, sort_order: idx }
        })
      )
      await Promise.all(finalOrder.map((id, idx) => supabase.from('product_folders').update({ sort_order: idx }).eq('id', id)))
    }
    setDraggedFolderId(null)
    setDragOrderIds(null)
  }

  // products matching every folder name along the current path (cumulative
  // AND as you drill down); root (empty path) matches everything
  const matchingProducts = products.filter((p) => path.every((f) => productMatchesFolder(p, f.name, prices[p.id])))
  // a product with a more specific home in a direct child folder surfaces
  // there instead, so it doesn't also clutter this level
  const visibleProducts = matchingProducts.filter(
    (p) => !childFolders.some((child) => productMatchesFolder(p, child.name, prices[p.id]))
  )

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
      navigateTo(folder.parent_id)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={goBack}
          disabled={historyIndex === 0}
          className="flex items-center gap-1 px-2 h-7 rounded border text-sm text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-gray-100"
        >
          ← 回上一層
        </button>
        <button
          onClick={goForward}
          disabled={historyIndex >= historyStack.length - 1}
          className="flex items-center gap-1 px-2 h-7 rounded border text-sm text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-gray-100"
        >
          到下一層 →
        </button>
      </div>

      <div className="flex items-center gap-1 text-sm text-gray-500 mb-3 flex-wrap">
        <button onClick={() => navigateTo(null)} className="hover:underline hover:text-black">
          根目錄
        </button>
        {path.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <span>/</span>
            <button onClick={() => navigateTo(f.id)} className="hover:underline hover:text-black">
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
                目前符合 {matchingProducts.filter((p) => productMatchesFolder(p, newFolderName.trim(), prices[p.id])).length} 個商品
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

        {displayChildFolders.map((f) =>
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
                  目前符合 {matchingProducts.filter((p) => productMatchesFolder(p, renameValue.trim(), prices[p.id])).length} 個商品
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
            <div
              key={f.id}
              draggable
              onDragStart={() => {
                setDraggedFolderId(f.id)
                setDragOrderIds(childFolders.map((c) => c.id))
              }}
              onDragOver={(e) => {
                e.preventDefault()
                handleFolderDragOver(f.id)
              }}
              onDragEnd={handleFolderDragEnd}
              onClick={() => navigateTo(f.id)}
              className={`border border-blue-200 bg-blue-50 rounded-lg p-3 hover:border-blue-400 cursor-grab active:cursor-grabbing ${draggedFolderId === f.id ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-2">
                <p className="font-bold text-sm truncate flex-1 min-w-0">📁 {f.name}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpandedMenuId((cur) => (cur === f.id ? null : f.id))
                  }}
                  className="text-xs border border-blue-300 rounded px-1.5 py-0.5 text-blue-700 hover:bg-blue-100 flex-shrink-0"
                  title="管理資料夾"
                >
                  M
                </button>
              </div>
              {expandedMenuId === f.id && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setRenamingId(f.id)
                      setRenameValue(f.name)
                      setExpandedMenuId(null)
                    }}
                    className="text-xs text-blue-700 underline"
                  >
                    重新命名
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteFolder(f)
                    }}
                    className="text-xs text-red-600 underline"
                  >
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

      {childFolders.length === 0 && visibleProducts.length === 0 && (
        <p className="text-sm text-gray-400 mt-3">這個資料夾目前是空的</p>
      )}
    </div>
  )
}
