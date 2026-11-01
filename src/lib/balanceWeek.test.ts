import { describe, expect, it } from 'vitest'
import { TWICE_A_MONTH, WEEKDAYS, type Patient, type Weekday } from '../types'
import { assignWeekDays } from './balanceWeek'

const WEEKDAYS_ONLY: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

let seq = 0
function patient(overrides: Partial<Patient> = {}): Patient {
  seq += 1
  return {
    id: `p${String(seq).padStart(3, '0')}`,
    initials: 'AB',
    address: '1 Main St',
    geo: { lat: 40, lng: -75 },
    visitDuration: 45,
    availableDays: WEEKDAYS_ONLY,
    windowStart: '08:00',
    windowEnd: '17:00',
    visitsPerWeek: 1,
    conflicts: [],
    status: 'active',
    priority: 'medium',
    makeupAvailable: false,
    createdAt: 0,
    ...overrides,
  }
}

function perDay(assigned: Map<string, Weekday[]>): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(WEEKDAYS.map((d) => [d, 0]))
  for (const days of assigned.values()) for (const d of days) counts[d] += 1
  return counts
}

describe('assignWeekDays', () => {
  it('spreads once-a-week patients evenly instead of stacking them on one day', () => {
    const patients = Array.from({ length: 15 }, () => patient())
    const counts = perDay(assignWeekDays(patients))
    for (const d of WEEKDAYS_ONLY) expect(counts[d]).toBe(3)
  })

  it('keeps a mixed caseload within one visit of even', () => {
    const patients = [
      ...Array.from({ length: 8 }, () => patient({ visitsPerWeek: 2 })),
      ...Array.from({ length: 6 }, () => patient({ visitsPerWeek: 1 })),
      ...Array.from({ length: 3 }, () => patient({ visitsPerWeek: 3 })),
    ]
    const counts = WEEKDAYS_ONLY.map((d) => perDay(assignWeekDays(patients))[d])
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('places patients with fewer choices first and fills in around them', () => {
    const tuesdayOnly = Array.from({ length: 4 }, () => patient({ availableDays: ['Tue'] }))
    const flexible = Array.from({ length: 4 }, () => patient())
    const assigned = assignWeekDays([...flexible, ...tuesdayOnly])
    for (const p of tuesdayOnly) expect(assigned.get(p.id)).toEqual(['Tue'])
    for (const p of flexible) expect(assigned.get(p.id)).not.toContain('Tue')
  })

  it('keeps a patient’s visits off back-to-back days when it can', () => {
    for (const days of assignWeekDays(Array.from({ length: 5 }, () => patient({ visitsPerWeek: 2 }))).values()) {
      const [a, b] = days.map((d) => WEEKDAYS.indexOf(d))
      expect(b - a).toBeGreaterThan(1)
    }
  })

  it('gives every available day to patients seen every day they can be', () => {
    const p = patient({ visitsPerWeek: null, availableDays: ['Mon', 'Wed'] })
    expect(assignWeekDays([p]).get(p.id)).toEqual(['Mon', 'Wed'])
  })

  it('gives twice-a-month patients one day', () => {
    const p = patient({ visitsPerWeek: TWICE_A_MONTH })
    expect(assignWeekDays([p]).get(p.id)).toHaveLength(1)
  })

  it('gives the same days for the same caseload', () => {
    const patients = Array.from({ length: 10 }, (_, i) => patient({ visitsPerWeek: (i % 3) + 1 }))
    expect(assignWeekDays(patients)).toEqual(assignWeekDays([...patients].reverse()))
  })
})
