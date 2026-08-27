import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { MonthSelector } from '@/shared/components/MonthSelector'
import { daysInMonth, getMonthGrid, pad2, preferenceEditableYearMonth } from '@/shared/lib/date'
import { CALENDAR_OVERRIDE_FULL_MASK, CALENDAR_OVERRIDE_LABELS } from '@/shared/constants/roles'
import type { Enums } from '@/shared/types/database'

type Preference = Enums<'schedule_preference_type'>
type Brush = Preference | 'clear'
type OverrideType = Enums<'calendar_override_type'>
type OverrideInfo = { name: string; type: OverrideType }

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const BRUSH_OPTIONS: { value: Brush; label: string }[] = [
  { value: 'prefer_work', label: '這天我想上班' },
  { value: 'prefer_off', label: '這天我不能上班' },
  { value: 'clear', label: '這天我隨意' },
]

export function SchedulingPreferenceView() {
  const { profile } = useAuth()
  const [yearMonth, setYearMonth] = useState(preferenceEditableYearMonth())
  const [prefMap, setPrefMap] = useState<Record<string, Preference>>({})
  const [overridesMap, setOverridesMap] = useState<Record<string, OverrideInfo>>({})
  const [loading, setLoading] = useState(true)
  const [brush, setBrush] = useState<Brush>('prefer_work')
  const [error, setError] = useState<string | null>(null)
  const loadSeq = useRef(0)

  const editableYearMonth = preferenceEditableYearMonth()
  const editable = yearMonth === editableYearMonth
  const [year, month] = yearMonth.split('-').map(Number)
  const weeks = getMonthGrid(year, month)

  const load = async () => {
    if (!profile) return
    const seq = ++loadSeq.current
    setLoading(true)
    const firstDay = `${yearMonth}-01`
    const lastDay = `${yearMonth}-${pad2(daysInMonth(year, month))}`
    const [{ data }, { data: overrideRows }] = await Promise.all([
      supabase
        .from('schedule_preferences')
        .select('work_date, preference')
        .eq('member_id', profile.id)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('calendar_overrides')
        .select('override_date, name, type')
        .gte('override_date', firstDay)
        .lte('override_date', lastDay),
    ])

    if (seq !== loadSeq.current) return
    const map: Record<string, Preference> = {}
    for (const r of data ?? []) map[r.work_date] = r.preference
    setPrefMap(map)

    const overrides: Record<string, OverrideInfo> = {}
    for (const o of overrideRows ?? []) overrides[o.override_date] = { name: o.name, type: o.type }
    setOverridesMap(overrides)

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, yearMonth])

  const applyBrush = async (date: string) => {
    if (!editable || !profile) return
    setError(null)
    const previous = prefMap[date]

    if (brush === 'clear') {
      if (!previous) return
      setPrefMap((prev) => {
        const next = { ...prev }
        delete next[date]
        return next
      })
      const { error } = await supabase
        .from('schedule_preferences')
        .delete()
        .eq('member_id', profile.id)
        .eq('work_date', date)
      if (error) {
        setPrefMap((prev) => ({ ...prev, [date]: previous }))
        setError(`操作失敗：${error.message}`)
      }
      return
    }

    setPrefMap((prev) => ({ ...prev, [date]: brush }))
    const { error } = await supabase
      .from('schedule_preferences')
      .upsert(
        { member_id: profile.id, work_date: date, preference: brush },
        { onConflict: 'member_id,work_date' }
      )
    if (error) {
      setPrefMap((prev) => {
        const next = { ...prev }
        if (previous) next[date] = previous
        else delete next[date]
        return next
      })
      setError(`操作失敗：${error.message}`)
    }
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        目前開放填寫 [{editableYearMonth}] 的排班喜好；其餘月份僅供查看，無法編輯。
      </p>

      <div className="flex flex-wrap gap-2 mb-2">
        {BRUSH_OPTIONS.map((b) => (
          <button
            key={b.value}
            type="button"
            disabled={!editable}
            aria-pressed={brush === b.value}
            onClick={() => setBrush(b.value)}
            className={`px-3 py-1.5 rounded text-sm border transition ${
              !editable
                ? 'bg-white text-gray-300 border-gray-200 cursor-not-allowed'
                : brush === b.value
                  ? 'bg-black text-white border-black ring-2 ring-offset-1 ring-black'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      <div className="mb-2">
        <MonthSelector value={yearMonth} onChange={setYearMonth} centered />
      </div>

      {loading ? (
        <div>載入中…</div>
      ) : (
        <div className={`border rounded overflow-hidden ${!editable ? 'bg-gray-100' : ''}`}>
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
                const day = Number(date.slice(-2))
                const pref = prefMap[date]
                const override = overridesMap[date]
                const overrideFullMask = !!override && CALENDAR_OVERRIDE_FULL_MASK[override.type]
                const overrideColorClass = override
                  ? overrideFullMask
                    ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-800'
                  : ''
                const clickable = editable && !overrideFullMask
                const borderClass =
                  pref === 'prefer_work'
                    ? 'border-green-500'
                    : pref === 'prefer_off'
                      ? 'border-red-500'
                      : 'border-transparent'
                const label = pref === 'prefer_work' ? '偏好上班' : pref === 'prefer_off' ? '偏好放假' : ''
                const labelColorClass = pref === 'prefer_work' ? 'text-green-500' : 'text-red-500'
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={!clickable}
                    onClick={() => applyBrush(date)}
                    className={`relative border p-1 h-20 text-left flex flex-col ${overrideColorClass} ${
                      clickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'
                    } ${!editable ? 'opacity-50' : ''}`}
                  >
                    <div
                      className={`absolute inset-[1px] border-[5px] rounded-sm pointer-events-none ${borderClass}`}
                    />
                    <span className="relative z-10 text-xs text-gray-500">{day}</span>
                    {override && (
                      <span className="relative z-10 text-[11px] font-medium mt-1 break-words">
                        {override.name || CALENDAR_OVERRIDE_LABELS[override.type]}
                      </span>
                    )}
                    {label && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className={`text-xs font-medium ${labelColorClass}`}>{label}</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
