import type { DayPlan, Patient } from '../types'

/** One visit row for the Home dashboard's at-a-glance view of the day. */
export interface DayVisit {
  initials: string
  arrive: string // "HH:MM"
  driveMinutesFromPrev: number
}

export interface DaySummary {
  visits: DayVisit[]
  visitCount: number
  totalDriveMinutes: number
  totalMiles: number
  /** Arrival time of the first visit, "HH:MM". null when the day has no visits. */
  firstVisitTime: string | null
}

/**
 * Boils a built day plan down to what the Home dashboard shows: visits in route
 * order plus the day's totals. Returns null when the day has no built route yet,
 * so the caller can show the right empty state instead of all-zero stats.
 */
export function summarizeDay(plan: DayPlan | undefined, patientsById: Map<string, Patient>): DaySummary | null {
  const result = plan?.result
  if (!plan || !result) return null

  const visits: DayVisit[] = result.stops
    .filter((s) => s.kind === 'visit' && !(s.patientId && plan.cancelledPatientIds.includes(s.patientId)))
    .map((s) => ({
      initials: (s.patientId && patientsById.get(s.patientId)?.initials) || s.label,
      arrive: s.arrive,
      driveMinutesFromPrev: Math.round(s.driveMinutesFromPrev),
    }))

  return {
    visits,
    visitCount: visits.length,
    totalDriveMinutes: Math.round(result.totalDriveMinutes),
    totalMiles: result.totalMiles,
    firstVisitTime: visits[0]?.arrive ?? null,
  }
}

/**
 * A fictional day shown (clearly labeled) before any patients exist, so the
 * dashboard demonstrates what it does rather than opening on an empty form.
 * Initials are invented and belong to no one.
 */
export const EXAMPLE_DAY: DaySummary = {
  visits: [
    { initials: 'J.M.', arrive: '09:00', driveMinutesFromPrev: 14 },
    { initials: 'A.R.', arrive: '10:15', driveMinutesFromPrev: 19 },
    { initials: 'K.T.', arrive: '13:00', driveMinutesFromPrev: 22 },
  ],
  visitCount: 3,
  totalDriveMinutes: 73,
  totalMiles: 21.4,
  firstVisitTime: '09:00',
}
