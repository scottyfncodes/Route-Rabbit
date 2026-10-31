// Real driving time and distance between stops, from the Google Routes API
// (computeRouteMatrix, traffic-aware). The key stays on the server as
// GOOGLE_ROUTES_API_KEY.
//
// Privacy: the request body is rebuilt from bare latitude/longitude numbers and a
// departure time before anything goes to Google. Patient initials, addresses, and
// notes never reach this function, and if they did they would be dropped here.


/**
 * Only the app itself should spend the Google key. Browsers always send an Origin
 * header on a POST, so a missing or foreign one is refused. This is a speed bump,
 * not authentication; set a daily quota on the key in Google Cloud as the real cap.
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

interface Coordinate {
  lat: number
  lng: number
}

/** Rebuilds a coordinate from untrusted input so nothing but two numbers is ever forwarded. */
function toCoordinate(value: unknown): Coordinate | null {
  if (!value || typeof value !== 'object') return null
  const { lat, lng } = value as Record<string, unknown>
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

function googleKey(): string | undefined {
  return process.env.GOOGLE_ROUTES_API_KEY || undefined
}

const MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
/** Google's per-request element cap for a traffic-aware matrix. */
const MAX_ELEMENTS = 625
const MAX_SIDE = 25
const METERS_PER_MILE = 1609.344

interface MatrixElement {
  originIndex?: number
  destinationIndex?: number
  duration?: string // e.g. "843s"
  distanceMeters?: number
  condition?: string
}

function waypoint(c: Coordinate) {
  return { waypoint: { location: { latLng: { latitude: c.lat, longitude: c.lng } } } }
}

/** Google rejects departure times in the past; anything not comfortably in the future means "leave now". */
function futureDeparture(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = Date.parse(value)
  if (Number.isNaN(t) || t < Date.now() + 60_000) return undefined
  return new Date(t).toISOString()
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const apiKey = googleKey()
  if (!apiKey) return Response.json({ error: 'GOOGLE_ROUTES_API_KEY is not configured' }, { status: 503 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 })
  }

  const origins = Array.isArray(body.origins) ? body.origins.map(toCoordinate) : []
  const destinations = Array.isArray(body.destinations) ? body.destinations.map(toCoordinate) : []
  if (origins.length === 0 || destinations.length === 0 || origins.includes(null) || destinations.includes(null)) {
    return Response.json({ error: 'origins and destinations must be lists of { lat, lng }' }, { status: 400 })
  }
  if (origins.length > MAX_SIDE || destinations.length > MAX_SIDE || origins.length * destinations.length > MAX_ELEMENTS) {
    return Response.json({ error: 'Too many points in one request' }, { status: 400 })
  }

  const departureTime = futureDeparture(body.departureTime)
  const payload = {
    origins: (origins as Coordinate[]).map(waypoint),
    destinations: (destinations as Coordinate[]).map(waypoint),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    ...(departureTime ? { departureTime } : {}),
  }

  let upstream: Response
  try {
    upstream = await fetch(MATRIX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    return Response.json({ error: 'Could not reach Google Routes' }, { status: 502 })
  }

  if (!upstream.ok) {
    // Log Google's reason (it never contains patient data, only our coordinates) so a key or billing problem is visible in Vercel logs.
    console.error('Google Routes error', upstream.status, (await upstream.text()).slice(0, 500))
    return Response.json({ error: `Google Routes returned ${upstream.status}` }, { status: 502 })
  }

  const elements = (await upstream.json()) as MatrixElement[]
  const legs = elements
    .filter((e) => e.condition === 'ROUTE_EXISTS' && e.duration && typeof e.distanceMeters === 'number')
    .map((e) => ({
      o: e.originIndex ?? 0,
      d: e.destinationIndex ?? 0,
      minutes: Math.round((parseFloat(e.duration as string) / 60) * 10) / 10,
      miles: Math.round(((e.distanceMeters as number) / METERS_PER_MILE) * 100) / 100,
    }))

  return Response.json({ legs, departureTime: departureTime ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
