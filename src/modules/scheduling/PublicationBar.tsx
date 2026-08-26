import { formatDateTime } from '@/shared/lib/date'
import type { Publication } from './usePublications'

export function PublicationBar({
  publications,
  viewingId,
  onChange,
  editable = false,
  onRevert,
  reverting = false,
}: {
  publications: Publication[]
  viewingId: string | 'live'
  onChange: (id: string | 'live') => void
  editable?: boolean
  /** shows a "還原回最新公告狀態" button next to the 暫態 option when provided */
  onRevert?: () => void
  reverting?: boolean
}) {
  const latest = publications[0]

  return (
    <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
      {latest ? (
        <span className="text-gray-600">
          本表由 <span className="font-medium text-gray-900">{latest.published_by_name ?? '未知'}</span>{' '}
          更新於 {formatDateTime(latest.published_at)}
        </span>
      ) : (
        <span className="text-gray-400">尚未公告過</span>
      )}
      {publications.length > 0 && (
        <select
          value={viewingId}
          onChange={(e) => onChange(e.target.value)}
          className="border rounded px-2 py-1 text-xs"
        >
          <option value="live">{editable ? '暫態（可編輯）' : '目前'}</option>
          {publications.map((p, idx) => (
            <option key={p.id} value={p.id}>
              {formatDateTime(p.published_at)}
              {idx === 0 ? '（最新公告）' : '（歷史版本）'}
            </option>
          ))}
        </select>
      )}
      {editable && viewingId === 'live' && onRevert && latest && (
        <button
          onClick={onRevert}
          disabled={reverting}
          className="text-xs border rounded px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {reverting ? '還原中…' : '還原回最新公告狀態'}
        </button>
      )}
      {editable && viewingId !== 'live' && (
        <span className="text-xs text-red-600">正在檢視歷史版本，唯讀無法編輯</span>
      )}
    </div>
  )
}
