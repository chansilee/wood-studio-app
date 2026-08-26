import { formatDateTime } from '@/shared/lib/date'
import type { Publication } from './usePublications'

export function PublicationStatusLine({
  publications,
  viewingId,
  onChange,
}: {
  publications: Publication[]
  /** null = latest publication */
  viewingId: string | null
  onChange: (id: string | null) => void
}) {
  if (publications.length === 0) {
    return <p className="text-sm text-gray-400 mb-3">目前狀態：尚未公告過</p>
  }

  const activeId = viewingId ?? publications[0].id
  const active = publications.find((p) => p.id === activeId) ?? publications[0]
  const isLatest = active.id === publications[0].id

  return (
    <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
      <span className="text-gray-700">
        目前狀態：<span className="font-medium">{active.published_by_name ?? '未知'}</span> 於{' '}
        {formatDateTime(active.published_at)}
        {isLatest ? '（最新公告）' : '（歷史版本）'}
      </span>
      {publications.length > 1 && (
        <select
          value={activeId}
          onChange={(e) => onChange(e.target.value)}
          className="border rounded px-2 py-1 text-xs"
        >
          {publications.map((p, idx) => (
            <option key={p.id} value={p.id}>
              {formatDateTime(p.published_at)}
              {idx === 0 ? '（最新公告）' : '（歷史版本）'}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
