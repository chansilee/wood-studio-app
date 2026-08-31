import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { todayStr } from '@/shared/lib/date'
import { checkInventoryLockBlock } from '@/shared/lib/inventoryLock'
import { Combobox } from '@/shared/components/Combobox'
import type { JournalPrefs } from './JournalPreferencesPanel'
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

const DEFAULT_PREFS: JournalPrefs = { hideUnavailableInputs: false, actionFirst: false, autoFillFirstOutput: false }

export function ProductionLogForm({ onLogged }: { onLogged?: () => void }) {
  const { profile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [steps, setSteps] = useState<StepState[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [prefs, setPrefs] = useState<JournalPrefs>(DEFAULT_PREFS)
  const [lockMessage, setLockMessage] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('resolve_matured_wait_logs')
    supabase
      .from('products')
      .select('*')
      .order('name')
      .then(({ data }) => setProducts(data ?? []))
  }, [])

  useEffect(() => {
    if (!profile) return
    checkInventoryLockBlock(profile.id).then(setLockMessage)
  }, [profile])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('journal_preferences')
      .select('*')
      .eq('member_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs({
            hideUnavailableInputs: data.hide_unavailable_inputs,
            actionFirst: data.action_first,
            autoFillFirstOutput: data.auto_fill_first_output,
          })
        }
      })
  }, [profile])

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
      supabase.from('process_edges').select('*').eq('product_id', productId).order('sort_order'),
      supabase.from('tag_balances').select('tag_id, available_qty').eq('product_id', productId),
    ]).then(([n, e, b]) => {
      var freshNodes = n.data ?? []
      var freshEdges = e.data ?? []
      setNodes(freshNodes)
      setEdges(freshEdges)
      setBalances(Object.fromEntries((b.data ?? []).map((r) => [r.tag_id, r.available_qty ?? 0])))
      var findFresh = (id: string) => freshNodes.find((x) => x.id === id)
      var freshActionsFrom = (tagId: string) =>
        freshEdges.filter((ed) => ed.from_node_id === tagId).map((ed) => findFresh(ed.to_node_id)).filter(Boolean) as NodeRow[]
      var startTag = freshNodes.find((x) => x.label === '開始')
      if (!startTag) {
        setSteps([])
        return
      }
      // cascade the same "second layer defaults from the first" as addStep,
      // using the just-fetched data directly since component state hasn't
      // committed yet on this tick
      var actionOpts = freshActionsFrom(startTag.id)
      var actionId = actionOpts[0]?.id ?? ''
      var outs = actionId
        ? (freshEdges.filter((ed) => ed.from_node_id === actionId).map((ed) => findFresh(ed.to_node_id)).filter(Boolean) as NodeRow[]).map(
            (t) => ({ tagId: t.id, qty: '' })
          )
        : []
      setSteps([{ inputTagId: startTag.id, actionId, qty: '', outputs: outs }])
    })
  }, [productId])

  const refreshBalances = async () => {
    if (!productId) return
    const { data: b } = await supabase.from('tag_balances').select('tag_id, available_qty').eq('product_id', productId)
    setBalances(Object.fromEntries((b ?? []).map((r) => [r.tag_id, r.available_qty ?? 0])))
  }

  const findNode = (id: string) => nodes.find((n) => n.id === id)
  // 等待節點 are fully automatic — a human should never be able to pick one
  // as an action, so every action-option list here excludes them
  const actionsFrom = (tagId: string) =>
    (edges.filter((e) => e.from_node_id === tagId).map((e) => findNode(e.to_node_id)).filter(Boolean) as NodeRow[]).filter(
      (n) => n.wait_days == null
    )
  const outputsOf = (actionId: string) =>
    edges.filter((e) => e.from_node_id === actionId).map((e) => findNode(e.to_node_id)).filter(Boolean) as NodeRow[]
  const isContinuing = (tagId: string) => edges.some((e) => e.from_node_id === tagId)
  // a tag whose only path forward is an automatic wait node should never be
  // offered as something to manually log into — it drains on its own
  const feedsOnlyWaitNode = (tagId: string) =>
    edges.some((e) => e.from_node_id === tagId && findNode(e.to_node_id)?.wait_days != null)

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

  const rawInputOptionsFor = (idx: number): NodeRow[] =>
    (idx === 0
      ? nodes.filter((n) => n.kind === 'tag')
      : (steps[idx - 1]?.outputs.filter((o) => isContinuing(o.tagId)).map((o) => findNode(o.tagId)).filter(Boolean) as NodeRow[])
    ).filter((n) => !feedsOnlyWaitNode(n.id))

  const inputOptionsFor = (idx: number): NodeRow[] => {
    var raw = rawInputOptionsFor(idx)
    return prefs.hideUnavailableInputs
      ? raw.filter((n) => n.label === '開始' || (availableFor(idx, n.id) ?? 0) > 0)
      : raw
  }

  const actionOptionsFor = (idx: number, inputTagId: string): NodeRow[] => {
    if (!prefs.actionFirst) {
      return inputTagId ? actionsFrom(inputTagId) : []
    }
    var seen = new Map<string, NodeRow>()
    inputOptionsFor(idx).forEach((tag) => actionsFrom(tag.id).forEach((a) => seen.set(a.id, a)))
    return Array.from(seen.values())
  }

  const updateStep = (idx: number, patch: Partial<StepState>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const setStepAction = (idx: number, actionId: string, forcedInputTagId?: string) => {
    var baseOuts = outputsOf(actionId).map((t) => ({ tagId: t.id, qty: '' }))
    var currentQty = steps[idx]?.qty ?? ''
    var outs =
      prefs.autoFillFirstOutput && baseOuts.length > 0
        ? baseOuts.map((o, i) => ({ ...o, qty: i === 0 ? currentQty : '0' }))
        : baseOuts
    var patch: Partial<StepState> = { actionId, outputs: outs }
    if (forcedInputTagId !== undefined) patch.inputTagId = forcedInputTagId
    updateStep(idx, patch)
  }

  // picking the first layer (whichever field that is) always cascades a
  // default into the second layer — defaulting to the first candidate when
  // there's more than one, or the only candidate when there's exactly one
  // (in which case the field renders locked, since there's nothing to pick)
  const handleSelectAction = (idx: number, actionId: string) => {
    if (prefs.actionFirst) {
      var matchingTags = inputOptionsFor(idx).filter((tag) => actionsFrom(tag.id).some((a) => a.id === actionId))
      setStepAction(idx, actionId, matchingTags[0]?.id ?? '')
    } else {
      setStepAction(idx, actionId)
    }
  }

  const setStepInput = (idx: number, inputTagId: string) => {
    var actionOpts = inputTagId ? actionsFrom(inputTagId) : []
    setStepAction(idx, actionOpts[0]?.id ?? '', inputTagId)
  }

  const handleQtyChange = (idx: number, qty: string) => {
    var s = steps[idx]
    if (prefs.autoFillFirstOutput && s && s.outputs.length > 0) {
      var newOutputs = s.outputs.map((o, i) => ({ ...o, qty: i === 0 ? qty : '0' }))
      updateStep(idx, { qty, outputs: newOutputs })
    } else {
      updateStep(idx, { qty })
    }
  }

  const addStep = () => {
    var prev = steps[steps.length - 1]
    if (!prev) return
    // prefer a candidate the user already put a quantity against; fall back to
    // any continuing output of the previous action so the select is never empty
    var withQty = prev.outputs.filter((o) => Number(o.qty) > 0 && isContinuing(o.tagId))
    var anyContinuing = prev.outputs.filter((o) => isContinuing(o.tagId))
    var candidates = withQty.length > 0 ? withQty : anyContinuing
    var tagId = candidates.length === 1 ? candidates[0].tagId : ''
    // mirror setStepInput's cascade so a pre-filled tag also gets its default
    // action, keeping the (possibly locked) action select's value in sync
    var actionOpts = tagId ? actionsFrom(tagId) : []
    var actionId = actionOpts[0]?.id ?? ''
    var outs = actionId ? outputsOf(actionId).map((t) => ({ tagId: t.id, qty: '' })) : []
    setSteps((cur) => [...cur, { inputTagId: tagId, actionId, qty: '', outputs: outs }])
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
    const blockMsg = await checkInventoryLockBlock(profile.id)
    if (blockMsg) {
      setLockMessage(blockMsg)
      setError(blockMsg)
      return
    }
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
          log_date: todayStr(),
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
    if (startTag) {
      var actionOpts = actionsFrom(startTag.id)
      var actionId = actionOpts[0]?.id ?? ''
      var outs = actionId ? outputsOf(actionId).map((t) => ({ tagId: t.id, qty: '' })) : []
      setSteps([{ inputTagId: startTag.id, actionId, qty: '', outputs: outs }])
    } else {
      setSteps([])
    }
    await refreshBalances()
    onLogged?.()
  }

  return (
    <div className="border rounded-lg p-4">
      {lockMessage && (
        <p className="text-xs text-amber-700 mb-3 border border-amber-200 bg-amber-50 rounded px-3 py-2">{lockMessage}</p>
      )}
      <div className="flex flex-wrap gap-3 mb-3">
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
      </div>

      {productId && nodes.length === 0 && <p className="text-sm text-gray-400">這個產品還沒有建立生產流程</p>}

      {steps.map((s, idx) => {
        var inputOptions = inputOptionsFor(idx)
        var actionOptions = actionOptionsFor(idx, s.inputTagId)
        var inputOptionsForAction = prefs.actionFirst
          ? inputOptions.filter((tag) => actionsFrom(tag.id).some((a) => a.id === s.actionId))
          : inputOptions
        var avail = s.inputTagId ? availableFor(idx, s.inputTagId) : null
        // the field that comes second is always cascaded from the first, so
        // it's locked once there's only one possible value (nothing to pick)
        var actionDisabled = !prefs.actionFirst && (!s.inputTagId || actionOptions.length <= 1)
        var inputDisabled = prefs.actionFirst && (!s.actionId || inputOptionsForAction.length <= 1)

        var inputField = (
          <div>
            <label className="block text-xs text-gray-600 mb-1">輸入狀態</label>
            <select
              value={s.inputTagId}
              onChange={(e) => setStepInput(idx, e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
              disabled={inputDisabled}
            >
              {(!prefs.actionFirst || inputOptionsForAction.length === 0) && <option value="">請選擇</option>}
              {(prefs.actionFirst ? inputOptionsForAction : inputOptions).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            {avail !== null && <p className="text-[11px] text-gray-400 mt-0.5">目前可用：{avail}</p>}
          </div>
        )
        var actionField = (
          <div>
            <label className="block text-xs text-gray-600 mb-1">動作站</label>
            <select
              value={s.actionId}
              onChange={(e) => handleSelectAction(idx, e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
              disabled={actionDisabled}
            >
              {(prefs.actionFirst || actionOptions.length === 0) && <option value="">請選擇</option>}
              {actionOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
        )

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
              {prefs.actionFirst ? (
                <>
                  {actionField}
                  {inputField}
                </>
              ) : (
                <>
                  {inputField}
                  {actionField}
                </>
              )}
              <div>
                <label className="block text-xs text-gray-600 mb-1">數量</label>
                <input
                  type="number"
                  min={1}
                  value={s.qty}
                  onChange={(e) => handleQtyChange(idx, e.target.value)}
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
            disabled={submitting || !!lockMessage}
            className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {submitting ? '送出中…' : '送出登記'}
          </button>
        </div>
      )}
    </div>
  )
}
