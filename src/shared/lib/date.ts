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

/** Adds `delta` days to a 'YYYY-MM-DD' string, handling month/year rollover */
export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  return toDateStr(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** Adds `delta` months to a 'YYYY-MM' string, handling year rollover */
export function addMonths(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const newY = Math.floor(total / 12)
  const newM = (total % 12) + 1
  return `${newY}-${pad2(newM)}`
}

export function todayStr(): string {
  const now = new Date()
  return toDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** Default 'YYYY-MM' for 排班系統: next month once past the 25th, when enabled via org_settings */
export function defaultSchedulingYearMonth(enabled: boolean): string {
  const today = todayStr()
  const day = Number(today.slice(8, 10))
  const base = today.slice(0, 7)
  return enabled && day >= 25 ? addMonths(base, 1) : base
}

/** Default 'YYYY-MM' for 月結系統: last month through the 5th, when enabled via org_settings */
export function defaultSettlementYearMonth(enabled: boolean): string {
  const today = todayStr()
  const day = Number(today.slice(8, 10))
  const base = today.slice(0, 7)
  return enabled && day <= 5 ? addMonths(base, -1) : base
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

/** Formats 'YYYY-MM-DD' as 'YYYY/M/D' (no leading zeros on month/day) */
export function formatDateSlash(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y}/${m}/${d}`
}

/** 0=Sunday..6=Saturday, matching JS Date#getDay() */
export function weekdayFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

/**
 * Checks whether every calendar week fully contained within the given month
 * (per weekStartWeekday) has at least one '例假' (regular_off) and one
 * '休假' (special_off) day. Weeks that spill into the previous/next month,
 * or that start before the member's hire date (never schedulable, so
 * always empty), are not "complete" and are skipped, per spec.
 */
export function checkWeeklyRestCompliance(
  year: number,
  month: number,
  weekStartWeekday: number,
  statusMap: Record<string, string | undefined>,
  hireDate?: string | null
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

    const weekStartStr = toDateStr(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate())
    if (hireDate && weekStartStr < hireDate) {
      cursor.setDate(cursor.getDate() + 7)
      continue
    }

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

/**
 * Counts consecutive '正常班' (normal) days immediately before `beforeDate`,
 * walking backward through `statusMap`. Stops at the first non-normal or
 * missing day, or once `cursor` would fall before `hireDate` (exclusive).
 */
export function countCarryInStreak(
  beforeDate: string,
  statusMap: Record<string, string | undefined>,
  hireDate?: string | null
): number {
  let streak = 0
  let cursor = prevDateStr(beforeDate)
  while (!hireDate || cursor >= hireDate) {
    if (statusMap[cursor] !== 'normal') break
    streak += 1
    cursor = prevDateStr(cursor)
  }
  return streak
}

/**
 * Checks that no run of '正常班' days within the month (continuing a streak
 * carried in from before the 1st, e.g. from the previous month) reaches 7.
 * `carryInStreak` is the count of consecutive normal days immediately
 * preceding the 1st of this month (see countCarryInStreak).
 */
export function checkMaxConsecutiveWorkDays(
  year: number,
  month: number,
  statusMap: Record<string, string | undefined>,
  carryInStreak: number
): boolean {
  const total = daysInMonth(year, month)
  let streak = carryInStreak
  for (let day = 1; day <= total; day++) {
    const key = toDateStr(year, month, day)
    if (statusMap[key] === 'normal') {
      streak += 1
      if (streak > 6) return false
    } else {
      streak = 0
    }
  }
  return true
}
