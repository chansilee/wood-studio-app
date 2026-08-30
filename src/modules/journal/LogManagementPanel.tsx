import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import { formatDateTime } from '@/shared/lib/date'
import { Combobox } from '@/shared/components/Combobox'
import { checkInventoryLockBlock } from '@/shared/lib/inventoryLock'
import type { Tables } from '@/shared/types/database'

type Product = Tables<'products'>
type NodeRow = Tables<'process_nodes'>

interface RecentAdjustment {
  id: string
  productName: string
  tagLabel: string
  qtyDelta: number
  reason: string | null
  adjustedAt: string
  adjustedByName: string
}

export function LogManagementPanel({
  enableDelete,
  onToggleDelete,
  enableEdit,
  onToggleEdit,
}: {
  enableDelete: boolean
  onToggleDelete: (v: boolean) => void
  enableEdit: boolean
  onToggleEdit: (v: boolean) => void
}) {
  const { profile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [tags, setTags] = useState<NodeRow[]>([])
  const [tagId, setTagId] = useState('')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [recentAdjustments, setRecentAdjustments] = useState<RecentAdjustment[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [linkSameTime, setLinkSameTime] = useState(false)

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .order('name')
      .then(({ data }) => setProducts(data ?? []))
    loadRecentAdjustments()
  }, [])

  useEffect(() => {
    if (!productId) {
      setTags([])
      setTagId('')
      return
    }
    supabase
      .from('process_nodes')
      .select('*')
      .eq('product_id', productId)
      .eq('kind', 'tag')
      .then(({ data }) => setTags((data ?? []).filter((t) => t.label !== '開始')))
  }, [productId])

  const loadRecentAdjustments = async () => {
    const { data: rows } = await supabase
      .from('stock_adjustments')
      .select('id, product_id, tag_id, qty_delta, reason, adjusted_at, adjusted_by')
      .order('adjusted_at', { ascending: false })
      .limit(10)
    const list = rows ?? []
    if (list.length === 0) {
      setRecentAdjustments([])
      return
    }
    const productIds = Array.from(new Set(list.map((r) => r.product_id)))
    const tagIds = Array.from(new Set(list.map((r) => r.tag_id)))
    const memberIds = Array.from(new Set(list.map((r) => r.adjusted_by).filter((x): x is string => !!x)))
    const [{ data: prods }, { data: nodes }, { data: members }] = await Promise.all([
      supabase.from('products').select('id, name').in('id', productIds),
      supabase.from('process_nodes').select('id, label').in('id', tagIds),
      supabase.from('profiles').select('id, display_name, preferred_display_name').in('id', memberIds),
    ])
    const prodMap = Object.fromEntries((prods ?? []).map((p) => [p.id, p.name]))
    const nodeMap = Object.fromEntries((nodes ?? []).map((n) => [n.id, n.label]))
    const memberMap = Object.fromEntries((members ?? []).map((m) => [m.id, effectiveDisplayName(m)]))
    const mapped = list.map((r) => ({
      id: r.id,
      productName: prodMap[r.product_id] ?? '?',
      tagLabel: nodeMap[r.tag_id] ?? '?',
      qtyDelta: r.qty_delta,
      reason: r.reason,
      adjustedAt: r.adjusted_at,
      adjustedByName: r.adjusted_by ? (memberMap[r.adjusted_by] ?? '?') : '?',
    }))
    setRecentAdjustments(mapped)
    setSelectedIds((prev) => new Set(Array.from(prev).filter((id) => mapped.some((r) => r.id === id))))
  }

  const toggleAdjustmentSelection = (a: RecentAdjustment) => {
    const group = linkSameTime ? recentAdjustments.filter((r) => r.adjustedAt === a.adjustedAt).map((r) => r.id) : [a.id]
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(a.id)) {
        group.forEach((id) => next.delete(id))
      } else {
        group.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const bulkDeleteAdjustments = async () => {
    setError(null)
    if (profile) {
      const blockMsg = await checkInventoryLockBlock(profile.id)
      if (blockMsg) {
        window.alert(blockMsg)
        return
      }
    }
    if (!window.confirm(`確定要刪除這 ${selectedIds.size} 筆校正紀錄嗎？此動作無法復原。`)) return
    const { error: delErr } = await supabase.from('stock_adjustments').delete().in('id', Array.from(selectedIds))
    if (delErr) {
      setError(delErr.message)
      return
    }
    setSelectedIds(new Set())
    loadRecentAdjustments()
  }

  const submitAdjustment = async () => {
    setError(null)
    setMessage(null)
    if (profile) {
      const blockMsg = await checkInventoryLockBlock(profile.id)
      if (blockMsg) {
        setError(blockMsg)
        return
      }
    }
    if (!productId || !tagId) {
      setError('請選擇產品與狀態標籤')
      return
    }
    const qty = Number(delta)
    if (!qty || !Number.isInteger(qty)) {
      setError('請填寫校正數量（整數，正數表示增加，負數表示減少）')
      return
    }
    setSubmitting(true)
    const { error: insErr } = await supabase.from('stock_adjustments').insert({
      product_id: productId,
      tag_id: tagId,
      qty_delta: qty,
      reason: reason.trim() || null,
      adjusted_by: profile?.id,
    })
    setSubmitting(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    setMessage('已新增校正紀錄')
    setDelta('')
    setReason('')
    loadRecentAdjustments()
  }

  const deleteAdjustment = async (id: string) => {
    setError(null)
    if (profile) {
      const blockMsg = await checkInventoryLockBlock(profile.id)
      if (blockMsg) {
        window.alert(blockMsg)
        return
      }
    }
    if (!window.confirm('確定要刪除這筆校正紀錄嗎？此動作無法復原。')) return
    const { error: delErr } = await supabase.from('stock_adjustments').delete().eq('id', id)
    if (delErr) {
      setError(delErr.message)
      return
    }
    loadRecentAdjustments()
  }

  return (
    <div>
      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-3 text-sm">危險操作開關</h2>
        <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
          <input type="checkbox" checked={enableDelete} onChange={(e) => onToggleDelete(e.target.checked)} />
          啟用刪除 —「日誌瀏覽」下每筆紀錄最右邊會出現刪除鈕，只能從最新一筆往回刪
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={enableEdit} onChange={(e) => onToggleEdit(e.target.checked)} />
          啟用編輯修正功能 —「日誌瀏覽」下每筆紀錄最右邊會出現編輯鈕，只能修改最新一筆
        </label>
      </div>

      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-1 text-sm">新增校正紀錄</h2>
        <p className="text-xs text-gray-500 mb-3">
          用來修正較早以前呈報錯誤、但已經有後續生產紀錄依賴而不能直接刪改的狀況：直接在「現在」這個時間點補一筆
          +/- 調整，不會動到任何舊資料。
        </p>
        <div className="flex flex-wrap gap-3 items-end mb-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">產品</label>
            <Combobox
              options={products.map((p) => ({ value: p.id, label: p.name }))}
              value={productId}
              onChange={setProductId}
              placeholder="輸入或選擇產品"
              className="w-48"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">狀態標籤</label>
            <select
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
              disabled={!productId}
            >
              <option value="">請選擇</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">校正數量（+/-）</label>
            <input
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="例如 3 或 -2"
              className="border rounded px-2 py-1.5 text-sm w-28"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-600 mb-1">原因（選填）</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：今天傍晚盤點確認"
              className="border rounded px-2 py-1.5 text-sm w-full"
            />
          </div>
          <button
            onClick={submitAdjustment}
            disabled={submitting}
            className="bg-black text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {submitting ? '送出中…' : '送出校正'}
          </button>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-700 text-sm">{message}</p>}
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 className="font-medium text-sm">最近校正紀錄</h2>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer text-gray-600">
            <input type="checkbox" checked={linkSameTime} onChange={(e) => setLinkSameTime(e.target.checked)} />
            同時間一起選擇
          </label>
          {selectedIds.size > 0 && (
            <>
              <span className="text-gray-600">已選擇：{selectedIds.size}</span>
              <button onClick={bulkDeleteAdjustments} className="text-red-600 underline">
                全部刪除
              </button>
            </>
          )}
        </div>
      </div>
      {recentAdjustments.length === 0 ? (
        <p className="text-sm text-gray-400">尚無校正紀錄</p>
      ) : (
        <div className="space-y-1.5">
          {recentAdjustments.map((a) => (
            <div key={a.id} className="border rounded px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p>
                  <span className="text-gray-500">{formatDateTime(a.adjustedAt)}</span> · {a.adjustedByName} ·{' '}
                  {a.productName} ·{' '}
                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>{a.tagLabel}</span>{' '}
                  <span className={a.qtyDelta >= 0 ? 'text-green-700' : 'text-red-600'}>
                    {a.qtyDelta >= 0 ? `+${a.qtyDelta}` : a.qtyDelta}
                  </span>
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleAdjustmentSelection(a)} />
                  <button onClick={() => deleteAdjustment(a.id)} className="text-red-600 text-xs underline whitespace-nowrap">
                    刪除
                  </button>
                </div>
              </div>
              {a.reason && <p className="text-xs text-gray-500 mt-0.5">原因：{a.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
