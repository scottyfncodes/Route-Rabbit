// Serverless proxy for the COtrip (CDOT) JSON API. The API key stays on the
// server as the COTRIP_API_KEY environment variable; the browser calls
// /api/cotrip?feed=<name> and never sees it.

const BASE_URL = 'https://data.cotrip.org/api/v1'

// Only these feeds can be requested, so the proxy can't be used as an open relay.
const FEEDS = new Set([
  'incidents',
  'roadConditions',
  'plannedEvents',
  'weatherStations',
  'snowPlows',
  'destinations',
  'signs',
  'cwz',
  'wzdx',
])

export async function GET(request: Request): Promise<Response> {
  const feed = new URL(request.url).searchParams.get('feed') ?? ''
  if (!FEEDS.has(feed)) {
    return Response.json({ error: `Unknown feed "${feed}"` }, { status: 400 })
  }

  const apiKey = process.env.COTRIP_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'COTRIP_API_KEY is not configured' }, { status: 500 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${BASE_URL}/${feed}?apiKey=${encodeURIComponent(apiKey)}`, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    return Response.json({ error: 'Could not reach COtrip' }, { status: 502 })
  }

  if (!upstream.ok) {
    return Response.json({ error: `COtrip returned ${upstream.status}` }, { status: 502 })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      // Let Vercel's CDN serve one copy per minute instead of hitting COtrip per visitor.
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
