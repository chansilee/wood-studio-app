import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { productMatchesFolder } from '@/modules/products/ProductFolderBrowser'
import {
  acquireInventoryLock,
  fetchInventoryLock,
  releaseInventoryLock,
  saveInventoryDraft,
  touchInventoryLock,
} from '@/shared/lib/inventoryLock'
import type { Tables } from '@/shared/types/database'

type Product = Tables<'products'>
type ProductFolder = Tables<'product_folders'>
type TagRow = { id: string; product_id: string; label: string; pos_x: number; pos_y: number }
type CategoryBoxRow = { product_id: string; name: string; pos_x: number; pos_y: number; width: number; height: number }
const UNCATEGORIZED = '未分類'

function cellKey(productId: string, tagId: string): string {
  return `${productId}::${tagId}`
}

// A browse tree mirroring 產品參考's 資料夾模式 (same folders, same
// tag-substring matching) — click a node to narrow the right-hand table to
// that folder's products, same "cumulative AND down the path" rule. Also
// drag-reorderable among siblings, same live-shuffle-while-dragging pattern
// as ProductFolderBrowser's cards — a drag can only ever land within the
// group it started in (checked via dragGroupParentId), so it can never cross
// levels even though every level is visible in the tree at once.
function FolderTreeNode({
  folder,
  depth,
  allFolders,
  expandedIds,
  onToggleExpand,
  selectedFolderId,
  onSelect,
  draggedFolderId,
  dragGroupParentId,
  dragOrderIds,
  onDragStart,
  onDragOverNode,
  onDragEnd,
}: {
  folder: ProductFolder
  depth: number
  allFolders: ProductFolder[]
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  selectedFolderId: string | null
  onSelect: (id: string) => void
  draggedFolderId: string | null
  dragGroupParentId: string | null | undefined
  dragOrderIds: string[] | null
  onDragStart: (folder: ProductFolder) => void
  onDragOverNode: (targetId: string, targetParentId: string | null) => void
  onDragEnd: () => void
}) {
  const rawChildren = allFolders.filter((f) => f.parent_id === folder.id).sort((a, b) => a.sort_order - b.sort_order)
  const children =
    dragGroupParentId === folder.id && dragOrderIds
      ? (dragOrderIds.map((id) => rawChildren.find((f) => f.id === id)).filter(Boolean) as ProductFolder[])
      : rawChildren
  const isExpanded = expandedIds.has(folder.id)
  const isSelected = selectedFolderId === folder.id
  return (
    <div>
      <div
        draggable
        onDragStart={() => onDragStart(folder)}
        onDragOver={(e) => {
          e.preventDefault()
          onDragOverNode(folder.id, folder.parent_id)
        }}
        onDragEnd={onDragEnd}
        onClick={() => onSelect(folder.id)}
        style={{ paddingLeft: depth * 16 + 4 }}
        className={`flex items-center gap-1 pr-2 py-1 rounded text-sm cursor-grab active:cursor-grabbing ${isSelected ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'} ${draggedFolderId === folder.id ? 'opacity-40' : ''}`}
      >
        {children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(folder.id)
            }}
            className="w-4 flex-shrink-0 text-gray-500"
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <span className="truncate">📁 {folder.name}</span>
      </div>
      {isExpanded &&
        children.map((c) => (
          <FolderTreeNode
            key={c.id}
            folder={c}
            depth={depth + 1}
            allFolders={allFolders}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
            draggedFolderId={draggedFolderId}
            dragGroupParentId={dragGroupParentId}
            dragOrderIds={dragOrderIds}
            onDragStart={onDragStart}
            onDragOverNode={onDragOverNode}
            onDragEnd={onDragEnd}
          />
        ))}
    </div>
  )
}

