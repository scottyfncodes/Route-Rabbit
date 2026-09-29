// Serverless proxy for the COtrip (CDOT) JSON API. The API key stays on the
// server as the COTRIP_API_KEY environment variable; the browser never sees it.
//
//   /api/cotrip?feed=snapshot   -> incidents + planned events + road conditions,
//                                  trimmed to the compact shapes in _lib/cotrip.ts
//   /api/cotrip?feed=<raw feed> -> that COtrip feed, passed through untouched

import {
  featuresOf,
  normalizeIncident,
  normalizePlannedEvent,
  normalizeRoadCondition,
  type CotripSnapshot,
  type RoadAlert,
  type RoadCondition,
} from './_lib/cotrip.js'

const BASE_URL = 'https://data.cotrip.org/api/v1'

// Only these feeds can be requested, so the proxy can't be used as an open relay.
const RAW_FEEDS = new Set([
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

/** COtrip returns at most this many features per request. */
const PAGE_SIZE = 100
const MAX_PAGES = 15

class UpstreamError extends Error {}

function feedUrl(feed: string, apiKey: string, offset = 0): string {
  const params = new URLSearchParams({ apiKey })
  if (offset > 0) params.set('offset', String(offset))
  return `${BASE_URL}/${feed}?${params.toString()}`
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new UpstreamError(`COtrip returned ${res.status}`)
  return res.json()
}

type RawFeature = ReturnType<typeof featuresOf>[number]

/**
 * Every feature in a feed. COtrip pages at 100 features; when a page comes back full we
 * ask for the next one by offset, stopping as soon as a page is short, empty, repeats
 * features we already have (the API ignoring the offset), or errors.
 */
async function fetchAllFeatures(feed: string, apiKey: string): Promise<RawFeature[]> {
  const all = featuresOf(await fetchJson(feedUrl(feed, apiKey)))
  const seen = new Set(all.map((f) => String(f.properties?.id ?? '')))
  let page = all
  for (let i = 1; i < MAX_PAGES && page.length >= PAGE_SIZE; i++) {
    try {
      page = featuresOf(await fetchJson(feedUrl(feed, apiKey, all.length)))
    } catch {
      break
    }
    const fresh = page.filter((f) => !seen.has(String(f.properties?.id ?? '')))
    if (fresh.length === 0) break
    fresh.forEach((f) => seen.add(String(f.properties?.id ?? '')))
    all.push(...fresh)
  }
  return all
}

async function buildSnapshot(apiKey: string): Promise<CotripSnapshot> {
  const [incidents, planned, conditions] = await Promise.all([
    fetchAllFeatures('incidents', apiKey),
    fetchAllFeatures('plannedEvents', apiKey),
    fetchAllFeatures('roadConditions', apiKey),
  ])
  return {
    fetchedAt: new Date().toISOString(),
    alerts: [
      ...incidents.map(normalizeIncident).filter((a): a is RoadAlert => a !== null),
      ...planned.map(normalizePlannedEvent).filter((a): a is RoadAlert => a !== null),
    ],
    conditions: conditions.map(normalizeRoadCondition).filter((c): c is RoadCondition => c !== null),
    counts: { incidents: incidents.length, plannedEvents: planned.length, roadConditions: conditions.length },
  }
}

// Let Vercel's CDN serve one copy for a couple of minutes instead of hitting COtrip per visitor.
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' }

export async function GET(request: Request): Promise<Response> {
  const feed = new URL(request.url).searchParams.get('feed') ?? ''
  if (feed !== 'snapshot' && !RAW_FEEDS.has(feed)) {
    return Response.json({ error: `Unknown feed "${feed}"` }, { status: 400 })
  }

  const apiKey = process.env.COTRIP_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'COTRIP_API_KEY is not configured' }, { status: 500 })
  }

  try {
    if (feed === 'snapshot') {
      return Response.json(await buildSnapshot(apiKey), { headers: CACHE_HEADERS })
    }

    const upstream = await fetch(feedUrl(feed, apiKey), { headers: { Accept: 'application/json' } })
    if (!upstream.ok) {
      return Response.json({ error: `COtrip returned ${upstream.status}` }, { status: 502 })
    }
    return new Response(upstream.body, {
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', ...CACHE_HEADERS },
    })
  } catch (err) {
    const message = err instanceof UpstreamError ? err.message : 'Could not reach COtrip'
    return Response.json({ error: message }, { status: 502 })
  }
}
