// Shapes + normalizers for COtrip (CDOT) feeds. The raw feeds are large GeoJSON
// dumps (road conditions alone is several MB); the proxy trims them down to just
// what the app uses before they ever reach a phone. Pure functions only -- this
// file is shared by the serverless function and (for types) the browser app.
// Folders starting with "_" under api/ aren't deployed as their own functions.

/** [lat, lng], rounded -- compact for the wire and ready for Leaflet. */
export type LatLng = [number, number]

export type RoadAlertKind = 'crash' | 'closure' | 'construction' | 'maintenance' | 'hazard' | 'other'
export type RoadAlertSeverity = 'minor' | 'moderate' | 'major'

export interface TimeWindow {
  start: string // ISO
  end: string | null // ISO, null = open-ended
}

/** An incident (live) or planned event (construction, scheduled closures). */
export interface RoadAlert {
  id: string
  source: 'incident' | 'planned'
  kind: RoadAlertKind
  title: string
  route: string
  message: string
  severity: RoadAlertSeverity
  /** Lane impact summary, e.g. "Right lane closed eastbound", or null if no lanes are closed. */
  impact: string | null
  fullClosure: boolean
  points: LatLng[]
  windows: TimeWindow[]
  updated: string | null
}

/** 0 fine, 1 caution, 2 severe -- same scale as the app's WeatherImpact. */
export type RoadImpact = 0 | 1 | 2

export interface RoadCondition {
  id: string
  name: string
  route: string
  impact: RoadImpact
  label: string
  closed: boolean
  forecast: string | null
  path: LatLng[]
}

export interface CotripSnapshot {
  fetchedAt: string
  alerts: RoadAlert[]
  conditions: RoadCondition[]
  /** Features received per raw feed -- lets us spot truncated upstream pages. */
  counts: Record<string, number>
}

// ---------------------------------------------------------------------------
// Generic helpers

type Json = Record<string, unknown>

