import { describe, expect, it } from 'vitest'
import { buildRoute, selectWeeklyDays, type RoutingInput } from './routing'
import { toMinutes } from './time'
import type { GeoPoint, Patient, Stop } from '../types'

// 2025-01-06 is a Monday.
const MONDAY = '2025-01-06'
const HOME: GeoPoint = { lat: 40.0, lng: -75.0 }

/** A point roughly `miles` east of home. */
const east = (miles: number): GeoPoint => ({ lat: HOME.lat, lng: HOME.lng + miles / 53 })

let seq = 0
function patient(overrides: Partial<Patient> = {}): Patient {
  seq += 1
  return {
    id: `p${seq}`,
    initials: `P${seq}`,
    address: `${seq} Main St`,
    geo: east(seq),
    visitDuration: 45,
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    windowStart: '08:00',
    windowEnd: '17:00',
    visitsPerWeek: null,
    conflicts: [],
    status: 'active',
    priority: 'medium',
    makeupAvailable: false,
    createdAt: 0,
    ...overrides,
  }
}

function input(patients: Patient[], overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    date: MONDAY,
    dayStartTime: '08:00',
    startLocation: { label: 'Home', address: 'home', geo: HOME },
    endLocation: { label: 'Home', address: 'home', geo: HOME },
    patients,
    lunch: { enabled: false, earliest: '11:30', latest: '13:30', duration: 30 },
    avgSpeedMph: 30,
    ...overrides,
  }
}

const visitOrder = (stops: Stop[]) => stops.filter((s) => s.kind === 'visit').map((s) => s.patientId)

/** Every stop starts no earlier than the previous one ended plus the drive between them. */
function expectConsistentTimeline(stops: Stop[]) {
  for (let i = 1; i < stops.length; i++) {
    const prevDepart = toMinutes(stops[i - 1].depart)
    expect(toMinutes(stops[i].arrive)).toBeGreaterThanOrEqual(prevDepart + stops[i].driveMinutesFromPrev - 1)
  }
}

