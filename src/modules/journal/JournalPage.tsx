import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { ProductionLogForm } from './ProductionLogForm'
import { LogManagementPanel } from './LogManagementPanel'
import { JournalPreferencesPanel } from './JournalPreferencesPanel'
import { EditLogEntryForm } from './EditLogEntryForm'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import { formatDateTime } from '@/shared/lib/date'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-TW', { hour12: false })
}

interface RecentLog {
  id: string
  product_id: string
  action_node_id: string
  input_tag_id: string
  log_date: string
  created_at: string
  edited_at: string | null
  edited_by_name: string | null
  qty_consumed: number
  product_name: string
  action_label: string
  input_label: string
  member_name: string
  outputs: { tagId: string; label: string; qty: number }[]
}

export function JournalPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [tab, setTab] = useState<'browse' | 'manage' | 'preferences'>('browse')
  const [enableDelete, setEnableDelete] = useState(false)
  const [enableEdit, setEnableEdit] = useState(false)
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const load = async () => {
    setLoading(true)
    const { data: logs } = await supabase
      .from('production_logs')
      .select('id, log_date, qty_consumed, product_id, action_node_id, input_tag_id, member_id, created_at, edited_at, edited_by')
      .order('created_at', { ascending: false })
      .limit(15)

    const rows = logs ?? []
    if (rows.length === 0) {
      setRecent([])
      setLoading(false)
      return
    }

    const productIds = Array.from(new Set(rows.map((r) => r.product_id)))
    const memberIds = Array.from(
      new Set([...rows.map((r) => r.member_id), ...rows.map((r) => r.edited_by).filter((x): x is string => !!x)])
    )
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
        product_id: r.product_id,
        action_node_id: r.action_node_id,
        input_tag_id: r.input_tag_id,
        log_date: r.log_date,
        created_at: r.created_at,
        edited_at: r.edited_at,
        edited_by_name: r.edited_by ? (memberMap[r.edited_by] ?? '?') : null,
        qty_consumed: r.qty_consumed,
        product_name: productMap[r.product_id] ?? '?',
        action_label: nodeMap[r.action_node_id] ?? '?',
        input_label: nodeMap[r.input_tag_id] ?? '?',
        member_name: memberMap[r.member_id] ?? '?',
        outputs: (outputs ?? [])
          .filter((o) => o.log_id === r.id)
          .map((o) => ({ tagId: o.output_tag_id, label: nodeMap[o.output_tag_id] ?? '?', qty: o.qty })),
      }))
    )
    setLoading(false)
  }

  // a row is only deletable/editable if no OTHER row for the same product is
  // more recent — the topmost occurrence of a product in this desc-sorted
  // list is always its true global most-recent log (see production_logs
  // LIFO trigger); this mirrors that check purely from what's already loaded
  const isLatestForProduct = (row: RecentLog, idx: number) =>
    !recent.slice(0, idx).some((r) => r.product_id === row.product_id)

  const deleteLog = async (logId: string) => {
    setError(null)
    if (!window.confirm('確定要刪除這筆日誌嗎？只能刪除最新一筆，此動作無法復原。')) return
    const { error: delErr } = await supabase.from('production_logs').delete().eq('id', logId)
    if (delErr) {
      window.alert(
        delErr.message.includes('most recent') ? '這不是這個產品最新的一筆，無法刪除。' : delErr.message
      )
      return
    }
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">日誌系統</h1>
        <div className="flex items-center gap-0.5 border rounded-full p-0.5 bg-gray-50">
          <button
            onClick={() => setTab('browse')}
            className={`text-xs px-3 py-1 rounded-full ${tab === 'browse' ? 'bg-black text-white' : 'text-gray-500'}`}
          >
            日誌瀏覽
          </button>
          {isOwner && (
            <button
              onClick={() => setTab('manage')}
              className={`text-xs px-3 py-1 rounded-full ${tab === 'manage' ? 'bg-black text-white' : 'text-gray-500'}`}
            >
              日誌管理
            </button>
          )}
          <button
            onClick={() => setTab('preferences')}
            className={`text-xs px-3 py-1 rounded-full ${tab === 'preferences' ? 'bg-black text-white' : 'text-gray-500'}`}
          >
            日誌偏好設定
          </button>
        </div>
      </div>

      {tab === 'manage' && isOwner ? (
        <LogManagementPanel
          enableDelete={enableDelete}
          onToggleDelete={setEnableDelete}
          enableEdit={enableEdit}
          onToggleEdit={setEnableEdit}
        />
      ) : tab === 'preferences' ? (
        <JournalPreferencesPanel />
      ) : (
        <>
          <h2 className="font-medium mb-2">生產紀錄</h2>
          <p className="text-xs text-gray-500 mb-3">選擇產品、從哪個狀態、做了什麼動作、幾件，送出後系統會自動加總；可以連續新增下一站一次送出。</p>
          <div className="mb-6">
            <ProductionLogForm onLogged={() => setRefreshKey((k) => k + 1)} />
          </div>

          <h2 className="font-medium mb-2">最近登記</h2>
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          {loading ? (
            <div className="text-sm text-gray-500">載入中…</div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-gray-400">尚無生產紀錄</p>
          ) : (
            <div className="space-y-2">
              {recent.map((r, idx) => {
                const latest = isLatestForProduct(r, idx)
                const isEditing = editingLogId === r.id
                return (
                  <div key={r.id} className="border rounded px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p>
                        <span className="text-gray-500">
                          {r.log_date} {formatTime(r.created_at)}
                        </span>{' '}
                        · {r.member_name} · {r.product_name} ·{' '}
                        <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {r.input_label} → {r.action_label}
                        </span>{' '}
                        （{r.qty_consumed} 件）
                        {r.edited_at && (
                          <span
                            className="text-gray-400 text-xs ml-1.5 cursor-help"
                            title={`已於 ${formatDateTime(r.edited_at)} 由 ${r.edited_by_name ?? '?'} 修正`}
                          >
                            （已修正）
                          </span>
                        )}
                      </p>
                      {latest && !isEditing && (
                        <div className="flex gap-2 flex-shrink-0">
                          {enableEdit && (
                            <button
                              onClick={() => setEditingLogId(r.id)}
                              className="text-blue-700 text-xs underline whitespace-nowrap"
                            >
                              編輯
                            </button>
                          )}
                          {enableDelete && (
                            <button
                              onClick={() => deleteLog(r.id)}
                              className="text-red-600 text-xs underline whitespace-nowrap"
                            >
                              刪除
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {r.outputs.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        產出：{r.outputs.map((o) => `${o.label} x${o.qty}`).join('　')}
                      </p>
                    )}
                    {isEditing && (
                      <EditLogEntryForm
                        logId={r.id}
                        productId={r.product_id}
                        initialInputTagId={r.input_tag_id}
                        initialActionId={r.action_node_id}
                        initialQty={r.qty_consumed}
                        initialLogDate={r.log_date}
                        initialOutputs={r.outputs.map((o) => ({ tagId: o.tagId, qty: o.qty }))}
                        onCancel={() => setEditingLogId(null)}
                        onSaved={() => {
                          setEditingLogId(null)
                          setRefreshKey((k) => k + 1)
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
