import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { ProcessFlowEditor } from './ProcessFlowEditor'
import { ProductPriceTable } from './ProductPriceTable'
import { formatDateTime } from '@/shared/lib/date'
import type { Tables } from '@/shared/types/database'

type Product = Tables<'products'>
type ProcessTemplate = Tables<'process_templates'>
type TemplateApplication = Tables<'product_template_applications'>
type TagBalance = { tag_id: string; label: string; available_qty: number }

function display(v: string | number | null | undefined, empty = '未設定'): string {
  return v === null || v === undefined || v === '' ? empty : String(v)
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const navigate = useNavigate()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const canEdit = isOwner && mode === 'edit'
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [balances, setBalances] = useState<TagBalance[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [nodeCount, setNodeCount] = useState<number | null>(null)
  const [logCount, setLogCount] = useState<number | null>(null)
  const [adjustmentCount, setAdjustmentCount] = useState<number | null>(null)
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [pickedTemplateId, setPickedTemplateId] = useState('')
  const [applying, setApplying] = useState(false)
  const [appliedTemplates, setAppliedTemplates] = useState<TemplateApplication[]>([])
  const [currentTemplateNames, setCurrentTemplateNames] = useState<Record<string, string>>({})
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)

  const load = async () => {
    if (!id) return
    setLoading(true)
    const { data } = await supabase.from('products').select('*').eq('id', id).single()
    setProduct(data ?? null)
    setLoading(false)
  }

  const loadNodeCount = async () => {
    if (!id) return
    const { count } = await supabase.from('process_nodes').select('id', { count: 'exact', head: true }).eq('product_id', id)
    setNodeCount(count ?? 0)
  }

  const loadLogCount = async () => {
    if (!id) return
    const { count } = await supabase.from('production_logs').select('id', { count: 'exact', head: true }).eq('product_id', id)
    setLogCount(count ?? 0)
  }

  const loadAdjustmentCount = async () => {
    if (!id) return
    const { count } = await supabase.from('stock_adjustments').select('id', { count: 'exact', head: true }).eq('product_id', id)
    setAdjustmentCount(count ?? 0)
  }

  const loadCurrentPrice = async () => {
    if (!id) return
    const { data } = await supabase.from('current_product_prices').select('price').eq('product_id', id).maybeSingle()
    setCurrentPrice(data?.price ?? null)
  }

  const loadBalances = async () => {
    if (!id) return
    const [{ data: nodeRows }, { data: balRows }] = await Promise.all([
      supabase.from('process_nodes').select('id, label').eq('product_id', id).eq('kind', 'tag'),
      supabase.from('tag_balances').select('tag_id, available_qty').eq('product_id', id),
    ])
    const balMap = Object.fromEntries((balRows ?? []).map((b) => [b.tag_id, b.available_qty ?? 0]))
    setBalances((nodeRows ?? []).map((n) => ({ tag_id: n.id, label: n.label, available_qty: balMap[n.id] ?? 0 })))
  }

  useEffect(() => {
    load()
    loadBalances()
    loadNodeCount()
    loadLogCount()
    loadAdjustmentCount()
    loadCurrentPrice()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey])

  useEffect(() => {
    if (logCount === 0 && adjustmentCount === 0 && canEdit) {
      supabase
        .from('process_templates')
        .select('*')
        .order('name')
        .then(({ data }) => setTemplates(data ?? []))
    }
  }, [logCount, adjustmentCount, canEdit])

  const loadAppliedTemplates = async () => {
    if (!id) return
    const { data } = await supabase
      .from('product_template_applications')
      .select('*')
      .eq('product_id', id)
      .order('applied_at')
    const rows = data ?? []
    setAppliedTemplates(rows)
    // template_name is a snapshot of what the template was called at apply
    // time (so renaming/deleting it later never rewrites history) — but also
    // fetch the CURRENT name (when the template still exists) so the display
    // can note a rename instead of silently going stale
    const templateIds = Array.from(new Set(rows.map((r) => r.template_id).filter((x): x is string => !!x)))
    if (templateIds.length > 0) {
      const { data: liveTemplates } = await supabase.from('process_templates').select('id, name').in('id', templateIds)
      setCurrentTemplateNames(Object.fromEntries((liveTemplates ?? []).map((t) => [t.id, t.name])))
    } else {
      setCurrentTemplateNames({})
    }
  }

  useEffect(() => {
    loadAppliedTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey])

  const applyTemplate = async () => {
    if (!id || !pickedTemplateId) return
    if (
      (nodeCount ?? 0) > 0 &&
      !window.confirm('這個產品目前已經有流程圖了。套用範本會清空現有的流程，改用範本的內容，確定要繼續嗎？')
    ) {
      return
    }
    setError(null)
    setApplying(true)
    // safe: the picker only shows once logCount === 0 and adjustmentCount ===
    // 0, so no production_logs or stock_adjustments reference these nodes —
    // deleting them cascades their edges too
    if ((nodeCount ?? 0) > 0) {
      const { error: wipeErr } = await supabase.from('process_nodes').delete().eq('product_id', id)
      if (wipeErr) {
        setApplying(false)
        setError(
          wipeErr.message.includes('foreign key') ||
            wipeErr.message.includes('violates') ||
            wipeErr.message.includes('production log history')
            ? '這個產品有節點已經有生產紀錄，無法套用範本'
            : wipeErr.message
        )
        return
      }
    }
    // the old graph (and whatever it was built from) is gone — any prior
    // application history no longer describes what's actually here now
    await supabase.from('product_template_applications').delete().eq('product_id', id)
    const [{ data: srcNodes }, { data: srcEdges }] = await Promise.all([
      supabase.from('process_nodes').select('*').eq('template_id', pickedTemplateId),
      supabase.from('process_edges').select('*').eq('template_id', pickedTemplateId),
    ])
    if (!srcNodes || srcNodes.length === 0) {
      setApplying(false)
      setError('這個範本是空的')
      return
    }
    const idMap = new Map<string, string>()
    srcNodes.forEach((n) => idMap.set(n.id, crypto.randomUUID()))
    const newNodes = srcNodes.map((n) => ({
      id: idMap.get(n.id)!,
      kind: n.kind,
      label: n.label,
      pos_x: n.pos_x,
      pos_y: n.pos_y,
      wait_days: n.wait_days,
      product_id: id,
    }))
    const newEdges = (srcEdges ?? []).map((e) => ({
      id: crypto.randomUUID(),
      from_node_id: idMap.get(e.from_node_id)!,
      to_node_id: idMap.get(e.to_node_id)!,
      product_id: id,
      sort_order: e.sort_order,
    }))
    const { error: nodeErr } = await supabase.from('process_nodes').insert(newNodes)
    if (nodeErr) {
      setApplying(false)
      setError(nodeErr.message)
      return
    }
    if (newEdges.length > 0) {
      const { error: edgeErr } = await supabase.from('process_edges').insert(newEdges)
      if (edgeErr) {
        setApplying(false)
        setError(edgeErr.message)
        return
      }
    }
    const pickedTemplate = templates.find((t) => t.id === pickedTemplateId)
    await supabase.from('product_template_applications').insert({
      product_id: id,
      template_id: pickedTemplateId,
      template_name: pickedTemplate?.name ?? '未知範本',
      mode: 'replace',
      applied_by: profile?.id,
    })
    setApplying(false)
    setPickedTemplateId('')
    setRefreshKey((k) => k + 1)
  }

  const update = async (patch: Partial<Product>) => {
    if (!id) return
    setError(null)
    const { error } = await supabase.from('products').update(patch).eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setProduct((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const removeProduct = async () => {
    if (!id) return
    setError(null)
    const { count } = await supabase
      .from('production_logs')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id)
    if ((count ?? 0) > 0) {
      window.alert('這個產品已經有生產紀錄，無法刪除。')
      return
    }
    if (!window.confirm(`確定要刪除產品「${product?.name}」嗎？此動作無法復原。`)) return
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      window.alert(
        error.message.includes('foreign key') || error.message.includes('violates')
          ? '這個產品已經有生產紀錄，無法刪除。'
          : error.message
      )
      return
    }
    navigate('/products')
  }

  if (loading) return <div className="p-6">載入中…</div>
  if (!product) return <div className="p-6">找不到這個產品</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Link to="/products" className="text-xs text-blue-700 underline">
          ← 返回產品參考
        </Link>
        {isOwner && (
          <div className="flex items-center gap-0.5 border rounded-full p-0.5 bg-gray-50 ml-auto">
            <button
              onClick={() => setMode('view')}
              className={`text-xs px-3 py-1 rounded-full ${mode === 'view' ? 'bg-black text-white' : 'text-gray-500'}`}
            >
              瀏覽模式
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`text-xs px-3 py-1 rounded-full ${mode === 'edit' ? 'bg-black text-white' : 'text-gray-500'}`}
            >
              編輯模式
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1">{product.name}</h1>
        <p className="text-sm text-gray-500">目前價格：{currentPrice !== null ? `$${currentPrice}` : '尚未設定'}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tags</label>
          {canEdit ? (
            <input
              type="text"
              defaultValue={product.tags.join(', ')}
              placeholder="逗號分隔"
              onBlur={(e) =>
                update({
                  tags: e.target.value
                    .split(/[,，]/)
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          ) : product.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {product.tags.map((t) => (
                <span key={t} className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">未設定</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">尺寸</label>
          {canEdit ? (
            <input
              type="text"
              defaultValue={product.size_note ?? ''}
              placeholder="? x ? x ? cm"
              onBlur={(e) => update({ size_note: e.target.value.trim() || null })}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          ) : (
            <p className="text-sm text-gray-500">{display(product.size_note)}</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">材質</label>
          {canEdit ? (
            <input
              type="text"
              defaultValue={product.material ?? ''}
              placeholder="阿拉斯加扁柏"
              onBlur={(e) => update({ material: e.target.value.trim() || null })}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          ) : (
            <p className="text-sm text-gray-500">{display(product.material)}</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">使用原料厚度 (mm)</label>
          {canEdit ? (
            <input
              type="number"
              defaultValue={product.material_thickness_mm ?? ''}
              onBlur={(e) => update({ material_thickness_mm: e.target.value ? Number(e.target.value) : null })}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          ) : (
            <p className="text-sm text-gray-500">{display(product.material_thickness_mm)}</p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">描述</label>
          {canEdit ? (
            <textarea
              defaultValue={product.description ?? ''}
              rows={2}
              onBlur={(e) => update({ description: e.target.value.trim() || null })}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          ) : (
            <p className="text-sm text-gray-500 whitespace-pre-wrap">{display(product.description)}</p>
          )}
        </div>
      </div>

      <h2 className="font-medium mb-2">基礎價格</h2>
      <div className="mb-6">
        <ProductPriceTable
          productId={product.id}
          createdAt={product.created_at}
          editable={canEdit}
          onChanged={loadCurrentPrice}
        />
      </div>

      <h2 className="font-medium mb-2">生產流程</h2>
      {canEdit && logCount === 0 && adjustmentCount === 0 && templates.length > 0 && (
        <div className="border rounded-lg p-3 mb-3 bg-gray-50 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">從範本套用：</span>
          <select
            value={pickedTemplateId}
            onChange={(e) => setPickedTemplateId(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="">請選擇範本</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={applyTemplate}
            disabled={!pickedTemplateId || applying}
            className="bg-black text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {applying ? '套用中…' : '套用'}
          </button>
          <span className="text-xs text-gray-400 w-full">
            套用後會複製一份獨立的流程給這個產品，之後編輯範本或這個產品的流程互不影響。
            {(nodeCount ?? 0) > 0
              ? '目前已經有流程圖，套用會清空並改用範本的內容——因為還沒有任何生產紀錄或校正紀錄，這樣做是安全的。'
              : '也可以不套用，直接在下方從空白開始建立。'}
          </span>
        </div>
      )}
      {appliedTemplates.length > 0 && (
        <div className="text-xs text-gray-400 mb-2">
          <span>套用過的範本：</span>
          {appliedTemplates.map((a, i) => {
            var currentName = a.template_id ? currentTemplateNames[a.template_id] : undefined
            var renamed = currentName && currentName !== a.template_name
            var label = (
              <>
                「{a.template_name}」（{a.mode === 'replace' ? '完整套用' : '差異套用'} · {formatDateTime(a.applied_at).slice(0, 10)}）
                {renamed && <span>（現已改名為「{currentName}」）</span>}
              </>
            )
            return (
              <span key={a.id}>
                {i > 0 && '、'}
                {a.template_id && currentName ? (
                  <Link to={`/process-templates/${a.template_id}`} className="text-blue-700 hover:underline">
                    {label}
                  </Link>
                ) : (
                  label
                )}
              </span>
            )
          })}
          <span>，後續編輯與範本互不影響</span>
        </div>
      )}
      <div className="mb-6">
        <ProcessFlowEditor
          key={refreshKey}
          scope={{ type: 'product', id: product.id }}
          editable={canEdit}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      </div>

      <h2 className="font-medium mb-2">目前庫存</h2>
      {balances.length === 0 ? (
        <p className="text-sm text-gray-400">尚未建立流程，沒有可統計的狀態標籤</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1 pr-6">狀態標籤</th>
                <th className="py-1 pr-6">目前數量</th>
              </tr>
            </thead>
            <tbody>
              {balances
                .filter((b) => b.label !== '開始')
                .map((b) => (
                  <tr key={b.tag_id} className="border-b">
                    <td className="py-1 pr-6">{b.label}</td>
                    <td className="py-1 pr-6 tabular-nums">{b.available_qty}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <button onClick={() => setRefreshKey((k) => k + 1)} className="text-xs text-blue-700 underline mt-2">
        重新整理庫存
      </button>

      {canEdit && (
        <div className="flex justify-end mt-10 pt-4 border-t">
          <button onClick={removeProduct} className="text-red-600 text-xs underline">
            刪除產品
          </button>
        </div>
      )}
    </div>
  )
}
