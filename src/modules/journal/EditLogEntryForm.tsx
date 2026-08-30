import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { checkInventoryLockBlock } from '@/shared/lib/inventoryLock'
import type { Tables } from '@/shared/types/database'

type NodeRow = Tables<'process_nodes'>
type EdgeRow = Tables<'process_edges'>

interface OutputRow {
  tagId: string
  qty: string
}

export function EditLogEntryForm({
  logId,
  productId,
  initialInputTagId,
  initialActionId,
  initialQty,
  initialLogDate,
  initialOutputs,
  onSaved,
  onCancel,
}: {
  logId: string
  productId: string
  initialInputTagId: string
  initialActionId: string
  initialQty: number
  initialLogDate: string
  initialOutputs: { tagId: string; qty: number }[]
  onSaved: () => void
  onCancel: () => void
}) {
  const { profile } = useAuth()
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [inputTagId, setInputTagId] = useState(initialInputTagId)
  const [actionId, setActionId] = useState(initialActionId)
  const [qty, setQty] = useState(String(initialQty))
  const [logDate, setLogDate] = useState(initialLogDate)
  const [outputs, setOutputs] = useState<OutputRow[]>(initialOutputs.map((o) => ({ tagId: o.tagId, qty: String(o.qty) })))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('process_nodes').select('*').eq('product_id', productId),
      supabase.from('process_edges').select('*').eq('product_id', productId).order('sort_order'),
    ]).then(([n, e]) => {
      setNodes(n.data ?? [])
      setEdges(e.data ?? [])
    })
  }, [productId])

  const findNode = (id: string) => nodes.find((n) => n.id === id)
  const tagOptions = nodes.filter((n) => n.kind === 'tag')
  const actionOptions = inputTagId
    ? (edges.filter((e) => e.from_node_id === inputTagId).map((e) => findNode(e.to_node_id)).filter(Boolean) as NodeRow[])
    : []

  const setAction = (id: string) => {
    setActionId(id)
    const outTagIds = edges.filter((e) => e.from_node_id === id).map((e) => e.to_node_id)
    setOutputs(
      outTagIds.map((tagId) => {
        const existing = outputs.find((o) => o.tagId === tagId)
        return { tagId, qty: existing?.qty ?? '' }
      })
    )
  }

  const outputSum = () => outputs.reduce((sum, o) => sum + (Number(o.qty) || 0), 0)

  const setOutputQty = (tagId: string, q: string) => {
    setOutputs((prev) => prev.map((o) => (o.tagId === tagId ? { ...o, qty: q } : o)))
  }

  const save = async () => {
    setError(null)
    if (!inputTagId || !actionId) {
      setError('請選擇輸入狀態與動作站')
      return
    }
    const qtyNum = Number(qty)
    if (!qtyNum || qtyNum <= 0) {
      setError('請填寫數量')
      return
    }
    if (outputSum() !== qtyNum) {
      setError(`良品／不良品加總（${outputSum()}）必須等於數量（${qtyNum}）`)
      return
    }
    if (profile) {
      const blockMsg = await checkInventoryLockBlock(profile.id)
      if (blockMsg) {
        setError(blockMsg)
        return
      }
    }
    setSaving(true)
    const { error: rpcErr } = await supabase.rpc('edit_latest_production_log', {
      p_log_id: logId,
      p_input_tag_id: inputTagId,
      p_action_node_id: actionId,
      p_qty_consumed: qtyNum,
      p_log_date: logDate,
      p_outputs: outputs.filter((o) => Number(o.qty) > 0).map((o) => ({ tag_id: o.tagId, qty: Number(o.qty) })),
    })
    setSaving(false)
    if (rpcErr) {
      setError(
        rpcErr.message.includes('most recent')
          ? '這不是這個產品最新的一筆，無法編輯（只能修改最新一筆）'
          : rpcErr.message
      )
      return
    }
    onSaved()
  }

  return (
    <div className="border rounded p-3 bg-yellow-50 mt-1 text-sm">
      <div className="flex flex-wrap gap-3 items-end mb-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">日期</label>
          <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">輸入狀態</label>
          <select
            value={inputTagId}
            onChange={(e) => {
              setInputTagId(e.target.value)
              setActionId('')
              setOutputs([])
            }}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">請選擇</option>
            {tagOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">動作站</label>
          <select value={actionId} onChange={(e) => setAction(e.target.value)} className="border rounded px-2 py-1 text-sm" disabled={!inputTagId}>
            <option value="">請選擇</option>
            {actionOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">數量</label>
          <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
        </div>
      </div>

      {actionId && outputs.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-600 mb-1">
            良品／不良品分配（加總需等於 {qty || 0}，目前 {outputSum()}）
          </p>
          <div className="flex flex-wrap gap-2">
            {outputs.map((o) => {
              const tag = findNode(o.tagId)
              return (
                <div key={o.tagId} className="flex items-center gap-1.5 border rounded px-2 py-1 bg-white">
                  <span className="text-xs" style={{ fontFamily: 'ui-monospace, monospace' }}>
                    {tag?.label}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={o.qty}
                    onChange={(e) => setOutputQty(o.tagId, e.target.value)}
                    className="border rounded px-1.5 py-0.5 text-xs w-16"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="bg-black text-white rounded px-3 py-1 text-xs disabled:opacity-50">
          {saving ? '儲存中…' : '儲存'}
        </button>
        <button onClick={onCancel} className="border rounded px-3 py-1 text-xs hover:bg-gray-100">
          取消
        </button>
      </div>
    </div>
  )
}
