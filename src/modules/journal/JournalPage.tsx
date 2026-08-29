import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { ProductionLogForm } from './ProductionLogForm'
import { effectiveDisplayName } from '@/shared/lib/displayName'

interface RecentLog {
  id: string
  log_date: string
  qty_consumed: number
  product_name: string
  action_label: string
  input_label: string
  member_name: string
  outputs: { label: string; qty: number }[]
}

export function JournalPage() {
  const [recent, setRecent] = useState<RecentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const load = async () => {
    setLoading(true)
    const { data: logs } = await supabase
      .from('production_logs')
      .select('id, log_date, qty_consumed, product_id, action_node_id, input_tag_id, member_id, created_at')
      .order('created_at', { ascending: false })
      .limit(15)

    const rows = logs ?? []
    if (rows.length === 0) {
      setRecent([])
      setLoading(false)
      return
    }

    const productIds = Array.from(new Set(rows.map((r) => r.product_id)))
    const memberIds = Array.from(new Set(rows.map((r) => r.member_id)))
    const logIds = rows.map((r) => r.id)

    const { data: outputs } = await supabase
      .from('production_log_outputs')
      .select('log_id, output_tag_id, qty')
      .in('log_id', logIds)

    const nodeIds = Array.from(
      new Set([
        ...rows.flatMap((r) => [r.action_node_id, r.input_tag_id]),
        ...(outputs ?? []).map((o) => o.output_tag_id),
      ])
    )

    const [{ data: products }, { data: nodes }, { data: members }] = await Promise.all([
      supabase.from('products').select('id, name').in('id', productIds),
      supabase.from('process_nodes').select('id, label').in('id', nodeIds),
      supabase.from('profiles').select('id, display_name, preferred_display_name').in('id', memberIds),
    ])

    const productMap = Object.fromEntries((products ?? []).map((p) => [p.id, p.name]))
    const nodeMap = Object.fromEntries((nodes ?? []).map((n) => [n.id, n.label]))
    const memberMap = Object.fromEntries((members ?? []).map((m) => [m.id, effectiveDisplayName(m)]))

    setRecent(
      rows.map((r) => ({
        id: r.id,
        log_date: r.log_date,
        qty_consumed: r.qty_consumed,
        product_name: productMap[r.product_id] ?? '?',
        action_label: nodeMap[r.action_node_id] ?? '?',
        input_label: nodeMap[r.input_tag_id] ?? '?',
        member_name: memberMap[r.member_id] ?? '?',
        outputs: (outputs ?? [])
          .filter((o) => o.log_id === r.id)
          .map((o) => ({ label: nodeMap[o.output_tag_id] ?? '?', qty: o.qty })),
      }))
    )
    setLoading(false)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">日誌系統</h1>

      <h2 className="font-medium mb-2">生產紀錄</h2>
      <p className="text-xs text-gray-500 mb-3">選擇產品、從哪個狀態、做了什麼動作、幾件，送出後系統會自動加總；可以連續新增下一站一次送出。</p>
      <div className="mb-6">
        <ProductionLogForm onLogged={() => setRefreshKey((k) => k + 1)} />
      </div>

      <h2 className="font-medium mb-2">最近登記</h2>
      {loading ? (
        <div className="text-sm text-gray-500">載入中…</div>
      ) : recent.length === 0 ? (
        <p className="text-sm text-gray-400">尚無生產紀錄</p>
      ) : (
        <div className="space-y-2">
          {recent.map((r) => (
            <div key={r.id} className="border rounded px-3 py-2 text-sm">
              <p>
                <span className="text-gray-500">{r.log_date}</span> · {r.member_name} · {r.product_name} ·{' '}
                <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                  {r.input_label} → {r.action_label}
                </span>{' '}
                （{r.qty_consumed} 件）
              </p>
              {r.outputs.length > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  產出：{r.outputs.map((o) => `${o.label} x${o.qty}`).join('　')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