describe('buildRoute', () => {
  it('visits patients in a sensible geographic order and returns home', () => {
    const far = patient({ geo: east(10) })
    const near = patient({ geo: east(2) })
    const mid = patient({ geo: east(5) })
    const result = buildRoute(input([far, near, mid]))

    expect(result.visitCount).toBe(3)
    expect(visitOrder(result.stops)).toEqual([near.id, mid.id, far.id])
    expect(result.stops[0].kind).toBe('start')
    expect(result.stops[result.stops.length - 1].kind).toBe('end')
    expect(result.conflicts).toEqual([])
    expectConsistentTimeline(result.stops)
  })

  it('respects availability windows and blocked times', () => {
    const late = patient({ windowStart: '13:00', windowEnd: '17:00' })
    const blocked = patient({ conflicts: [{ id: 'c1', day: 'Mon', startTime: '08:00', endTime: '12:00' }] })
    const result = buildRoute(input([late, blocked]))

    const lateStop = result.stops.find((s) => s.patientId === late.id)!
    const blockedStop = result.stops.find((s) => s.patientId === blocked.id)!
    expect(toMinutes(lateStop.arrive)).toBeGreaterThanOrEqual(toMinutes('13:00'))
    expect(toMinutes(blockedStop.arrive)).toBeGreaterThanOrEqual(toMinutes('12:00'))
    expectConsistentTimeline(result.stops)
  })

  it('reports patients who are unavailable, unlocated, or impossible to fit', () => {
    const tuesdayOnly = patient({ availableDays: ['Tue'] })
    const unlocated = patient({ geo: null })
    const tooShort = patient({ windowStart: '08:00', windowEnd: '08:10' })
    const result = buildRoute(input([tuesdayOnly, unlocated, tooShort]))

    expect(result.visitCount).toBe(0)
    expect(result.conflicts.map((c) => c.patientId).sort()).toEqual([tuesdayOnly.id, unlocated.id, tooShort.id].sort())
  })

  it('lets a make-up patient be seen on a day they are not normally available', () => {
    const tuesdayOnly = patient({ availableDays: ['Tue'] })
    const result = buildRoute(input([tuesdayOnly], { makeupPatientIds: [tuesdayOnly.id] }))
    expect(result.visitCount).toBe(1)
  })

  it('skips inactive patients silently', () => {
    const archived = patient({ status: 'inactive' })
    const result = buildRoute(input([archived]))
    expect(result.visitCount).toBe(0)
    expect(result.conflicts).toEqual([])
  })

  it('places lunch in a natural gap without overlapping the drive to the next visit', () => {
    // Morning visit ends 12:30; the afternoon patient is ~an hour's drive away with a 13:30 start.
    // Lunch 12:30-13:00 fits before 13:30 on paper, but not before the drive has to begin.
    const morning = patient({ geo: east(1), windowStart: '11:45', windowEnd: '12:30' })
    const afternoon = patient({ geo: east(20), windowStart: '13:30', windowEnd: '17:00' })
    const result = buildRoute(
      input([morning, afternoon], { dayStartTime: '11:00', lunch: { enabled: true, earliest: '11:30', latest: '13:30', duration: 30 } }),
    )

    const lunch = result.stops.find((s) => s.kind === 'lunch')
    expect(lunch).toBeDefined()
    expect(result.conflicts).toEqual([])
    expectConsistentTimeline(result.stops)
  })

  it('shifts later visits to make room for lunch when there is no gap', () => {
    // Back-to-back all day: no natural gap, but the afternoon visits have room to slide later.
    const patients = Array.from({ length: 6 }, () => patient({ visitDuration: 60, geo: east(1) }))
    const result = buildRoute(input(patients, { lunch: { enabled: true, earliest: '11:30', latest: '13:30', duration: 30 } }))

    const lunch = result.stops.find((s) => s.kind === 'lunch')!
    expect(lunch).toBeDefined()
    expect(toMinutes(lunch.arrive)).toBeGreaterThanOrEqual(toMinutes('11:30'))
    expect(toMinutes(lunch.arrive)).toBeLessThanOrEqual(toMinutes('13:30'))
    expect(result.visitCount).toBe(6)
    expect(result.conflicts).toEqual([])
    expectConsistentTimeline(result.stops)
  })

  it('reports a lunch conflict when shifting visits would break a window', () => {
    // Same address, so each leg is just the fixed 4-min overhead: exactly back-to-back with zero slack.
    const tight = [
      ['10:00', '11:00'],
      ['11:04', '12:04'],
      ['12:08', '13:08'],
      ['13:12', '14:12'],
    ]
    const patients = tight.map(([windowStart, windowEnd]) => patient({ visitDuration: 60, geo: east(1), windowStart, windowEnd }))
    const result = buildRoute(
      input(patients, { dayStartTime: '09:45', lunch: { enabled: true, earliest: '11:00', latest: '13:00', duration: 30 } }),
    )
    expect(result.visitCount).toBe(4)
    expect(result.stops.some((s) => s.kind === 'lunch')).toBe(false)
    expect(result.conflicts.some((c) => c.message.includes('lunch'))).toBe(true)
  })

  it('keeps already-visited patients first, in order, on a mid-day rebuild', () => {
    const a = patient({ geo: east(12) })
    const b = patient({ geo: east(1) })
    const c = patient({ geo: east(6) })
    const result = buildRoute(input([a, b, c], { lockedPatientIds: [a.id] }))

    expect(visitOrder(result.stops)[0]).toBe(a.id)
    expect(result.visitCount).toBe(3)
    expectConsistentTimeline(result.stops)
  })

  it('slows drive estimates for bad weather and explains why', () => {
    const p = patient({ geo: east(10) })
    const clear = buildRoute(input([p]))
    const stormy = buildRoute(input([p], { weatherImpact: 2, weatherLabel: 'Heavy rain' }))
    expect(stormy.totalDriveMinutes).toBeGreaterThan(clear.totalDriveMinutes)
    expect(stormy.weatherNote).toContain('Heavy rain')
    expect(clear.weatherNote).toBeNull()
  })

  it('builds a Google Maps link only when there are visits', () => {
    expect(buildRoute(input([])).googleMapsUrl).toBeNull()
    expect(buildRoute(input([patient()])).googleMapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//)
  })

  it('finds a shorter loop than the greedy order for a zig-zag layout', () => {
    // Points on a circle around home: the optimal tour walks the circle rather than zig-zagging.
    const ring = Array.from({ length: 8 }, (_, i) => {
      const angle = (i * Math.PI * 2) / 8
      return patient({ visitDuration: 15, geo: { lat: HOME.lat + 0.05 * Math.sin(angle), lng: HOME.lng + 0.05 * Math.cos(angle) } })
    })
    // Shuffle deterministically so input order doesn't hand the router the answer.
    const shuffled = [ring[0], ring[4], ring[2], ring[6], ring[1], ring[5], ring[3], ring[7]]
    const result = buildRoute(input(shuffled))
    expect(result.visitCount).toBe(8)

    const walked = buildRoute(input(ring))
    expect(result.totalMiles).toBeLessThanOrEqual(walked.totalMiles + 0.5)
  })
})

describe('selectWeeklyDays', () => {
  it('returns every available day when there is no weekly target', () => {
    expect(selectWeeklyDays(patient({ availableDays: ['Fri', 'Mon'] }))).toEqual(['Mon', 'Fri'])
  })

  it('spreads a smaller weekly target evenly and deterministically', () => {
    const p = patient({ availableDays: ['Mon', 'Wed', 'Fri'], visitsPerWeek: 2 })
    expect(selectWeeklyDays(p)).toEqual(['Mon', 'Fri'])
    expect(selectWeeklyDays(p)).toEqual(selectWeeklyDays(p))
  })

  it('picks the middle day for a once-a-week patient', () => {
    expect(selectWeeklyDays(patient({ availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], visitsPerWeek: 1 }))).toEqual(['Wed'])
  })

  it('always returns exactly the requested number of days', () => {
    const p = patient({ availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], visitsPerWeek: 4 })
    expect(selectWeeklyDays(p)).toHaveLength(4)
  })
})
