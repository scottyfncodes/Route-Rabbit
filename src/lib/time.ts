import type { Weekday } from '../types'

/** Parse "HH:MM" (24h) into minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Format minutes since midnight back to "HH:MM" (24h, zero-padded). */
export function fromMinutes(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Format "HH:MM" 24h into "8:00 AM" style for display. */
export function formatTime(hhmm: string): string {
  const mins = toMinutes(hhmm)
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const period = h24 >= 12 ? 'PM' : 'AM'
  let h12 = h24 % 12
  if (h12 === 0) h12 = 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/** Compact "8:00" / "1:15" without AM/PM, for tight timeline rows where a period heading already gives the day. */
export function formatTimeShort(hhmm: string): string {
  const mins = toMinutes(hhmm)
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  let h12 = h24 % 12
  if (h12 === 0) h12 = 12
  return `${h12}:${String(m).padStart(2, '0')}`
}

export function formatDuration(mins: number): string {
  const m = Math.round(mins)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

const WEEKDAY_FROM_JS_DAY: Weekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekdayOf(dateStr: string): Weekday {
  const d = new Date(`${dateStr}T00:00:00`)
  return WEEKDAY_FROM_JS_DAY[d.getDay()]
}

export function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDateHeading(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

export function formatDays(days: Weekday[]): string {
  const order: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const selected = order.filter((d) => days.includes(d))
  if (selected.length === 0) return 'No days selected'
  if (selected.length === 7) return 'Every day'
  if (
    selected.length === 5 &&
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].every((d) => selected.includes(d as Weekday))
  ) {
    return 'Mon–Fri'
  }
  // collapse consecutive runs, e.g. Mon,Tue,Wed,Fri -> Mon–Wed, Fri
  const groups: Weekday[][] = []
  for (const day of selected) {
    const last = groups[groups.length - 1]
    if (last && order.indexOf(last[last.length - 1]) + 1 === order.indexOf(day)) {
      last.push(day)
    } else {
      groups.push([day])
    }
  }
  return groups.map((g) => (g.length > 1 ? `${g[0]}–${g[g.length - 1]}` : g[0])).join(', ')
}

export function startOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  const jsDay = d.getDay() // 0 = Sun
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay
  return addDays(dateStr, mondayOffset)
}
