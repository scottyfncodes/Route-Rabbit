import type { GeoPoint, LatLng, RoadAlert, RoadAlertKind, RoadCondition, Stop, WeatherImpact } from '../types'
import { haversineMiles } from './distance'
import { formatTime } from './time'

/**
 * Matching COtrip alerts and road conditions against a day's route. Legs are straight
 * lines between stops (the app has no road geometry), so "near the route" uses a
 * buffer that widens with leg length -- a 15-mile leg can bow a couple of miles away
 * from the crow-flies line on real roads.
 */

export const KIND_ICON: Record<RoadAlertKind, string> = {
  crash: '💥',
  closure: '⛔',
  construction: '🚧',
  maintenance: '🦺',
  hazard: '⚠️',
  other: 'ℹ️',
}

const SEVERITY_RANK: Record<RoadAlert['severity'], number> = { major: 0, moderate: 1, minor: 2 }

const toGeo = ([lat, lng]: LatLng): GeoPoint => ({ lat, lng })

// ---------------------------------------------------------------------------
// Geometry (local flat-earth projection -- accurate to well under 1% at these scales)

interface XY {
  x: number
  y: number
}

const MILES_PER_DEG_LAT = 69.0

function projector(refLat: number) {
  const milesPerDegLng = MILES_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180)
  return (p: GeoPoint): XY => ({ x: p.lng * milesPerDegLng, y: p.lat * MILES_PER_DEG_LAT })
}

