import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import type { Tables } from '@/shared/types/database'

type NodeRow = Tables<'process_nodes'>
type EdgeRow = Tables<'process_edges'>
type Product = Tables<'products'>

interface DiffPlan {
  productId: string
  productName: string
  reuseCount: number
  newNodes: { id: string; kind: NodeRow['kind']; label: string; pos_x: number; pos_y: number; wait_days: number | null; product_id: string }[]
  newEdges: { id: string; from_node_id: string; to_node_id: string; product_id: string; sort_order: number }[]
  ambiguous: string[]
}

// Matches template nodes to a target product's existing nodes by (kind,
// label) — the only signal we have across two independently-created graphs.
// Matched nodes are reused as-is (never duplicated, never touched); unmatched
// template nodes/edges are the actual "diff" to insert. Purely additive: it
// never deletes or renames anything, so it's safe even on products that
// already have production log history.
function computeDiff(
  templateNodes: NodeRow[],
  templateEdges: EdgeRow[],
  targetNodes: NodeRow[],
  targetEdges: EdgeRow[],
  productId: string,
  productName: string
): DiffPlan {
  const byKey = new Map<string, NodeRow[]>()
  for (const n of targetNodes) {
    const key = `${n.kind}::${n.label}`
    const arr = byKey.get(key) ?? []
    arr.push(n)
    byKey.set(key, arr)
  }
  const idMap = new Map<string, string>()
  const ambiguous: string[] = []
  const newNodes: DiffPlan['newNodes'] = []
  for (const tn of templateNodes) {
    const key = `${tn.kind}::${tn.label}`
    const matches = byKey.get(key) ?? []
    if (matches.length === 1) {
      idMap.set(tn.id, matches[0].id)
    } else if (matches.length === 0) {
      const freshId = crypto.randomUUID()
      idMap.set(tn.id, freshId)
      newNodes.push({ id: freshId, kind: tn.kind, label: tn.label, pos_x: tn.pos_x, pos_y: tn.pos_y, wait_days: tn.wait_days, product_id: productId })
    } else {
      ambiguous.push(tn.label)
    }
  }
  const existingEdgeKeys = new Set(targetEdges.map((e) => `${e.from_node_id}->${e.to_node_id}`))
  const nextOrderByFrom = new Map<string, number>()
  for (const e of targetEdges) {
    nextOrderByFrom.set(e.from_node_id, Math.max(nextOrderByFrom.get(e.from_node_id) ?? -1, e.sort_order) + 1)
  }
  const newEdges: DiffPlan['newEdges'] = []
  for (const te of templateEdges) {
    const fromId = idMap.get(te.from_node_id)
    const toId = idMap.get(te.to_node_id)
    if (!fromId || !toId) continue // touches an ambiguous/unresolved node — skip, needs manual handling
    const key = `${fromId}->${toId}`
    if (existingEdgeKeys.has(key)) continue // already there
    const sortOrder = nextOrderByFrom.get(fromId) ?? 0
    nextOrderByFrom.set(fromId, sortOrder + 1)
    newEdges.push({ id: crypto.randomUUID(), from_node_id: fromId, to_node_id: toId, product_id: productId, sort_order: sortOrder })
  }
  const reuseCount = templateNodes.length - newNodes.length - ambiguous.length
  return { productId, productName, reuseCount, newNodes, newEdges, ambiguous }
}

