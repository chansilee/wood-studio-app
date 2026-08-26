import { getMonthGrid } from '@/shared/lib/date'
import { SHIFT_STATUS_LABELS } from '@/shared/constants/roles'
import type { Enums } from '@/shared/types/database'

type ShiftStatus = Enums<'shift_status'>

export interface DayCell {
  status: ShiftStatus
  overrideName?: string
  /** true = fully masked (no schedule/attendance possible); false = advisory-only, still editable */
  overrideFullMask?: boolean
}

const STATUS_COLOR: Record<ShiftStatus, string> = {
  normal: 'bg-green-50 text-green-800',
  regular_off: 'bg-blue-50 text-blue-800',
  special_off: 'bg-purple-50 text-purple-800',
  unscheduled: 'bg-white text-gray-400',
}

/** same -50 tier as STATUS_COLOR, used bare (no text-*) for the corner triangle fill */
const STATUS_BG: Record<ShiftStatus, string> = {
  normal: 'bg-green-50',
  regular_off: 'bg-blue-50',
  special_off: 'bg-purple-50',
  unscheduled: 'bg-white',
}

const ADVISORY_OVERRIDE_COLOR = 'bg-amber-50 text-amber-800'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export function MonthCalendarGrid({
  year,
  month,
  cells,
  onDayClick,
  weekStartWeekday,
  minDate,
  readOnlyBefore,
}: {
  year: number
  month: number
  cells: Record<string, DayCell>
  onDayClick?: (date: string) => void
  /** 0=Sun..6=Sat; when set, draws a thick left border on that weekday's column */
  weekStartWeekday?: number
  /** dates before this (YYYY-MM-DD) are shown muted and are never clickable */
  minDate?: string | null
  /** dates before this (YYYY-MM-DD) are never clickable, but keep their normal colors (unlike minDate) */
  readOnlyBefore?: string | null
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
            const beforeMin = !!minDate && date < minDate
            const beforeReadOnly = !!readOnlyBefore && date < readOnlyBefore
            const isFullMasked = !!cell?.overrideName && !!cell?.overrideFullMask
            const isAdvisoryOverride = !!cell?.overrideName && !cell?.overrideFullMask
            const clickable = !!onDayClick && !isFullMasked && !beforeMin && !beforeReadOnly
            const isWeekStartCol = weekStartWeekday !== undefined && di === weekStartWeekday
            const colorClass = beforeMin
              ? 'bg-gray-100 text-gray-300'
              : isFullMasked
                ? 'bg-red-50 text-red-700'
                : isAdvisoryOverride
                  ? ADVISORY_OVERRIDE_COLOR
                  : STATUS_COLOR[cell?.status ?? 'unscheduled']
            return (
              <button
                key={di}
                type="button"
                disabled={!clickable}
                onClick={() => onDayClick?.(date)}
                className={`relative border p-1 h-20 text-left flex flex-col ${colorClass} ${
                  isWeekStartCol ? 'border-l-4 border-l-gray-900' : ''
                } ${clickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
              >
                {!beforeMin && isAdvisoryOverride && (
                  <div className="absolute bottom-0 right-0 w-10 h-10">
                    <div
                      className={`absolute inset-0 ${STATUS_BG[cell?.status ?? 'unscheduled']}`}
                      style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
                    />
                    <div
                      className="absolute border-t border-dashed border-gray-300"
                      style={{
                        width: '56.6px',
                        top: '20px',
                        left: '-8.3px',
                        transform: 'rotate(-45deg)',
                        transformOrigin: 'center',
                      }}
                    />
                  </div>
                )}
                <span className="relative z-10 text-xs text-gray-500">{day}</span>
                <span className="relative z-10 text-xs font-medium mt-1 break-words">
                  {beforeMin ? (
                    ''
                  ) : cell?.overrideName ? (
                    isFullMasked ? (
                      cell.overrideName
                    ) : (
                      <>
                        {cell.overrideName}
                        <br />原：{SHIFT_STATUS_LABELS[cell?.status ?? 'unscheduled']}
                      </>
                    )
                  ) : (
                    SHIFT_STATUS_LABELS[cell?.status ?? 'unscheduled']
                  )}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
