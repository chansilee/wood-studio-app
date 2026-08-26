import { addMonths } from '@/shared/lib/date'

export function MonthSelector({
  value,
  onChange,
  centered,
}: {
  value: string
  onChange: (yearMonth: string) => void
  /** center the control and use a larger heading-style month label, for placement above a calendar */
  centered?: boolean
}) {
  const [y, m] = value.split('-').map(Number)

  return (
    <div className={`flex items-center gap-3 ${centered ? 'justify-center' : ''}`}>
      <button
        type="button"
        onClick={() => onChange(addMonths(value, -1))}
        aria-label="上個月"
        className="border rounded px-2 py-1"
      >
        &lt;
      </button>
      <span className={centered ? 'text-lg font-medium' : 'text-sm font-medium'}>
        {y}年 - {m}月
      </span>
      <button
        type="button"
        onClick={() => onChange(addMonths(value, 1))}
        aria-label="下個月"
        className="border rounded px-2 py-1"
      >
        &gt;
      </button>
    </div>
  )
}
