import type { RoadCondition } from '../../types'

/** "just now", "4 min ago", "2 hr ago" */
export function updatedAgo(iso: string, nowMs = Date.now()): string {
  const mins = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000))
  if (Number.isNaN(mins) || mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  return `${Math.round(mins / 60)} hr ago`
}

export const COTRIP_URL = 'https://www.cotrip.org'

export function conditionIcon(c: RoadCondition): string {
  const label = c.label.toLowerCase()
  if (c.closed) return '⛔'
  if (/snow|ic[ey]|slush|packed|frost|freez/.test(label)) return '❄️'
  if (/fog/.test(label)) return '🌫️'
  if (/wet|rain/.test(label)) return '💧'
  return c.impact > 0 ? '⚠️' : '✅'
}
