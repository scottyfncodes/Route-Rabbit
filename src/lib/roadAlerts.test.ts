import { describe, expect, it } from 'vitest'
import { alertsAlongRoute, alertsNear, conditionsAlongRoute, isActiveBetween, pointToSegmentMiles, routeLegs, worstRoadImpact } from './roadAlerts'
import type { GeoPoint, RoadAlert, RoadCondition, Stop } from '../types'

const DATE = '2026-09-29'
const HOME: GeoPoint = { lat: 39.7, lng: -105.0 }
/** ~`miles` east of home (1° lng ≈ 53.2 mi at this latitude). */
const east = (miles: number): GeoPoint => ({ lat: HOME.lat, lng: HOME.lng + miles / 53.2 })
const north = (p: GeoPoint, miles: number): GeoPoint => ({ lat: p.lat + miles / 69, lng: p.lng })
const ll = (p: GeoPoint): [number, number] => [p.lat, p.lng]
const at = (hhmm: string) => new Date(`${DATE}T${hhmm}:00`).toISOString()

function stop(id: string, kind: Stop['kind'], geo: GeoPoint | null, arrive: string, depart = arrive): Stop {
  return { id, kind, label: id.toUpperCase(), arrive, depart, driveMinutesFromPrev: 0, driveMilesFromPrev: 0, geo }
}

// Home -> AB (10 mi east) -> lunch (no location) -> CD (20 mi east) -> home.
const STOPS: Stop[] = [
  stop('start', 'start', HOME, '08:00'),
  stop('ab', 'visit', east(10), '08:30', '09:15'),
  stop('lunch', 'lunch', null, '12:00', '12:30'),
  stop('cd', 'visit', east(20), '12:50', '13:35'),
  stop('end', 'end', HOME, '14:20'),
]

let seq = 0
function alert(points: GeoPoint[], overrides: Partial<RoadAlert> = {}): RoadAlert {
  seq += 1
  return {
    id: `a${seq}`,
    source: 'planned',
    kind: 'construction',
    title: 'Road Construction',
    route: 'I-70',
    message: '',
    severity: 'moderate',
    impact: null,
    fullClosure: false,
    points: points.map(ll),
    windows: [{ start: at('07:00'), end: at('17:00') }],
    updated: null,
    ...overrides,
  }
}

describe('geometry', () => {
  it('measures distance from a point to a leg', () => {
    expect(pointToSegmentMiles(north(east(5), 1), HOME, east(10))).toBeCloseTo(1, 1)
    // Past the end of the segment, distance is to the nearest endpoint.
    expect(pointToSegmentMiles(east(13), HOME, east(10))).toBeCloseTo(3, 1)
  })

  it('builds legs between located stops, skipping unlocated ones', () => {
    const legs = routeLegs(STOPS)
    expect(legs.map((l) => `${l.from.id}>${l.to.id}`)).toEqual(['start>ab', 'ab>cd', 'cd>end'])
  })
})

describe('alertsAlongRoute', () => {
  it('finds alerts on the route and says which leg they are on', () => {
    const onLeg2 = alert([north(east(15), 0.3)])
    const farAway = alert([north(east(15), 8)])
    const matches = alertsAlongRoute([onLeg2, farAway], STOPS, DATE)
    expect(matches).toHaveLength(1)
    expect(matches[0].alert.id).toBe(onLeg2.id)
    expect(matches[0].leg.to.id).toBe('cd')
    expect(matches[0].distanceMiles).toBeCloseTo(0.3, 1)
  })

  it('catches a closure segment that crosses the route even when its ends are far off', () => {
    const crossing = alert([north(east(5), -6), north(east(5), 6)])
    expect(alertsAlongRoute([crossing], STOPS, DATE)[0].distanceMiles).toBe(0)
  })

  it('ignores work scheduled outside working hours', () => {
    const overnight = alert([east(5)], { windows: [{ start: at('19:00'), end: `${DATE.slice(0, 8)}30T13:00:00.000Z` }] })
    const tomorrowNight = alert([east(5)], { windows: [{ start: '2026-09-30T19:00:00', end: '2026-10-01T05:00:00' }] })
    expect(alertsAlongRoute([overnight, tomorrowNight], STOPS, DATE)).toHaveLength(0)
  })

  it('lists the worst alerts first', () => {
    const minor = alert([east(2)], { severity: 'minor' })
    const major = alert([east(18)], { severity: 'major' })
    expect(alertsAlongRoute([minor, major], STOPS, DATE).map((m) => m.alert.severity)).toEqual(['major', 'minor'])
  })
})

describe('isActiveBetween', () => {
  const now = new Date(`${DATE}T10:00:00`).getTime()
  it('treats an open-ended incident as lasting through the rest of today only', () => {
    const crash = alert([HOME], { source: 'incident', windows: [{ start: at('09:30'), end: null }] })
    expect(isActiveBetween(crash, now, now, now)).toBe(true)
    const tomorrow = new Date('2026-09-30T10:00:00').getTime()
    expect(isActiveBetween(crash, tomorrow, tomorrow + 3600e3, now)).toBe(false)
  })
})

describe('road conditions', () => {
  const condition = (path: GeoPoint[], impact: RoadCondition['impact'], label: string): RoadCondition => ({
    id: label,
    name: `I-70, ${label}`,
    route: 'I-70',
    impact,
    label,
    closed: false,
    forecast: null,
    path: path.map(ll),
  })

  it('picks the worst slick segment the route touches', () => {
    const wet = condition([north(east(3), 0.5), north(east(8), 0.5)], 1, 'Wet')
    const icy = condition([north(east(12), -1), north(east(16), -1)], 2, 'Icy spots')
    const elsewhere = condition([north(HOME, 30), north(east(10), 30)], 2, 'Snow packed')
    const along = conditionsAlongRoute([wet, icy, elsewhere], STOPS)
    expect(along.map((c) => c.label)).toEqual(['Icy spots', 'Wet'])
    expect(worstRoadImpact(along)).toEqual({ impact: 2, label: 'Icy spots on I-70' })
    expect(worstRoadImpact([condition([HOME], 0, 'Dry')])).toBeNull()
  })
})

describe('alertsNear', () => {
  it('returns active alerts within the radius, nearest first', () => {
    const now = new Date(`${DATE}T10:00:00`).getTime()
    const near = alert([east(2)])
    const nearer = alert([east(1)])
    const far = alert([east(30)])
    const ended = alert([east(1)], { windows: [{ start: at('07:00'), end: at('08:00') }] })
    expect(alertsNear([near, nearer, far, ended], HOME, 10, now).map((m) => m.alert.id)).toEqual([nearer.id, near.id])
  })
})
