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

describe('assignWeekDays across the map and the clock', () => {
  const HOME = { lat: 40, lng: -75 }
  const at = (eastMi: number, northMi: number) => ({ lat: HOME.lat + northMi / 69, lng: HOME.lng + eastMi / 53 })

  it('keeps each day to one part of town when the load is the same either way', () => {
    const north = Array.from({ length: 5 }, (_, i) => patient({ geo: at(i * 0.5, 12) }))
    const south = Array.from({ length: 5 }, (_, i) => patient({ geo: at(i * 0.5, -12) }))
    const assigned = assignWeekDays([...north, ...south], { home: HOME })
    const counts = perDay(assigned)
    for (const d of WEEKDAYS_ONLY) expect(counts[d]).toBe(2)
    const mixed = WEEKDAYS_ONLY.filter((d) => {
      const on = (ps: Patient[]) => ps.some((p) => assigned.get(p.id)!.includes(d))
      return on(north) && on(south)
    })
    expect(mixed.length).toBeLessThanOrEqual(1)
  })

  it('does not stack more after-school visits on one afternoon than fit', () => {
    const afterSchool = Array.from({ length: 5 }, () => patient({ windowStart: '15:00', windowEnd: '17:00', visitDuration: 45 }))
    const allDay = Array.from({ length: 10 }, () => patient({ visitDuration: 45 }))
    const assigned = assignWeekDays([...allDay, ...afterSchool])
    const perDayAfterSchool = WEEKDAYS_ONLY.map((d) => afterSchool.filter((p) => assigned.get(p.id)!.includes(d)).length)
    expect(Math.max(...perDayAfterSchool)).toBe(1)
  })

  it('works around blocked times on specific weekdays', () => {
    // Free 3-5 PM, but blocked Mon-Thu: Friday is the only day the visit can happen.
    const blocked = (['Mon', 'Tue', 'Wed', 'Thu'] as Weekday[]).map((day, i) => ({ id: `c${i}`, day, startTime: '15:00', endTime: '17:00' }))
    const p = patient({ windowStart: '15:00', windowEnd: '17:00', conflicts: blocked })
    const others = Array.from({ length: 4 }, () => patient({ windowStart: '15:00', windowEnd: '17:00' }))
    expect(assignWeekDays([...others, p]).get(p.id)).toEqual(['Fri'])
  })

  it('lets high priority patients pick first', () => {
    // Everyone wants the same lone afternoon slot on their only free days; the high priority patient gets the open one.
    const high = patient({ priority: 'high', availableDays: ['Mon', 'Tue'], windowStart: '15:00', windowEnd: '16:00', visitDuration: 60 })
    const low = patient({ priority: 'low', id: 'a-first-by-id', availableDays: ['Mon', 'Tue'], windowStart: '15:00', windowEnd: '16:00', visitDuration: 60 })
    const fixedMon = patient({ availableDays: ['Mon'], visitsPerWeek: 1, windowStart: '15:00', windowEnd: '16:00', visitDuration: 60 })
    const assigned = assignWeekDays([low, fixedMon, high])
    expect(assigned.get(high.id)).toEqual(['Tue'])
    expect(assigned.get(low.id)).toEqual(['Mon'])
  })
})
