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

export function todayStr(): string {
  const now = new Date()
  return toDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate())
}