export function InventoryOverviewPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [products, setProducts] = useState<Product[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [tagsByProduct, setTagsByProduct] = useState<Record<string, TagRow[]>>({})
  const [categoryBoxesByProduct, setCategoryBoxesByProduct] = useState<Record<string, CategoryBoxRow[]>>({})
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [columnFilterText, setColumnFilterText] = useState('')
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set())
  const [folders, setFolders] = useState<ProductFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null)
  const [dragGroupParentId, setDragGroupParentId] = useState<string | null | undefined>(undefined)
  const [dragOrderIds, setDragOrderIds] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [lockedByOtherName, setLockedByOtherName] = useState<string | null>(null)
  const [hasResumableDraft, setHasResumableDraft] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: productRows, error: prodErr }, { data: priceRows }] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('current_product_prices').select('product_id, price'),
    ])
    if (prodErr) setError(prodErr.message)
    const prods = productRows ?? []
    setProducts(prods)
    setPrices(
      Object.fromEntries((priceRows ?? []).filter((r) => r.product_id && r.price !== null).map((r) => [r.product_id as string, r.price as number]))
    )

    const productIds = prods.map((p) => p.id)
    if (productIds.length === 0) {
      setTagsByProduct({})
      setCategoryBoxesByProduct({})
      setBalances({})
      setLoading(false)
      return
    }
    const [{ data: tagNodes }, { data: balanceRows }, { data: boxRows }] = await Promise.all([
      supabase
        .from('process_nodes')
        .select('id, product_id, label, pos_x, pos_y')
        .eq('kind', 'tag')
        .neq('label', '開始')
        .in('product_id', productIds),
      supabase.from('tag_balances').select('product_id, tag_id, available_qty').in('product_id', productIds),
      supabase.from('category_boxes').select('product_id, name, pos_x, pos_y, width, height').in('product_id', productIds),
    ])
    const grouped: Record<string, TagRow[]> = {}
    for (const n of tagNodes ?? []) {
      if (!n.product_id) continue
      const row: TagRow = { id: n.id, product_id: n.product_id, label: n.label, pos_x: n.pos_x, pos_y: n.pos_y }
      ;(grouped[n.product_id] ??= []).push(row)
    }
    setTagsByProduct(grouped)
    const groupedBoxes: Record<string, CategoryBoxRow[]> = {}
    for (const b of boxRows ?? []) {
      if (!b.product_id) continue
      ;(groupedBoxes[b.product_id] ??= []).push(b as CategoryBoxRow)
    }
    setCategoryBoxesByProduct(groupedBoxes)
    setBalances(
      Object.fromEntries(
        (balanceRows ?? [])
          .filter((r) => r.product_id && r.tag_id)
          .map((r) => [cellKey(r.product_id as string, r.tag_id as string), r.available_qty ?? 0])
      )
    )
    setLoading(false)
  }

  useEffect(() => {
    supabase.rpc('resolve_matured_wait_logs').then(() => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('product_folders')
      .select('*')
      .eq('owner_member_id', profile.id)
      .then(({ data }) => setFolders(data ?? []))
  }, [profile])

  const toggleFolderExpand = (id: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startFolderDrag = (f: ProductFolder) => {
    setDraggedFolderId(f.id)
    setDragGroupParentId(f.parent_id)
    const siblings = folders.filter((x) => x.parent_id === f.parent_id).sort((a, b) => a.sort_order - b.sort_order)
    setDragOrderIds(siblings.map((s) => s.id))
  }

  const dragOverFolder = (targetId: string, targetParentId: string | null) => {
    if (!draggedFolderId || draggedFolderId === targetId || !dragOrderIds) return
    if (targetParentId !== dragGroupParentId) return // a different level — never a valid drop target
    const from = dragOrderIds.indexOf(draggedFolderId)
    const to = dragOrderIds.indexOf(targetId)
    if (from === -1 || to === -1 || from === to) return
    const next = [...dragOrderIds]
    next.splice(from, 1)
    next.splice(to, 0, draggedFolderId)
    setDragOrderIds(next)
  }

  const endFolderDrag = async () => {
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
    setDragGroupParentId(undefined)
    setDragOrderIds(null)
  }

  // ancestors from root down to (but not including) the selected folder;
  // selecting the root itself yields an empty path, which matches everyone
  const folderPath: ProductFolder[] = []
  {
    let walk = selectedFolderId
    while (walk) {
      const f = folders.find((x) => x.id === walk)
      if (!f) break
      folderPath.unshift(f)
      walk = f.parent_id
    }
  }
  const rawRootFolders = folders.filter((f) => f.parent_id === null).sort((a, b) => a.sort_order - b.sort_order)
  const rootFolders =
    dragGroupParentId === null && dragOrderIds
      ? (dragOrderIds.map((id) => rawRootFolders.find((f) => f.id === id)).filter(Boolean) as ProductFolder[])
      : rawRootFolders

  useEffect(() => {
    if (editing) return
    const checkLock = () => {
      fetchInventoryLock().then((lock) => {
        setLockedByOtherName(lock.lockedBy && !lock.isExpired && lock.lockedBy !== profile?.id ? lock.lockedByName ?? '負責人' : null)
        setHasResumableDraft(!!(lock.lockedBy && !lock.isExpired && lock.lockedBy === profile?.id))
      })
    }
    checkLock()
    // re-check periodically so the button label falls back to "開啟盤點修正"
    // on its own once the 15-minute idle window lapses, without needing a reload
    const interval = setInterval(checkLock, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, profile?.id])

  const matchesFilter = (p: Product) => {
    const q = filterText.trim().toLowerCase()
    if (!q) return true
    const priceStr = prices[p.id] !== undefined ? String(prices[p.id]) : ''
    return p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)) || priceStr.includes(q)
  }

  const filteredProducts = products.filter(
    (p) => matchesFilter(p) && folderPath.every((f) => productMatchesFolder(p, f.name, prices[p.id]))
  )
  const columnFilterTerms = columnFilterText
    .split(/[,，]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  // every distinct tag label among the filtered products (respects 水平篩選
  // text but NOT the category checkboxes below) — this stays the source of
  // truth for which cells get tracked while editing, so hiding a category's
  // columns never drops its draft values
  const allLabels = Array.from(
    new Set(filteredProducts.flatMap((p) => (tagsByProduct[p.id] ?? []).map((t) => t.label)))
  ).filter((label) => columnFilterTerms.length === 0 || columnFilterTerms.some((t) => label.toLowerCase().includes(t)))

  const tagFor = (productId: string, label: string) => (tagsByProduct[productId] ?? []).find((t) => t.label === label)

  // membership is spatial, not a stored field: a tag belongs to a 分類虛線框
  // whenever its position falls inside that box's bounds. A tag can fall
  // inside several boxes (kept as a Set so the same-named box never counts
  // twice) and a label can therefore legitimately appear under more than one
  // category group.
  const categoriesForTag = (productId: string, tag: TagRow): Set<string> => {
    const boxes = categoryBoxesByProduct[productId] ?? []
    const cats = new Set<string>()
    for (const b of boxes) {
      if (tag.pos_x >= b.pos_x && tag.pos_x <= b.pos_x + b.width && tag.pos_y >= b.pos_y && tag.pos_y <= b.pos_y + b.height) {
        cats.add(b.name)
      }
    }
    return cats
  }

  const categoriesForLabel = (label: string): Set<string> => {
    const cats = new Set<string>()
    for (const p of filteredProducts) {
      const t = tagFor(p.id, label)
      if (!t) continue
      for (const c of categoriesForTag(p.id, t)) cats.add(c)
    }
    if (cats.size === 0) cats.add(UNCATEGORIZED)
    return cats
  }

  const categoriesInOrder = Array.from(new Set(allLabels.flatMap((l) => Array.from(categoriesForLabel(l))))).sort((a, b) =>
    a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b, 'zh-Hant')
  )
  const columnGroups = categoriesInOrder
    .filter((c) => !hiddenCategories.has(c))
    .map((category) => ({
      category,
      labels: allLabels.filter((l) => categoriesForLabel(l).has(category)).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    }))

  const toggleCategoryVisible = (category: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const baselineFor = (key: string) => balances[key] ?? 0

  // numeric value actually shown in a cell right now, whether or not it's
  // being edited — used to compute the live subtotal/total rows so they
  // update as you type instead of only reflecting last-saved numbers
  const cellValue = (key: string): number => {
    if (!editing) return baselineFor(key)
    const n = Number(editValues[key])
    return Number.isFinite(n) ? n : 0
  }

  const productCategoryTotal = (productId: string, labels: string[]): number =>
    labels.reduce((sum, label) => {
      const tag = tagFor(productId, label)
      return tag ? sum + cellValue(cellKey(productId, tag.id)) : sum
    }, 0)

  const columnGrandTotal = (label: string): number =>
    filteredProducts.reduce((sum, p) => {
      const tag = tagFor(p.id, label)
      return tag ? sum + cellValue(cellKey(p.id, tag.id)) : sum
    }, 0)

  const categoryGrandTotal = (labels: string[]): number => labels.reduce((sum, label) => sum + columnGrandTotal(label), 0)

  const startEditingFresh = () => {
    const initial: Record<string, string> = {}
    for (const p of filteredProducts) {
      for (const label of allLabels) {
        const tag = tagFor(p.id, label)
        if (tag) initial[cellKey(p.id, tag.id)] = String(baselineFor(cellKey(p.id, tag.id)))
      }
    }
    setEditValues(initial)
    setReason('')
    setEditing(true)
  }

  const startEditingFromDraft = (draft: Record<string, number>, draftReason: string) => {
    const initial: Record<string, string> = {}
    for (const p of filteredProducts) {
      for (const label of allLabels) {
        const tag = tagFor(p.id, label)
        if (!tag) continue
        const key = cellKey(p.id, tag.id)
        initial[key] = key in draft ? String(draft[key]) : String(baselineFor(key))
      }
    }
    setEditValues(initial)
    setReason(draftReason)
    setEditing(true)
  }

  const openEditMode = async () => {
    if (!profile) return
    setError(null)
    const lock = await fetchInventoryLock()
    if (!lock.lockedBy || lock.isExpired) {
      await acquireInventoryLock(profile.id)
      startEditingFresh()
      return
    }
    if (lock.lockedBy === profile.id) {
      const resume = window.confirm(
        '偵測到您有尚未完成的盤點修正，要繼續上次的進度嗎？\n(取消將會捨棄暫存的輸入內容，並釋放鎖定)'
      )
      if (resume) {
        await touchInventoryLock()
        startEditingFromDraft(lock.draft, lock.reason)
      } else {
        await releaseInventoryLock()
        await acquireInventoryLock(profile.id)
        startEditingFresh()
      }
      return
    }
    window.alert(`${lock.lockedByName ?? '負責人'}正在進行盤點修正，請稍晚再試`)
  }

  const currentDraftDiff = (values: Record<string, string>): Record<string, number> => {
    const diff: Record<string, number> = {}
    for (const [key, v] of Object.entries(values)) {
      const num = Number(v)
      if (Number.isFinite(num) && num !== baselineFor(key)) diff[key] = num
    }
    return diff
  }

  const handleCellChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleCellBlur = () => {
    saveInventoryDraft(currentDraftDiff(editValues), reason)
  }

  const handleReasonBlur = () => {
    saveInventoryDraft(currentDraftDiff(editValues), reason)
  }

  const cancelEditing = async () => {
    if (!window.confirm('確定要放棄這次盤點修正嗎？所有尚未送出的輸入都會被捨棄。')) return
    await releaseInventoryLock()
    setEditing(false)
    setEditValues({})
    setReason('')
  }

  const submitCorrection = async () => {
    setError(null)
    const diff = currentDraftDiff(editValues)
    const entries = Object.entries(diff)
    if (entries.length === 0) {
      setError('沒有任何格子的數字被修改')
      return
    }
    for (const [, num] of entries) {
      if (!Number.isInteger(num) || num < 0) {
        setError('修正後的數量必須是不小於 0 的整數')
        return
      }
    }
    setSaving(true)
    const rows = entries.map(([key, num]) => {
      const [productId, tagId] = key.split('::')
      return {
        product_id: productId,
        tag_id: tagId,
        qty_delta: num - baselineFor(key),
        reason: reason.trim() || null,
        adjusted_by: profile?.id,
      }
    })
    const { error: insErr } = await supabase.from('stock_adjustments').insert(rows)
    if (insErr) {
      setSaving(false)
      setError(insErr.message)
      return
    }
    await releaseInventoryLock()
    setSaving(false)
    setEditing(false)
    setEditValues({})
    setReason('')
    setMessage(`已送出 ${entries.length} 筆盤點修正`)
    load()
  }

  if (loading) return <div className="p-6">載入中…</div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">總數瀏覽</h1>
        {isOwner && !editing && (
          <button onClick={openEditMode} className="bg-red-600 text-white rounded px-4 py-1.5 text-sm hover:bg-red-700">
            {hasResumableDraft ? '繼續盤點修正' : '開啟盤點修正'}
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-56 flex-shrink-0 border rounded-lg p-2 max-h-64 md:max-h-none md:self-stretch overflow-y-auto">
          <div
            onClick={() => setSelectedFolderId(null)}
            className={`flex items-center gap-1 pr-2 py-1 rounded text-sm cursor-pointer ${selectedFolderId === null ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'}`}
          >
            <span className="w-4 flex-shrink-0" />
            <span>🗂 根目錄</span>
          </div>
          {rootFolders.map((f) => (
            <FolderTreeNode
              key={f.id}
              folder={f}
              depth={1}
              allFolders={folders}
              expandedIds={expandedFolderIds}
              onToggleExpand={toggleFolderExpand}
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
              draggedFolderId={draggedFolderId}
              dragGroupParentId={dragGroupParentId}
              dragOrderIds={dragOrderIds}
              onDragStart={startFolderDrag}
              onDragOverNode={dragOverFolder}
              onDragEnd={endFolderDrag}
            />
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="垂直篩選（產品名稱、tag 或價格，例如「第一彈」）"
              className="w-full max-w-sm border rounded px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={columnFilterText}
              onChange={(e) => setColumnFilterText(e.target.value)}
              placeholder="水平篩選（標籤，逗點分隔多筆，例如「粗胚,細胚」）"
              className="w-full max-w-sm border rounded px-3 py-2 text-sm"
            />
          </div>

          {lockedByOtherName && !editing && (
            <p className="text-xs text-amber-700 mb-3">目前由 {lockedByOtherName} 進行盤點修正中，總表仍可正常查看。</p>
          )}
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          {message && <p className="text-green-700 text-sm mb-3">{message}</p>}

          {editing && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-3 mb-3">
              <p className="text-xs text-red-700 mb-2">
                盤點修正模式：直接把格子改成「現在盤點到的數量」，系統會自動換算增減量。改完後按「送出盤點修正」才會真正寫入；離開此頁面或15分鐘沒有動作，鎖定會自動釋放。
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-gray-600">本次盤點原因（選填）</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onBlur={handleReasonBlur}
                  placeholder="例如：2026/09/10 盤點"
                  className="border rounded px-2 py-1 text-sm flex-1 min-w-[160px]"
                />
                <button
                  onClick={submitCorrection}
                  disabled={saving}
                  className="bg-black text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
                >
                  {saving ? '送出中…' : '送出盤點修正'}
                </button>
                <button onClick={cancelEditing} disabled={saving} className="border rounded px-4 py-1.5 text-sm hover:bg-gray-50">
                  取消盤點
                </button>
              </div>
            </div>
          )}

          {allLabels.length === 0 ? (
            <p className="text-sm text-gray-400">沒有符合條件的產品或標籤</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-2 text-xs text-gray-600">
                <span className="text-gray-400">分類篩選：</span>
                {categoriesInOrder.map((c) => (
                  <label key={c} className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={!hiddenCategories.has(c)} onChange={() => toggleCategoryVisible(c)} />
                    {c}
                  </label>
                ))}
              </div>

              {columnGroups.length === 0 ? (
                <p className="text-sm text-gray-400">沒有勾選任何分類</p>
              ) : (
                <div className="border rounded-lg overflow-auto">
                  <table className="text-sm border-collapse w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th rowSpan={2} className="text-left px-3 py-2 sticky left-0 bg-gray-50 whitespace-nowrap align-bottom">
                          產品
                        </th>
                        {columnGroups.map((g) => (
                          <th
                            key={g.category}
                            colSpan={g.labels.length + 1}
                            className="text-center px-3 py-1 border-b border-l text-gray-500 font-medium"
                          >
                            {g.category}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-gray-50 border-b">
                        {columnGroups.map((g) => (
                          <Fragment key={g.category}>
                            {g.labels.map((label, idx) => (
                              <th
                                key={label}
                                className={`text-right px-3 py-2 whitespace-nowrap ${idx === 0 ? 'border-l' : ''}`}
                                style={{ fontFamily: 'ui-monospace, monospace' }}
                              >
                                {label}
                              </th>
                            ))}
                            <th className="text-right px-3 py-2 whitespace-nowrap text-gray-500 bg-gray-100">{g.category} 合計</th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => (
                        <tr key={p.id} className="border-b">
                          <td className="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap">
                            <Link to={`/products/${p.id}`} className="text-blue-700 hover:underline">
                              {p.name}
                            </Link>
                          </td>
                          {columnGroups.map((g) => (
                            <Fragment key={g.category}>
                              {g.labels.map((label, idx) => {
                                const tag = tagFor(p.id, label)
                                if (!tag) {
                                  return (
                                    <td key={label} className={`px-3 py-1.5 text-right text-gray-300 ${idx === 0 ? 'border-l' : ''}`}>
                                      －
                                    </td>
                                  )
                                }
                                const key = cellKey(p.id, tag.id)
                                const changed = editing && Number(editValues[key]) !== baselineFor(key)
                                return (
                                  <td
                                    key={label}
                                    className={`px-3 py-1.5 text-right ${idx === 0 ? 'border-l' : ''} ${changed ? 'bg-yellow-100' : ''}`}
                                  >
                                    {editing ? (
                                      <input
                                        type="number"
                                        value={editValues[key] ?? ''}
                                        onChange={(e) => handleCellChange(key, e.target.value)}
                                        onBlur={handleCellBlur}
                                        className="w-16 border rounded px-1 py-0.5 text-right text-sm"
                                      />
                                    ) : (
                                      baselineFor(key)
                                    )}
                                  </td>
                                )
                              })}
                              <td className="px-3 py-1.5 text-right text-gray-600 bg-gray-50 font-medium">
                                {productCategoryTotal(p.id, g.labels)}
                              </td>
                            </Fragment>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2">
                        <td className="px-3 py-1.5 sticky left-0 bg-gray-50 font-medium whitespace-nowrap">總計</td>
                        {columnGroups.map((g) => (
                          <Fragment key={g.category}>
                            {g.labels.map((label, idx) => (
                              <td key={label} className={`px-3 py-1.5 text-right font-medium bg-gray-50 ${idx === 0 ? 'border-l' : ''}`}>
                                {columnGrandTotal(label)}
                              </td>
                            ))}
                            <td className="px-3 py-1.5 text-right font-medium bg-gray-100">{categoryGrandTotal(g.labels)}</td>
                          </Fragment>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
