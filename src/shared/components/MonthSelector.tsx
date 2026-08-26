import { addMonths } from '@/shared/lib/date'

export function MonthSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (yearMonth: string) => void
}) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">月份</label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(addMonths(value, -1))}
          aria-label="上個月"
          className="border rounded px-2 py-1"
        >
          &lt;
        </button>
        <input
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <button
          type="button"
          onClick={() => onChange(addMonths(value, 1))}
          aria-label="下個月"
          className="border rounded px-2 py-1"
        >
          &gt;
        </button>
      </div>
    </div>
  )
}