interface Feature {
  geometry?: { type?: string; coordinates?: unknown } | null
  properties?: Json | null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const round4 = (n: number) => Math.round(n * 1e4) / 1e4 // ~11 m -- plenty for proximity checks

function toLatLng(coord: unknown): LatLng | null {
  if (!Array.isArray(coord) || coord.length < 2) return null
  const [lng, lat] = coord
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return [round4(lat), round4(lng)]
}

/** Every [lat, lng] in a GeoJSON geometry, flattened (Point, MultiPoint, LineString, MultiLineString). */
export function geometryPoints(geometry: Feature['geometry']): LatLng[] {
  if (!geometry) return []
  const coords = geometry.coordinates
  switch (geometry.type) {
    case 'Point': {
      const p = toLatLng(coords)
      return p ? [p] : []
    }
    case 'MultiPoint':
    case 'LineString':
      return arr(coords).map(toLatLng).filter((p): p is LatLng => p !== null)
    case 'MultiLineString':
      return arr(coords).flatMap((line) => arr(line).map(toLatLng).filter((p): p is LatLng => p !== null))
    default:
      return []
  }
}

function milesBetween(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/**
 * Thins a dense road polyline by dropping points closer than `minSpacingMiles` to the
 * last kept one (always keeping both ends). Road-condition segments arrive with a
 * vertex every few yards; a few per mile is plenty for proximity checks and the map.
 */
export function thinPath(points: LatLng[], minSpacingMiles = 0.25): LatLng[] {
  if (points.length <= 2) return points
  const kept: LatLng[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    if (milesBetween(kept[kept.length - 1], points[i]) >= minSpacingMiles) kept.push(points[i])
  }
  kept.push(points[points.length - 1])
  return kept
}

/** CDOT messages append a bulleted "Full schedule below" and contact info -- keep the useful lead. */
export function cleanMessage(message: string): string {
  return message
    .split(/Full schedule below:/i)[0]
    .replace(/\s+/g, ' ')
    .trim()
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ---------------------------------------------------------------------------
// Incidents + planned events

interface LaneImpact {
  direction?: unknown
  laneCount?: unknown
  closedLaneTypes?: unknown
}

const DIRECTION_LABEL: Record<string, string> = { north: 'northbound', south: 'southbound', east: 'eastbound', west: 'westbound' }

/**
 * "Right lane closed eastbound · All lanes closed westbound", ignoring shoulder-only closures.
 * `fullClosure` means every direction is shut; `directionClosed` means at least one is.
 */
export function summarizeLaneImpacts(laneImpacts: unknown): { impact: string | null; fullClosure: boolean; directionClosed: boolean } {
  const parts: string[] = []
  const entries = arr(laneImpacts) as LaneImpact[]
  let closedDirections = 0
  for (const raw of entries) {
    const types = arr(raw.closedLaneTypes).map(str).filter((t) => t && !t.includes('shoulder'))
    if (types.length === 0) continue
    const dir = DIRECTION_LABEL[str(raw.direction)] ?? str(raw.direction)
    const allClosed = types.includes('through lanes') || types.includes('all lanes')
    if (allClosed) closedDirections++
    const what = allClosed ? 'All lanes closed' : `${capitalize(types.join(' and '))} closed`
    parts.push(dir ? `${what} ${dir}` : what)
  }
  return {
    impact: parts.length ? parts.join(' · ') : null,
    fullClosure: entries.length > 0 && closedDirections === entries.length,
    directionClosed: closedDirections > 0,
  }
}

function alertKind(category: string, type: string, fullClosure: boolean): RoadAlertKind {
  const c = category.toLowerCase()
  const t = type.toLowerCase()
  if (c === 'crash' || t.includes('crash')) return 'crash'
  if (fullClosure || t.includes('closure') || t.includes('closed')) return 'closure'
  if (c === 'construction' || t.includes('construction') || t.includes('paving') || t.includes('bridge')) return 'construction'
  if (c === 'maintenance' || t.includes('maintenance') || t.includes('striping') || t.includes('sign')) return 'maintenance'
  if (c === 'environmental' || /rock|debris|animal|flood|fire|slide|hazard/.test(t)) return 'hazard'
  return 'other'
}

function alertSeverity(rawSeverity: string, closedOneWay: boolean, impact: string | null, additional: string[]): RoadAlertSeverity {
  if (closedOneWay || rawSeverity === 'major' || rawSeverity === 'severe') return 'major'
  if (rawSeverity === 'moderate' || impact || additional.some((a) => /alternating|delay/i.test(a))) return 'moderate'
  return 'minor'
}

function normalizeAlert(feature: Feature, source: RoadAlert['source']): RoadAlert | null {
  const p = feature.properties ?? {}
  const id = str(p.id)
  if (!id) return null
  const status = str(p.status).toLowerCase()
  if (status.includes('cleared') || status.includes('closed') || status.includes('ended')) return null

  const points = thinPath(geometryPoints(feature.geometry), 0.1)
  if (points.length === 0) return null

  const message = cleanMessage(str(p.travelerInformationMessage))
  const lanes = summarizeLaneImpacts(p.laneImpacts)
  const additional = arr(p.additionalImpacts).map(str)
  // On a two-lane road, "all lanes closed eastbound" + alternating traffic means flaggers
  // taking turns -- slow, but passable. Say that instead of calling it a closure.
  const alternating = additional.some((a) => /alternating/i.test(a)) || /alternating traffic/i.test(message)
  const impact = alternating ? 'Alternating one-lane traffic' : lanes.impact
  const fullClosure = (!alternating && lanes.fullClosure) || /road(way)? (is )?closed|closed in both directions/i.test(message)
  const type = str(p.type)

  const schedule = arr(p.schedule) as Json[]
  const windows: TimeWindow[] = schedule.length
    ? schedule.map((w) => ({ start: str(w.startTime), end: str(w.endTime) || null })).filter((w) => w.start)
    : str(p.startTime)
      ? [{ start: str(p.startTime), end: str(p.clearTime) || str(p.estimatedClearTime) || null }]
      : []

  return {
    id,
    source,
    kind: alertKind(str(p.category), type, fullClosure),
    title: type || str(p.category) || 'Road alert',
    route: str(p.routeName).replace(/(\d)[NSEW]$/, '$1'), // "I-70E" -> "I-70"
    message,
    severity: alertSeverity(str(p.severity).toLowerCase(), fullClosure || (!alternating && lanes.directionClosed), impact, additional),
    impact,
    fullClosure,
    points,
    windows,
    updated: str(p.lastUpdated) || null,
  }
}

export const normalizeIncident = (f: Feature) => normalizeAlert(f, 'incident')
export const normalizePlannedEvent = (f: Feature) => normalizeAlert(f, 'planned')

// ---------------------------------------------------------------------------
// Road conditions

/**
 * Maps CDOT surface descriptions ("3 - dry", "4s - wet in areas", "snow packed", "icy spots",
 * "closed") onto the app's 0/1/2 driving-impact scale.
 */
export function conditionImpact(description: string): { impact: RoadImpact; closed: boolean } {
  const d = description.toLowerCase()
  if (/\bclosed\b/.test(d)) return { impact: 2, closed: true }
  if (/ic[ey]|packed|slush|drift|blowing|chain|traction|black ice|freezing/.test(d)) return { impact: 2, closed: false }
  if (/snow|wet|slick|fog|frost|rain|spots/.test(d)) return { impact: 1, closed: false }
  return { impact: 0, closed: false }
}

/** "4s - wet in areas" -> "Wet in areas"; "3 - dry" -> "Dry". */
export function conditionLabel(description: string): string {
  return capitalize(description.replace(/^\s*\d+[a-z]?(\s*-\s*\d+[a-z]?)?\s*-?\s*/i, '').trim()) || 'Unknown'
}

export function normalizeRoadCondition(feature: Feature): RoadCondition | null {
  const p = feature.properties ?? {}
  const id = str(p.id)
  if (!id) return null
  // Segments run for miles; a vertex every half mile is plenty against a 2-mile route buffer.
  const path = thinPath(geometryPoints(feature.geometry), 0.5)
  if (path.length === 0) return null

  const current = arr(p.currentConditions) as Json[]
  let worst = { impact: 0 as RoadImpact, closed: false, label: 'Unknown' }
  let forecast: string | null = null
  for (const c of current) {
    const description = str(c.conditionDescription)
    if (/forecast text/i.test(description)) {
      forecast = str(c.additionalData) || forecast
      continue
    }
    const { impact, closed } = conditionImpact(description)
    if (worst.label === 'Unknown' || impact > worst.impact || (closed && !worst.closed)) {
      worst = { impact, closed, label: conditionLabel(description) }
    }
  }

  return {
    id,
    name: str(p.name),
    route: str(p.routeName),
    impact: worst.impact,
    label: worst.label,
    closed: worst.closed,
    forecast,
    path,
  }
}

export function featuresOf(payload: unknown): Feature[] {
  if (payload && typeof payload === 'object' && 'features' in payload) return arr((payload as Json).features) as Feature[]
  return []
}
