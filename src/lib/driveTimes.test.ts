import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRoute, type RoutingInput } from './routing'
import { planRoute } from './planRoute'
import { cachedRoadLeg, dayMatrixRequests, departureIso, fetchRoadLegs, pointKey, resetDriveTimeCache, roadLegLookup } from './driveTimes'
import { findMakeupCandidates } from './makeup'
import type { GeoPoint, Patient } from '../types'

// 2025-01-06 is a Monday.
const MONDAY = '2025-01-06'
const HOME: GeoPoint = { lat: 40.0, lng: -75.0 }
const east = (miles: number): GeoPoint => ({ lat: HOME.lat, lng: HOME.lng + miles / 53 })

let seq = 0
function patient(overrides: Partial<Patient> = {}): Patient {
  seq += 1
  return {
    id: `p${seq}`,
    initials: `P${seq}`,
    address: `${seq} Main St`,
    notes: 'side door, dog in yard',
    geo: east(seq * 2),
    visitDuration: 45,
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    windowStart: '08:00',
    windowEnd: '17:00',
    visitsPerWeek: null,
    conflicts: [],
    status: 'active',
    priority: 'medium',
    makeupAvailable: true,
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

/** A fake /api/drive-times: every leg is a flat 20 min / 7 mi, and every request is recorded. */
function fakeServer(minutes = 20, miles = 7) {
  const bodies: Array<{ origins: GeoPoint[]; destinations: GeoPoint[]; departureTime: string }> = []
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    bodies.push(body)
    const legs = []
    for (let o = 0; o < body.origins.length; o++) for (let d = 0; d < body.destinations.length; d++) legs.push({ o, d, minutes, miles })
    return new Response(JSON.stringify({ legs }), { status: 200 })
  })
  return { fetcher, bodies }
}

beforeEach(() => resetDriveTimeCache())

describe('routing fallback', () => {
  it('estimates every leg, and says so, when no real drive times are available', () => {
    const route = buildRoute(input([patient(), patient()], { roadLeg: () => null }))
    const driven = route.stops.filter((s) => s.kind === 'visit' || s.kind === 'end')
    expect(driven.every((s) => s.driveSource === 'estimate')).toBe(true)
    expect(route.estimatedLegCount).toBe(route.legCount)
    expect(route.legCount).toBe(3)
  })

  it('uses real road times when they exist and marks them as real', () => {
    const route = buildRoute(input([patient(), patient()], { roadLeg: () => ({ minutes: 25, miles: 9 }) }))
    const visits = route.stops.filter((s) => s.kind === 'visit')
    expect(visits.every((s) => s.driveSource === 'road' && s.driveMinutesFromPrev === 25 && s.driveMilesFromPrev === 9)).toBe(true)
    expect(route.estimatedLegCount).toBe(0)
    expect(route.totalMiles).toBe(27) // three 9-mile legs, including home
    expect(route.totalDriveMinutes).toBe(75)
  })

  it('mixes real and estimated legs, counting only the estimated ones', () => {
    const a = patient()
    const b = patient()
    // Only the leg out of home is known for real.
    const roadLeg = (from: GeoPoint) => (pointKey(from) === pointKey(HOME) ? { minutes: 12, miles: 4 } : null)
    const route = buildRoute(input([a, b], { roadLeg }))
    expect(route.legCount).toBe(3)
    expect(route.estimatedLegCount).toBe(2)
    expect(route.stops.find((s) => s.kind === 'visit')?.driveSource).toBe('road')
  })

  it('a real slow leg changes the schedule, not just the label', () => {
    const p = patient()
    const fast = buildRoute(input([p], { roadLeg: () => ({ minutes: 10, miles: 3 }) }))
    const slow = buildRoute(input([p], { roadLeg: () => ({ minutes: 40, miles: 12 }) }))
    expect(fast.stops[1].arrive).toBe('08:10')
    expect(slow.stops[1].arrive).toBe('08:40')
  })

  it('slows real legs on a bad-weather day just like estimates', () => {
    const route = buildRoute(input([patient()], { roadLeg: () => ({ minutes: 20, miles: 7 }), weatherImpact: 2 }))
    expect(route.stops[1].driveMinutesFromPrev).toBe(Math.round(20 / 0.82))
  })
})

