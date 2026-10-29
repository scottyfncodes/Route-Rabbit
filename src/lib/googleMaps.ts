import type { GeoPoint, Stop } from '../types'

type Place = { address?: string; geo: GeoPoint | null }

/**
 * Prefers the typed address: Google geocodes it better than our free lookup (which can
 * land mid-block), and its directions screen then shows a street name, not raw coordinates.
 */
function locParam(loc: Place): string {
  if (loc.address?.trim()) return loc.address.trim()
  if (loc.geo) return `${loc.geo.lat},${loc.geo.lng}`
  return ''
}

/** Google Maps directions links accept at most this many stops between origin and destination. */
export const MAX_WAYPOINTS = 9

/** Multi-stop driving directions URL: origin -> waypoints... -> destination. */
export function buildDirectionsUrl(origin: Place, stops: Place[], destination: Place): string {
  const params = new URLSearchParams()
  params.set('api', '1')
  params.set('travelmode', 'driving')
  params.set('origin', locParam(origin))
  params.set('destination', locParam(destination))
  if (stops.length) {
    params.set('waypoints', stops.map(locParam).join('|'))
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export interface RouteLink {
  url: string
  /** 1-based visit numbers this part covers, e.g. 1-10. */
  firstVisit: number
  lastVisit: number
  endsAtDestination: boolean
}

/**
 * Directions links for a built day, in visit order. A day with more visits than one
 * link can hold is split into parts, each picking up where the last one ended.
 */
export function buildRouteLinks(stops: Stop[]): RouteLink[] {
  const start = stops.find((s) => s.kind === 'start')
  const end = stops.find((s) => s.kind === 'end')
  const visits = stops.filter((s) => s.kind === 'visit')
  if (!start || !end || visits.length === 0) return []

  const points: Place[] = [start, ...visits, end]
  const links: RouteLink[] = []
  // Each link spans origin + waypoints + destination; the next link starts at that destination.
  const span = MAX_WAYPOINTS + 1
  for (let from = 0; from < points.length - 1; from += span) {
    const to = Math.min(from + span, points.length - 1)
    links.push({
      url: buildDirectionsUrl(points[from], points.slice(from + 1, to), points[to]),
      firstVisit: from + 1,
      lastVisit: Math.min(to, visits.length),
      endsAtDestination: to === points.length - 1,
    })
  }
  return links
}

/** Single-destination "navigate to" URL, used for I'm Here / Next Stop navigation. */
export function buildNavigateUrl(destination: Place, origin?: Place): string {
  const params = new URLSearchParams()
  params.set('api', '1')
  params.set('travelmode', 'driving')
  params.set('destination', locParam(destination))
  if (origin) params.set('origin', locParam(origin))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export type NearbyCategory = 'coffee' | 'lunch' | 'parks'

const CATEGORY_QUERY: Record<NearbyCategory, string> = {
  coffee: 'coffee shop',
  lunch: 'restaurants',
  parks: 'parks',
}

/** Context-aware nearby-places search, biased to a location without requiring copy/paste. */
export function buildNearbySearchUrl(category: NearbyCategory, near: Place): string {
  const query = CATEGORY_QUERY[category]
  const params = new URLSearchParams()
  params.set('api', '1')
  if (near.geo) {
    // Google's search API has no explicit "near" param; encoding the coordinate
    // in the query text is what reliably biases results without a Places API key.
    params.set('query', `${query} near ${near.geo.lat},${near.geo.lng}`)
  } else {
    params.set('query', `${query}${near.address ? ` near ${near.address}` : ''}`)
  }
  return `https://www.google.com/maps/search/?${params.toString()}`
}