function pointSegmentXY(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function segmentsCross(a: XY, b: XY, c: XY, d: XY): boolean {
  const cross = (o: XY, p: XY, q: XY) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** Shortest distance in miles from point `p` to the segment a-b. */
export function pointToSegmentMiles(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const proj = projector((a.lat + b.lat) / 2)
  return pointSegmentXY(proj(p), proj(a), proj(b))
}

/** Shortest distance in miles between segments a-b and c-d (0 if they cross). */
export function segmentToSegmentMiles(a: GeoPoint, b: GeoPoint, c: GeoPoint, d: GeoPoint): number {
  const proj = projector((a.lat + b.lat + c.lat + d.lat) / 4)
  const [pa, pb, pc, pd] = [proj(a), proj(b), proj(c), proj(d)]
  if (segmentsCross(pa, pb, pc, pd)) return 0
  return Math.min(pointSegmentXY(pa, pc, pd), pointSegmentXY(pb, pc, pd), pointSegmentXY(pc, pa, pb), pointSegmentXY(pd, pa, pb))
}

/** Distance from a polyline/point set (as consecutive segments, or a lone point) to one segment. */
function shapeToSegmentMiles(shape: LatLng[], a: GeoPoint, b: GeoPoint): number {
  if (shape.length === 1) return pointToSegmentMiles(toGeo(shape[0]), a, b)
  let best = Infinity
  for (let i = 0; i < shape.length - 1 && best > 0; i++) {
    best = Math.min(best, segmentToSegmentMiles(toGeo(shape[i]), toGeo(shape[i + 1]), a, b))
  }
  return best
}

function shapeToPointMiles(shape: LatLng[], p: GeoPoint): number {
  if (shape.length === 1) return haversineMiles(toGeo(shape[0]), p)
  let best = Infinity
  for (let i = 0; i < shape.length - 1; i++) best = Math.min(best, pointToSegmentMiles(p, toGeo(shape[i]), toGeo(shape[i + 1])))
  return best
}

// ---------------------------------------------------------------------------
// Route legs

export interface RouteLeg {
  from: Stop
  to: Stop
  /** Index of `to` in the day's stop list. */
  toIndex: number
  a: GeoPoint
  b: GeoPoint
  bufferMiles: number
}

/** Driving legs between consecutive located stops (lunch/open blocks without a location are skipped over). */
export function routeLegs(stops: Stop[], baseBufferMiles = 0.75): RouteLeg[] {
  const legs: RouteLeg[] = []
  let prev: { stop: Stop; geo: GeoPoint } | null = null
  stops.forEach((stop, i) => {
    if (!stop.geo) return
    if (prev && (prev.geo.lat !== stop.geo.lat || prev.geo.lng !== stop.geo.lng)) {
      const miles = haversineMiles(prev.geo, stop.geo)
      legs.push({ from: prev.stop, to: stop, toIndex: i, a: prev.geo, b: stop.geo, bufferMiles: Math.min(2, baseBufferMiles + miles * 0.08) })
    }
    prev = { stop, geo: stop.geo }
  })
  return legs
}

// ---------------------------------------------------------------------------
// Timing

function localMs(date: string, hhmm: string): number {
  return new Date(`${date}T${hhmm}:00`).getTime()
}

function endOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/**
 * Whether an alert affects the span [fromMs, toMs]. Open-ended windows (a live crash with
 * no clear-time estimate yet) count as running through the end of the day they're seen,
 * never into later days -- they'll usually be long gone by then.
 */
export function isActiveBetween(alert: RoadAlert, fromMs: number, toMs: number, nowMs = Date.now()): boolean {
  return alert.windows.some((w) => {
    const start = Date.parse(w.start)
    if (Number.isNaN(start)) return false
    const end = w.end ? Date.parse(w.end) : endOfLocalDay(Math.max(start, nowMs))
    return start <= toMs && end >= fromMs
  })
}

/** The day's working span, from leaving the first stop to arriving at the last. */
export function daySpanMs(date: string, stops: Stop[]): { fromMs: number; toMs: number } {
  if (stops.length === 0) return { fromMs: localMs(date, '00:00'), toMs: localMs(date, '23:59') }
  return { fromMs: localMs(date, stops[0].depart), toMs: localMs(date, stops[stops.length - 1].arrive) }
}

/** "Now – 7:00 PM", "7:00 AM – 7:00 PM", "Until Oct 2, 7:00 AM" -- the window relevant to `date`. */
export function describeWindow(alert: RoadAlert, date: string, nowMs = Date.now()): string | null {
  const dayStart = localMs(date, '00:00')
  const dayEnd = localMs(date, '23:59')
  const w = alert.windows.find((win) => {
    const s = Date.parse(win.start)
    const e = win.end ? Date.parse(win.end) : Infinity
    return s <= dayEnd && e >= dayStart
  })
  if (!w) return null
  const start = Date.parse(w.start)
  const end = w.end ? Date.parse(w.end) : null
  const clock = (ms: number) => {
    const d = new Date(ms)
    return formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  }
  const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const startText = start < dayStart ? (alert.source === 'incident' && start <= nowMs ? 'Ongoing' : `Since ${dayLabel(start)}`) : clock(start)
  if (end === null) return alert.source === 'incident' ? `${startText} · no clear time yet` : `${startText} onward`
  const endText = end > dayEnd ? `${dayLabel(end)}, ${clock(end)}` : clock(end)
  return `${startText} – ${endText}`
}

// ---------------------------------------------------------------------------
// Matching

export interface RouteAlertMatch {
  alert: RoadAlert
  distanceMiles: number
  /** The leg it's closest to -- "on the way to <leg.to>". */
  leg: RouteLeg
}

/** Alerts within the buffer of any leg and active during the day's working span, worst first. */
export function alertsAlongRoute(alerts: RoadAlert[], stops: Stop[], date: string, nowMs = Date.now()): RouteAlertMatch[] {
  const legs = routeLegs(stops)
  if (legs.length === 0) return []
  const { fromMs, toMs } = daySpanMs(date, stops)

  const matches: RouteAlertMatch[] = []
  for (const alert of alerts) {
    if (!isActiveBetween(alert, fromMs, toMs, nowMs)) continue
    let best: RouteAlertMatch | null = null
    for (const leg of legs) {
      const d = shapeToSegmentMiles(alert.points, leg.a, leg.b)
      if (d <= leg.bufferMiles && (!best || d < best.distanceMiles)) best = { alert, distanceMiles: d, leg }
    }
    if (best) matches.push(best)
  }
  return matches.sort(
    (x, y) => SEVERITY_RANK[x.alert.severity] - SEVERITY_RANK[y.alert.severity] || x.leg.toIndex - y.leg.toIndex || x.distanceMiles - y.distanceMiles,
  )
}

/** Road-condition segments (any impact) touching the route, worst first. */
export function conditionsAlongRoute(conditions: RoadCondition[], stops: Stop[]): RoadCondition[] {
  const legs = routeLegs(stops, 1.5)
  if (legs.length === 0) return []
  return conditions
    .filter((c) => legs.some((leg) => shapeToSegmentMiles(c.path, leg.a, leg.b) <= leg.bufferMiles))
    .sort((a, b) => b.impact - a.impact || Number(b.closed) - Number(a.closed))
}

export interface RoadImpactSummary {
  impact: WeatherImpact
  label: string
}

/** The worst surface condition among these segments, as a driving impact + short label ("Snow packed on I-70"). */
export function worstRoadImpact(conditions: RoadCondition[]): RoadImpactSummary | null {
  const worst = conditions.reduce<RoadCondition | null>((w, c) => (c.impact > (w?.impact ?? 0) ? c : w), null)
  if (!worst) return null
  return { impact: worst.impact, label: `${worst.closed ? 'Closure' : worst.label} on ${worst.route}` }
}

export interface NearbyAlert {
  alert: RoadAlert
  distanceMiles: number
}

/** Alerts active right now within `radiusMiles` of a point, nearest first. */
export function alertsNear(alerts: RoadAlert[], geo: GeoPoint, radiusMiles: number, nowMs = Date.now()): NearbyAlert[] {
  return alerts
    .filter((a) => isActiveBetween(a, nowMs, nowMs, nowMs))
    .map((alert) => ({ alert, distanceMiles: shapeToPointMiles(alert.points, geo) }))
    .filter((m) => m.distanceMiles <= radiusMiles)
    .sort((x, y) => x.distanceMiles - y.distanceMiles)
}

/** Road-condition segments within `radiusMiles` of a point, worst then nearest first. */
export function conditionsNear(conditions: RoadCondition[], geo: GeoPoint, radiusMiles: number): { condition: RoadCondition; distanceMiles: number }[] {
  return conditions
    .map((condition) => ({ condition, distanceMiles: shapeToPointMiles(condition.path, geo) }))
    .filter((m) => m.distanceMiles <= radiusMiles)
    .sort((x, y) => y.condition.impact - x.condition.impact || x.distanceMiles - y.distanceMiles)
}

export function roadAdvisory(summary: RoadImpactSummary | null): string | null {
  if (!summary || summary.impact === 0) return null
  if (summary.impact === 2) return `${summary.label} (CDOT) -- drive times increased for slick roads.`
  return `${summary.label} (CDOT) -- drive times increased slightly.`
}
