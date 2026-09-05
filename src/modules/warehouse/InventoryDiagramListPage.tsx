import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { formatDateTime } from '@/shared/lib/date'
import { InventoryDiagramEditorPage } from './InventoryDiagramEditorPage'
import type { Tables } from '@/shared/types/database'

type Diagram = Tables<'inventory_diagrams'>

export function InventoryDiagramListPage() {
  const [diagrams, setDiagrams] = useState<Diagram[]>([])
  const [layerCounts, setLayerCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [{ data: rows }, { data: layerRows }] = await Promise.all([
      supabase.from('inventory_diagrams').select('*').order('name'),
      supabase.from('inventory_diagram_layers').select('diagram_id'),
    ])
    setDiagrams(rows ?? [])
    const counts: Record<string, number> = {}
    for (const r of layerRows ?? []) counts[r.diagram_id] = (counts[r.diagram_id] ?? 0) + 1
    setLayerCounts(counts)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const nameTaken = diagrams.some((d) => d.name === newName.trim())

  const createDiagram = async () => {
    const name = newName.trim()
    if (!name || nameTaken) return
    setCreating(true)
    setError(null)
    const { data: profile } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('inventory_diagrams')
      .insert({ name, created_by: profile.user?.id })
      .select()
      .single()
    setCreating(false)
    if (error) {
      setError(`建立失敗：${error.message}`)
      return
    }
    setNewName('')
    await load()
    if (data) setOpenId(data.id)
  }

  const renameDiagram = async (d: Diagram) => {
    const name = window.prompt('新名稱', d.name)
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === d.name) return
    if (diagrams.some((x) => x.name === trimmed)) {
      window.alert('已經有同名的入庫分類了')
      return
    }
    setRenamingId(d.id)
    setError(null)
    const { error } = await supabase.from('inventory_diagrams').update({ name: trimmed }).eq('id', d.id)
    setRenamingId(null)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  const deleteDiagram = async (id: string) => {
    if (!window.confirm('確定要刪除這個入庫分類嗎？')) return
    setDeletingId(id)
    setError(null)
    const { error } = await supabase.rpc('delete_inventory_diagram', { p_diagram_id: id })
    setDeletingId(null)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  if (openId) {
    return (
      <InventoryDiagramEditorPage
        diagramId={openId}
        onBack={() => {
          setOpenId(null)
          load()
        }}
      />
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">新增入庫分類</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例如：木雕大頭柴入庫分類"
            className="border rounded px-2 py-1.5 text-sm w-64"
          />
        </div>
        <button
          onClick={createDiagram}
          disabled={creating || !newName.trim() || nameTaken}
          className="bg-black text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {creating ? '建立中…' : '新增'}
        </button>
      </div>
      {nameTaken && <p className="text-xs text-red-600 mb-3">已經有同名的入庫分類了</p>}
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {loading ? (
        <div className="text-sm text-gray-500 mt-4">載入中…</div>
      ) : diagrams.length === 0 ? (
        <p className="text-sm text-gray-400 mt-4">還沒有任何入庫分類</p>
      ) : (
        <div className="border rounded-lg overflow-hidden mt-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b bg-gray-50">
                <th className="py-2 px-3">名稱</th>
                <th className="py-2 px-3">層數</th>
                <th className="py-2 px-3">建立時間</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {diagrams.map((d) => (
                <tr key={d.id} className="border-b last:border-b-0">
                  <td className="py-2 px-3">
                    <button onClick={() => setOpenId(d.id)} className="text-blue-700 hover:underline font-medium">
                      {d.name}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-gray-500">{layerCounts[d.id] ?? 0} 層</td>
                  <td className="py-2 px-3 text-gray-500">{formatDateTime(d.created_at)}</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => renameDiagram(d)}
                      disabled={renamingId === d.id}
                      className="text-blue-700 text-xs underline disabled:opacity-50 mr-3"
                    >
                      重命名
                    </button>
                    <button
                      onClick={() => deleteDiagram(d.id)}
                      disabled={deletingId === d.id}
                      className="text-red-600 text-xs underline disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
