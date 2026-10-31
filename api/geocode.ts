// Address lookup through Google Geocoding, using the same server-side key as drive
// times. The browser POSTs only the street address (in the body, so it never lands
// in a URL or access log). No initials, names, or notes are accepted or forwarded.

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

function googleKey(): string | undefined {
  return process.env.GOOGLE_ROUTES_API_KEY || undefined
}

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const MAX_ADDRESS_LENGTH = 200

interface GoogleResult {
  formatted_address: string
  partial_match?: boolean
  geometry: { location: { lat: number; lng: number }; location_type: string }
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const apiKey = googleKey()
  if (!apiKey) return Response.json({ error: 'GOOGLE_ROUTES_API_KEY is not configured' }, { status: 503 })

  let address = ''
  try {
    const body = (await request.json()) as Record<string, unknown>
    address = typeof body.address === 'string' ? body.address.trim() : ''
  } catch {
    // fall through to the empty-address error
  }
  if (!address || address.length > MAX_ADDRESS_LENGTH) {
    return Response.json({ error: 'Send a street address of 200 characters or fewer' }, { status: 400 })
  }

  const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&region=us&key=${encodeURIComponent(apiKey)}`
  let upstream: Response
  try {
    upstream = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    return Response.json({ error: 'Could not reach Google Geocoding' }, { status: 502 })
  }
  if (!upstream.ok) return Response.json({ error: `Google Geocoding returned ${upstream.status}` }, { status: 502 })

  const data = (await upstream.json()) as { status: string; results?: GoogleResult[]; error_message?: string }
  if (data.status === 'ZERO_RESULTS') return Response.json({ match: null }, { headers: { 'Cache-Control': 'no-store' } })
  if (data.status !== 'OK' || !data.results?.length) {
    // Never log the address itself; the status code is enough to diagnose a key problem.
    console.error('Google Geocoding status', data.status, data.error_message ?? '')
    return Response.json({ error: `Google Geocoding status ${data.status}` }, { status: 502 })
  }

  const top = data.results[0]
  return Response.json(
    {
      match: {
        lat: top.geometry.location.lat,
        lng: top.geometry.location.lng,
        matchedAddress: top.formatted_address,
        // ROOFTOP is a real house match; the rest (street segment, ZIP centroid, city) need a human look.
        exact: top.geometry.location_type === 'ROOFTOP' && !top.partial_match,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
