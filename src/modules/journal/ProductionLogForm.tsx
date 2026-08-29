import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { todayStr } from '@/shared/lib/date'
import type { Tables } from '@/shared/types/database'

type Product = Tables<'products'>
type NodeRow = Tables<'process_nodes'>
type EdgeRow = Tables<'process_edges'>

interface OutputRow {
  tagId: string
  qty: string
}
interface StepState {
  inputTagId: string
  actionId: string
  qty: string
  outputs: OutputRow[]
}

function newStep(inputTagId = '', actionId = ''): StepState {
  return { inputTagId, actionId, qty: '', outputs: [] }
}

export function ProductionLogForm({ onLogged }: { onLogged?: () => void }) {
  const { profile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [logDate, setLogDate] = useState(todayStr())
  const [steps, setSteps] = useState<StepState[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .order('name')
      .then(({ data }) => setProducts(data ?? []))
  }, [])

  useEffect(() => {
    if (!productId) {
      setNodes([])
      setEdges([])
      setSteps([])
      return
    }
    setMessage(null)
    setError(null)
    Promise.all([
      supabase.from('process_nodes').select('*').eq('product_id', productId),
      supabase.from('process_edges').select('*').eq('product_id', productId),
      supabase.from('tag_balances').select('tag_id, available_qty').eq('product_id', productId),
    ]).then(([n, e, b]) => {
      setNodes(n.data ?? [])
      setEdges(e.data ?? [])
      setBalances(Object.fromEntries((b.data ?? []).map((r) => [r.tag_id, r.available_qty ?? 0])))
      var startTag = (n.data ?? []).find((x) => x.label === '開始')
      setSteps(startTag ? [newStep(startTag.id)] : [])
    })
  }, [productId])

  const findNode = (id: string) => nodes.find((n) => n.id === id)
  const actionsFrom = (tagId: string) =>
    edges.filter((e) => e.from_node_id === tagId).map((e) => findNode(e.to_node_id)).filter(Boolean) as NodeRow[]
  const outputsOf = (actionId: string) =>
    edges.filter((e) => e.from_node_id === actionId).map((e) => findNode(e.to_node_id)).filter(Boolean) as NodeRow[]
  const isContinuing = (tagId: string) => edges.some((e) => e.from_node_id === tagId)

  const availableFor = (stepIdx: number, tagId: string): number | null => {
    if (stepIdx === 0) {
      var tag = findNode(tagId)
      if (tag?.label === '開始') return null
      return balances[tagId] ?? 0
    }
    var prev = steps[stepIdx - 1]
    var row = prev.outputs.find((o) => o.tagId === tagId)
    return row ? Number(row.qty) || 0 : 0
  }

  const updateStep = (idx: number, patch: Partial<StepState>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const setStepAction = (idx: number, actionId: string) => {
    var outs = outputsOf(actionId).map((t) => ({ tagId: t.id, qty: '' }))
    updateStep(idx, { actionId, outputs: outs })
  }

  const addStep = () => {
    var prev = steps[steps.length - 1]
    if (!prev) return
    // prefer a candidate the user already put a quantity against; fall back to
    // any continuing output of the previous action so the select is never empty
    var withQty = prev.outputs.filter((o) => Number(o.qty) > 0 && isContinuing(o.tagId))
    var anyContinuing = prev.outputs.filter((o) => isContinuing(o.tagId))
    var candidates = withQty.length > 0 ? withQty : anyContinuing
    var s = newStep(candidates.length === 1 ? candidates[0].tagId : '')
    setSteps((cur) => [...cur, s])
  }

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.slice(0, idx))
  }

  const setOutputQty = (stepIdx: number, tagId: string, qty: string) => {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === stepIdx ? { ...s, outputs: s.outputs.map((o) => (o.tagId === tagId ? { ...o, qty } : o)) } : s
      )
    )
  }

  const outputSum = (s: StepState) => s.outputs.reduce((sum, o) => sum + (Number(o.qty) || 0), 0)

  const submit = async () => {
    setError(null)
    if (!profile || !productId) return
    if (steps.length === 0) {
      setError('請至少填寫一個站別')
      return
    }
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i]
      if (!s.inputTagId || !s.actionId) {
        setError(`第 ${i + 1} 站尚未選擇輸入狀態或動作站`)
        return
      }
      var qty = Number(s.qty)
      if (!qty || qty <= 0) {
        setError(`第 ${i + 1} 站請填寫數量`)
        return
      }
      var avail = availableFor(i, s.inputTagId)
      if (avail !== null && qty > avail) {
        setError(`第 ${i + 1} 站數量 ${qty} 超過目前可用的 ${avail}`)
        return
      }
      if (outputSum(s) !== qty) {
        setError(`第 ${i + 1} 站的良品／不良品加總（${outputSum(s)}）必須等於數量（${qty}）`)
        return
      }
    }

    setSubmitting(true)
    for (var j = 0; j < steps.length; j++) {
      var step = steps[j]
      var { data: logRow, error: logErr } = await supabase
        .from('production_logs')
        .insert({
          product_id: productId,
          member_id: profile.id,
          log_date: logDate,
          action_node_id: step.actionId,
          input_tag_id: step.inputTagId,
          qty_consumed: Number(step.qty),
        })
        .select()
        .single()
      if (logErr || !logRow) {
        setSubmitting(false)
        setError(`登記失敗：${logErr?.message}`)
        return
      }
      var confirmedLogId = logRow.id
      var outputRows = step.outputs
        .filter((o) => Number(o.qty) > 0)
        .map((o) => ({ log_id: confirmedLogId, output_tag_id: o.tagId, qty: Number(o.qty) }))
      if (outputRows.length > 0) {
        var { error: outErr } = await supabase.from('production_log_outputs').insert(outputRows)
        if (outErr) {
          setSubmitting(false)
          setError(`登記輸出失敗：${outErr.message}`)
          return
        }
      }
    }
    setSubmitting(false)
    setMessage('已登記，系統已自動加總')
    var startTag = nodes.find((x) => x.label === '開始')
    setSteps(startTag ? [newStep(startTag.id)] : [])
    onLogged?.()
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="flex flex-wrap gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">產品</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
            <option value="">請選擇</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">日期</label>
          <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
        </div>
      </div>

      {productId && nodes.length === 0 && <p className="text-sm text-gray-400">這個產品還沒有建立生產流程</p>}

      {steps.map((s, idx) => {
        var inputOptions =
          idx === 0
            ? nodes.filter((n) => n.kind === 'tag')
            : (steps[idx - 1]?.outputs.filter((o) => isContinuing(o.tagId)).map((o) => findNode(o.tagId)).filter(Boolean) as NodeRow[])
        var actionOptions = s.inputTagId ? actionsFrom(s.inputTagId) : []
        var avail = s.inputTagId ? availableFor(idx, s.inputTagId) : null

        return (
          <div key={idx} className="border rounded p-3 mb-2 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600">第 {idx + 1} 站</p>
              {idx === steps.length - 1 && steps.length > 1 && (
                <button onClick={() => removeStep(idx)} className="text-xs text-red-600 underline">
                  移除
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-600 mb-1">輸入狀態</label>
                <select
                  value={s.inputTagId}
                  onChange={(e) => updateStep(idx, { inputTagId: e.target.value, actionId: '', outputs: [] })}
                  className="border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">請選擇</option>
                  {inputOptions.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
                {avail !== null && <p className="text-[11px] text-gray-400 mt-0.5">目前可用：{avail}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">動作站</label>
                <select
                  value={s.actionId}
                  onChange={(e) => setStepAction(idx, e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm"
                  disabled={!s.inputTagId}
                >
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
                <input
                  type="number"
                  min={1}
                  value={s.qty}
                  onChange={(e) => updateStep(idx, { qty: e.target.value })}
                  className="border rounded px-2 py-1.5 text-sm w-20"
                />
              </div>
            </div>

            {s.actionId && s.outputs.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-600 mb-1">
                  良品／不良品分配（加總需等於 {s.qty || 0}，目前 {outputSum(s)}）
                </p>
                <div className="flex flex-wrap gap-2">
                  {s.outputs.map((o) => {
                    var tag = findNode(o.tagId)
                    return (
                      <div key={o.tagId} className="flex items-center gap-1.5 border rounded px-2 py-1 bg-white">
                        <span className="text-xs" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {tag?.label}
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={o.qty}
                          onChange={(e) => setOutputQty(idx, o.tagId, e.target.value)}
                          className="border rounded px-1.5 py-0.5 text-xs w-16"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {steps.length > 0 && (
        <button onClick={addStep} className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50 mb-3">
          ＋ 新增下一站（連續跨站登記）
        </button>
      )}

      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {message && <p className="text-green-700 text-sm mb-2">{message}</p>}

      {steps.length > 0 && (
        <div>
          <button
            onClick={submit}
            disabled={submitting}
            className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {submitting ? '送出中…' : '送出登記'}
          </button>
        </div>
      )}
    </div>
  )
}
