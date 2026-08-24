import { SHIFT_STATUS_LABELS } from '@/shared/constants/roles'
import type { Enums } from '@/shared/types/database'

const ITEMS: { status: Enums<'shift_status'>; className: string }[] = [
  { status: 'normal', className: 'bg-green-50 text-green-800 border-green-200' },
  { status: 'regular_off', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  { status: 'special_off', className: 'bg-purple-50 text-purple-800 border-purple-200' },
  { status: 'unscheduled', className: 'bg-white text-gray-400 border-gray-200' },
]

export function Legend() {
  return (
    <div className="flex flex-wrap gap-2 mb-3 text-xs">
      {ITEMS.map((item) => (
        <span key={item.status} className={`px-2 py-1 rounded border ${item.className}`}>
          {SHIFT_STATUS_LABELS[item.status]}
        </span>
      ))}
      <span className="px-2 py-1 rounded border bg-red-50 text-red-700 border-red-200">
        假日/特殊假（遮罩，不可編輯）
      </span>
    </div>
  )
}
