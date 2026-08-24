import { getMonthGrid } from '@/shared/lib/date'
import { SHIFT_STATUS_LABELS } from '@/shared/constants/roles'
import type { Enums } from '@/shared/types/database'

type ShiftStatus = Enums<'shift_status'>

export interface DayCell {
  status: ShiftStatus
  overrideName?: string
}

const STATUS_COLOR: Record<ShiftStatus, string> = {
  normal: 'bg-green-50 text-green-800',
  regular_off: 'bg-blue-50 text-blue-800',
  special_off: 'bg-purple-50 text-purple-800',
  unscheduled: 'bg-white text-gray-400',
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export function MonthCalendarGrid({
  year,
  month,
  cells,
  onDayClick,
}: {
  year: number
  month: number
  cells: Record<string, DayCell>
  onDayClick?: (date: string) => void
}) {
  const weeks = getMonthGrid(year, month)

  return (
    <div className="border rounded overflow-hidden">
      <div className="grid grid-cols-7 bg-gray-50 text-xs text-gray-500">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="p-2 text-center border-b">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((date, di) => {
            if (!date) return <div key={di} className="border p-2 h-20 bg-gray-50" />
            const cell = cells[date]
            const day = Number(date.slice(-2))
            const clickable = !!onDayClick && !cell?.overrideName
            const colorClass = cell?.overrideName
              ? 'bg-red-50 text-red-700'
              : STATUS_COLOR[cell?.status ?? 'unscheduled']
            return (
              <button
                key={di}
                type="button"
                disabled={!clickable}
                onClick={() => onDayClick?.(date)}
                className={`border p-1 h-20 text-left flex flex-col ${colorClass} ${
                  clickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'
                }`}
              >
                <span className="text-xs text-gray-500">{day}</span>
                <span className="text-xs font-medium mt-1 break-words">
                  {cell?.overrideName ?? SHIFT_STATUS_LABELS[cell?.status ?? 'unscheduled']}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