describe('planRoute', () => {
  it('falls back to estimates (flagged) when the drive-time service is down', async () => {
    const fetcher = vi.fn(async () => new Response('{"error":"no key"}', { status: 503 }))
    const route = await planRoute(input([patient(), patient()]), { fetchLegs: (date, reqs) => fetchRoadLegs(date, reqs, fetcher) })
    expect(route.visitCount).toBe(2)
    expect(route.estimatedLegCount).toBe(route.legCount)
    // Down once means it stops asking for a while instead of retrying every leg.
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('falls back to estimates when the network throws', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const route = await planRoute(input([patient()]), { fetchLegs: (date, reqs) => fetchRoadLegs(date, reqs, fetcher) })
    expect(route.estimatedLegCount).toBe(route.legCount)
  })

  it('builds with real times, then reuses the cache instead of asking again', async () => {
    const { fetcher } = fakeServer()
    const deps = { fetchLegs: (date: string, reqs: Parameters<typeof fetchRoadLegs>[1]) => fetchRoadLegs(date, reqs, fetcher) }
    const patients = [patient(), patient(), patient()]

    const first = await planRoute(input(patients), deps)
    expect(first.estimatedLegCount).toBe(0)
    expect(first.stops.filter((s) => s.kind === 'visit').every((s) => s.driveMinutesFromPrev === 20)).toBe(true)
    const callsAfterFirst = fetcher.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)
    expect(callsAfterFirst).toBeLessThanOrEqual(6) // one matrix + one small request per departure hour

    await planRoute(input(patients), deps)
    expect(fetcher.mock.calls.length).toBe(callsAfterFirst)
  })

  it('sends only coordinates and a time to the server', async () => {
    const { fetcher, bodies } = fakeServer()
    await planRoute(input([patient({ initials: 'ZQ', notes: 'secret note', address: '9 Hidden Ln' })]), {
      fetchLegs: (date, reqs) => fetchRoadLegs(date, reqs, fetcher),
    })
    const sent = JSON.stringify(bodies)
    expect(sent).not.toContain('ZQ')
    expect(sent).not.toContain('secret note')
    expect(sent).not.toContain('Hidden')
    for (const body of bodies) {
      expect(Object.keys(body).sort()).toEqual(['departureTime', 'destinations', 'origins'])
      for (const p of [...body.origins, ...body.destinations]) expect(Object.keys(p).sort()).toEqual(['lat', 'lng'])
    }
  })
})

describe('drive time cache', () => {
  it('uses the nearest cached hour on the same weekday when the exact hour is missing', async () => {
    const { fetcher } = fakeServer(30, 10)
    await fetchRoadLegs(MONDAY, [{ from: HOME, to: east(5), departMinutes: 9 * 60 }], fetcher)
    expect(cachedRoadLeg(HOME, east(5), 'Mon', 11 * 60 + 30)).toEqual({ minutes: 30, miles: 10 })
    expect(cachedRoadLeg(HOME, east(5), 'Tue', 9 * 60)).toBeNull()
    expect(roadLegLookup(MONDAY)(HOME, east(5), 9 * 60)).toEqual({ minutes: 30, miles: 10 })
  })

  it('never requests a leg from a place to itself', () => {
    const reqs = dayMatrixRequests(HOME, [east(1), east(2)], HOME, 480)
    expect(reqs).toHaveLength(6) // home->1, home->2, 1->2, 1->home, 2->1, 2->home
  })

  it('asks Google about a past time on the same weekday and hour in the future', () => {
    const now = new Date('2025-01-08T12:00:00').getTime() // a Wednesday
    const iso = departureIso(MONDAY, 9 * 60, now)
    const d = new Date(iso)
    expect(d.getTime()).toBeGreaterThan(now)
    expect(d.getDay()).toBe(1)
    expect(d.getHours()).toBe(9)
  })
})

describe('make-up placement', () => {
  it('ranks by real added drive time when cached, and flags estimates otherwise', () => {
    const near = patient({ geo: east(1), priority: 'medium' })
    const far = patient({ geo: east(30), priority: 'medium' })
    const base = {
      cancelledPatientId: 'nobody',
      weekday: 'Mon' as const,
      slotStart: '10:00',
      slotEnd: '11:00',
      allPatients: [far, near],
      scheduledPatientIdsToday: [],
      prevStopGeo: HOME,
      nextStopGeo: HOME,
      avgSpeedMph: 30,
    }

    const estimated = findMakeupCandidates(base)
    expect(estimated.every((c) => c.driveEstimated)).toBe(true)

    // Real roads say the "far" house is actually quicker to reach (say, a highway).
    const roadLeg = (from: GeoPoint, to: GeoPoint) => {
      const other = pointKey(from) === pointKey(HOME) ? to : from
      if (pointKey(other) === pointKey(near.geo!)) return { minutes: 25, miles: 3 }
      if (pointKey(other) === pointKey(far.geo!)) return { minutes: 15, miles: 30 }
      return { minutes: 0, miles: 0 }
    }
    const real = findMakeupCandidates({ ...base, roadLeg })
    expect(real.map((c) => c.patient.id)).toEqual([far.id, near.id])
    expect(real.every((c) => !c.driveEstimated)).toBe(true)
    expect(real[0].extraDriveMinutes).toBe(30)
  })
})