export function ApplyTemplateDiffPanel({ templateId, templateName }: { templateId: string; templateName: string }) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [openMode, setOpenMode] = useState<'flow' | 'category'>('flow')
  const [products, setProducts] = useState<Product[]>([])
  const [appliedProductIds, setAppliedProductIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [plans, setPlans] = useState<DiffPlan[] | null>(null)
  const [computing, setComputing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [applyingCategories, setApplyingCategories] = useState(false)
  const [categoryDone, setCategoryDone] = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('product_template_applications').select('product_id').eq('template_id', templateId),
    ]).then(([{ data: productList }, { data: applications }]) => {
      const list = productList ?? []
      const appliedIds = new Set((applications ?? []).map((a) => a.product_id))
      setProducts(list)
      setAppliedProductIds(appliedIds)
      setSelected(new Set(list.filter((p) => appliedIds.has(p.id)).map((p) => p.id)))
    })
  }, [open, templateId])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && selected.size < products.length
    }
  }, [selected, products])

  const toggleAll = () => {
    setSelected((prev) => (prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))))
  }

  const computeDiffs = async () => {
    setError(null)
    setDone(false)
    setComputing(true)
    const [{ data: tNodes }, { data: tEdges }] = await Promise.all([
      supabase.from('process_nodes').select('*').eq('template_id', templateId),
      supabase.from('process_edges').select('*').eq('template_id', templateId).order('sort_order'),
    ])
    if (!tNodes || tNodes.length === 0) {
      setComputing(false)
      setError('這個範本是空的')
      return
    }
    const results: DiffPlan[] = []
    for (const pid of selected) {
      const [{ data: pNodes }, { data: pEdges }] = await Promise.all([
        supabase.from('process_nodes').select('*').eq('product_id', pid),
        supabase.from('process_edges').select('*').eq('product_id', pid),
      ])
      const product = products.find((p) => p.id === pid)
      results.push(computeDiff(tNodes, tEdges ?? [], pNodes ?? [], pEdges ?? [], pid, product?.name ?? '?'))
    }
    setPlans(results)
    setComputing(false)
  }

  const applyDiffs = async () => {
    if (!plans) return
    setApplying(true)
    setError(null)
    for (const plan of plans) {
      if (plan.newNodes.length > 0) {
        const { error: nErr } = await supabase.from('process_nodes').insert(plan.newNodes)
        if (nErr) {
          setApplying(false)
          setError(`${plan.productName}：${nErr.message}`)
          return
        }
      }
      if (plan.newEdges.length > 0) {
        const { error: eErr } = await supabase.from('process_edges').insert(plan.newEdges)
        if (eErr) {
          setApplying(false)
          setError(`${plan.productName}：${eErr.message}`)
          return
        }
      }
      await supabase.from('product_template_applications').insert({
        product_id: plan.productId,
        template_id: templateId,
        template_name: templateName,
        mode: 'diff',
        applied_by: profile?.id,
      })
    }
    setApplying(false)
    setDone(true)
    setPlans(null)
  }

  // Categories have none of the flow's merge/reuse concerns (a box
  // references nothing else, so there's no id-matching to do) — this is
  // simply "wipe whatever's there, drop in a fresh copy of the template's
  // boxes", confirmed up front since it's destructive either way.
  const applyCategoriesToSelected = async () => {
    if (selected.size === 0) return
    if (
      !window.confirm(
        `確定要把範本「${templateName}」的分類虛線框套用到已選的 ${selected.size} 個產品嗎？\n這會直接覆蓋這些產品原本的分類設定（無論原本有沒有設定過），此動作無法復原。`
      )
    ) {
      return
    }
    setApplyingCategories(true)
    setError(null)
    setCategoryDone(false)
    const { data: tBoxes } = await supabase.from('category_boxes').select('*').eq('template_id', templateId)
    for (const pid of selected) {
      const { error: delErr } = await supabase.from('category_boxes').delete().eq('product_id', pid)
      if (delErr) {
        setApplyingCategories(false)
        setError(delErr.message)
        return
      }
      if (tBoxes && tBoxes.length > 0) {
        const rows = tBoxes.map((b) => ({
          product_id: pid,
          name: b.name,
          pos_x: b.pos_x,
          pos_y: b.pos_y,
          width: b.width,
          height: b.height,
        }))
        const { error: insErr } = await supabase.from('category_boxes').insert(rows)
        if (insErr) {
          setApplyingCategories(false)
          setError(insErr.message)
          return
        }
      }
    }
    setApplyingCategories(false)
    setCategoryDone(true)
  }

  if (!open) {
    return (
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => {
            setOpen(true)
            setOpenMode('flow')
          }}
          className="bg-black text-white rounded px-4 py-2 text-sm hover:opacity-90"
        >
          套用流程到多個產品
        </button>
        <button
          onClick={() => {
            setOpen(true)
            setOpenMode('category')
          }}
          className="border rounded px-4 py-2 text-sm hover:bg-gray-50"
        >
          套用分類到多個產品
        </button>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-sm">{openMode === 'flow' ? '套用流程到多個產品' : '套用分類到多個產品'}</h3>
        <button
          onClick={() => {
            setOpen(false)
            setPlans(null)
            setDone(false)
            setCategoryDone(false)
            setError(null)
          }}
          className="text-xs text-gray-400 hover:text-black"
        >
          收起
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {openMode === 'flow'
          ? '用「名稱＋種類」比對每個產品既有的節點：對得上的沿用既有節點（不會重複新增，不會動到既有內容），對不上的才會新增。只會新增、不會刪除或修改，就算產品已經有生產紀錄也可以套用。'
          : '分類虛線框跟流程節點完全獨立，沒有比對/合併的概念——套用會直接刪掉所選產品原本的所有分類框，換成範本目前的分類框，無論原本有沒有設定過都會被覆蓋。'}
      </p>

      <label className="flex items-center gap-2 text-xs text-gray-600 mb-1.5 cursor-pointer">
        <input type="checkbox" ref={selectAllRef} checked={selected.size === products.length && products.length > 0} onChange={toggleAll} />
        全選
      </label>
      <div className="max-h-56 overflow-y-auto border rounded mb-3 divide-y">
        {products.map((p) => (
          <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            <span>{p.name}</span>
            {appliedProductIds.has(p.id) && <span className="text-[10px] text-gray-400">（已套用過此範本）</span>}
          </label>
        ))}
        {products.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">尚無產品</p>}
      </div>

      {openMode === 'flow' && !plans && (
        <button
          onClick={computeDiffs}
          disabled={selected.size === 0 || computing}
          className="bg-black text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {computing ? '比對中…' : `計算差異（已選 ${selected.size} 項）`}
        </button>
      )}

      {openMode === 'category' && (
        <button
          onClick={applyCategoriesToSelected}
          disabled={selected.size === 0 || applyingCategories}
          className="bg-red-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-red-700"
        >
          {applyingCategories ? '套用中…' : `套用分類（強制覆蓋，已選 ${selected.size} 項）`}
        </button>
      )}

      {plans && (
        <>
          <div className="space-y-2 mb-3">
            {plans.map((plan) => (
              <div key={plan.productId} className="border rounded p-2 text-sm">
                <p className="font-medium">{plan.productName}</p>
                <p className="text-xs text-gray-500">
                  沿用既有節點 {plan.reuseCount} 個　·　新增節點 {plan.newNodes.length} 個　·　新增連線 {plan.newEdges.length} 條
                </p>
                {plan.newNodes.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">新增：{plan.newNodes.map((n) => n.label).join('、')}</p>
                )}
                {plan.ambiguous.length > 0 && (
                  <p className="text-xs text-red-600 mt-0.5">
                    ⚠ 「{plan.ambiguous.join('、')}」在這個產品裡有重複名稱，無法自動判斷，這部分已略過，請手動處理
                  </p>
                )}
                {plan.newNodes.length === 0 && plan.newEdges.length === 0 && plan.ambiguous.length === 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">沒有變化，已經是最新的</p>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={applyDiffs} disabled={applying} className="bg-black text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {applying ? '套用中…' : '確認套用'}
            </button>
            <button onClick={() => setPlans(null)} className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50">
              重新選擇
            </button>
          </div>
        </>
      )}

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      {done && <p className="text-green-700 text-sm mt-2">已套用完成</p>}
      {categoryDone && <p className="text-green-700 text-sm mt-2">分類已套用完成</p>}
    </div>
  )
}
