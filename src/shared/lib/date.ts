export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** 7-column (Sun..Sat) week grid of date strings for a given year/month; '' for leading/trailing blanks */
export function getMonthGrid(year: number, month: number): string[][] {
  const total = daysInMonth(year, month)
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const cells: string[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push('')
  for (let d = 1; d <= total; d++) cells.push(toDateStr(year, month, d))
  while (cells.length % 7 !== 0) cells.push('')
  const weeks: string[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function nextDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + 1)
  return toDateStr(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function prevDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d - 1)
  return toDateStr(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function todayStr(): string {
  const now = new Date()
  return toDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** Formats an ISO timestamp as 'YYYY/MM/DD HH:mm:ss' in the viewer's local time */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const mo = pad2(d.getMonth() + 1)
  const da = pad2(d.getDate())
  const h = pad2(d.getHours())
  const mi = pad2(d.getMinutes())
  const s = pad2(d.getSeconds())
  return `${y}/${mo}/${da} ${h}:${mi}:${s}`
}

/** 0=Sunday..6=Saturday, matching JS Date#getDay() */
export function weekdayFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

/**
 * Checks whether every calendar week fully contained within the given month
 * (per weekStartWeekday) has at least one '例假' (regular_off) and one
 * '休假' (special_off) day. Weeks that spill into the previous/next month
 * are not "complete" and are skipped, per spec.
 */
export function checkWeeklyRestCompliance(
  year: number,
  month: number,
  weekStartWeekday: number,
  statusMap: Record<string, string | undefined>
): boolean {
  const total = daysInMonth(year, month)
  const lastDate = new Date(year, month - 1, total)

  const cursor = new Date(year, month - 1, 1)
  while (cursor.getDay() !== weekStartWeekday) {
    cursor.setDate(cursor.getDate() + 1)
  }

  let compliant = true
  while (true) {
    const weekEnd = new Date(cursor)
    weekEnd.setDate(weekEnd.getDate() + 6)
    if (weekEnd > lastDate) break

    let hasRegularOff = false
    let hasSpecialOff = false
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor)
      d.setDate(d.getDate() + i)
      const key = toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate())
      const status = statusMap[key]
      if (status === 'regular_off') hasRegularOff = true
      if (status === 'special_off') hasSpecialOff = true
    }
    if (!(hasRegularOff && hasSpecialOff)) compliant = false

    cursor.setDate(cursor.getDate() + 7)
  }

  return compliant
}
