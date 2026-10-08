import { describe, expect, it } from 'vitest'
import { EXAMPLE_DAY, summarizeDay } from './daySummary'
import type { DayPlan, Patient, Stop } from '../types'

const patient = (id: string, initials: string): Patient => ({
  id,
  initials,
  address: '',
  geo: null,
  visitDuration: 45,
  availableDays: ['Mon'],
  windowStart: '08:00',
  windowEnd: '17:00',
  visitsPerWeek: null,
  conflicts: [],
  status: 'active',
  priority: 'medium',
  makeupAvailable: false,
  createdAt: 0,
})

const stop = (over: Partial<Stop> & Pick<Stop, 'id' | 'kind'>): Stop => ({
  label: over.kind,
  arrive: '08:00',
  depart: '08:00',
  driveMinutesFromPrev: 0,
  driveMilesFromPrev: 0,
  geo: null,
  ...over,
})

const plan = (over: Partial<DayPlan>): DayPlan => ({
  date: '2026-10-05',
  dayStartTime: '08:00',
  startLocation: { label: 'Start', address: '', geo: null },
  endLocation: { label: 'End', address: '', geo: null },
  patientIds: [],
  cancelledPatientIds: [],
  makeupPatientIds: [],
  lunch: { enabled: false, earliest: '11:30', latest: '13:30', duration: 30 },
  currentLocationOverride: null,
  activeStopId: null,
  result: null,
  ...over,
})

describe('summarizeDay', () => {
  const patientsById = new Map([
    ['p1', patient('p1', 'J.M.')],
    ['p2', patient('p2', 'A.R.')],
  ])

  it('returns null when the day has no plan or no built route', () => {
    expect(summarizeDay(undefined, patientsById)).toBeNull()
    expect(summarizeDay(plan({}), patientsById)).toBeNull()
  })

  it('lists visits in route order with the day totals', () => {
    const built = plan({
      patientIds: ['p1', 'p2'],
      result: {
        builtAt: 0,
        stops: [
          stop({ id: 's', kind: 'start' }),
          stop({ id: 'v1', kind: 'visit', patientId: 'p1', label: 'J.M.', arrive: '08:14', depart: '08:59', driveMinutesFromPrev: 14.4 }),
          stop({ id: 'l', kind: 'lunch', arrive: '11:30', depart: '12:00' }),
          stop({ id: 'v2', kind: 'visit', patientId: 'p2', label: 'A.R.', arrive: '12:20', depart: '13:20', driveMinutesFromPrev: 19.6 }),
          stop({ id: 'e', kind: 'end' }),
        ],
        totalTherapyMinutes: 105,
        totalDriveMinutes: 48.2,
        totalMiles: 12.3,
        openMinutes: 0,
        visitCount: 2,
        efficiency: 70,
        conflicts: [],
        googleMapsUrl: null,
        weatherNote: null,
      },
    })

    const summary = summarizeDay(built, patientsById)
    expect(summary).toEqual({
      visits: [
        { initials: 'J.M.', arrive: '08:14', driveMinutesFromPrev: 14 },
        { initials: 'A.R.', arrive: '12:20', driveMinutesFromPrev: 20 },
      ],
      visitCount: 2,
      totalDriveMinutes: 48,
      totalMiles: 12.3,
      firstVisitTime: '08:14',
    })
  })

  it('drops visits cancelled for the day and falls back to the stop label for unknown patients', () => {
    const built = plan({
      cancelledPatientIds: ['p1'],
      result: {
        builtAt: 0,
        stops: [
          stop({ id: 'v1', kind: 'visit', patientId: 'p1', label: 'J.M.', arrive: '08:14' }),
          stop({ id: 'v2', kind: 'visit', patientId: 'gone', label: 'Z.Z.', arrive: '09:30' }),
        ],
        totalTherapyMinutes: 0,
        totalDriveMinutes: 0,
        totalMiles: 0,
        openMinutes: 0,
        visitCount: 2,
        efficiency: 0,
        conflicts: [],
        googleMapsUrl: null,
        weatherNote: null,
      },
    })

    const summary = summarizeDay(built, patientsById)
    expect(summary?.visits.map((v) => v.initials)).toEqual(['Z.Z.'])
    expect(summary?.visitCount).toBe(1)
    expect(summary?.firstVisitTime).toBe('09:30')
  })

  it('ships an example day that is internally consistent', () => {
    expect(EXAMPLE_DAY.visitCount).toBe(EXAMPLE_DAY.visits.length)
    expect(EXAMPLE_DAY.firstVisitTime).toBe(EXAMPLE_DAY.visits[0].arrive)
  })
})
