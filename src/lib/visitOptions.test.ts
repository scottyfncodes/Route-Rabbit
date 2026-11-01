import { describe, expect, it } from 'vitest'
import { TWICE_A_MONTH, type Patient } from '../types'
import { isVisitWeek, optionLabel, visitOptionsOf } from './visitOptions'

// 2025-01-06 is a Monday.
const created = new Date('2025-01-08T10:00:00').getTime() // a Wednesday in that week

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    initials: 'AB',
    address: '1 Main St',
    geo: { lat: 40, lng: -75 },
    visitDuration: 60,
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    windowStart: '08:00',
    windowEnd: '17:00',
    visitsPerWeek: 1,
    conflicts: [],
    status: 'active',
    priority: 'medium',
    makeupAvailable: false,
    createdAt: created,
    ...overrides,
  }
}

describe('visitOptionsOf', () => {
  it('builds a single option for patients saved before options existed', () => {
    expect(visitOptionsOf(patient())).toEqual([{ duration: 60, perWeek: 1 }])
  })

  it('returns saved options in order', () => {
    const options = [
      { duration: 60, perWeek: 1 },
      { duration: 30, perWeek: 2 },
    ]
    expect(visitOptionsOf(patient({ visitOptions: options }))).toEqual(options)
  })
})

describe('twice a month', () => {
  it('alternates weeks starting with the week the patient was added', () => {
    const p = patient()
    expect(isVisitWeek(p, '2025-01-06')).toBe(true)
    expect(isVisitWeek(p, '2025-01-13')).toBe(false)
    expect(isVisitWeek(p, '2025-01-20')).toBe(true)
    expect(isVisitWeek(p, '2024-12-30')).toBe(false)
  })

  it('reads plainly', () => {
    expect(optionLabel({ duration: 30, perWeek: TWICE_A_MONTH })).toBe('30 min, 2× a month')
  })
})
