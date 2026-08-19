import type { GeoPoint, NamedLocation } from '../types'

function locParam(loc: { address?: string; geo: GeoPoint | null }): string {
  if (loc.geo) return `${loc.geo.lat},${loc.geo.lng}`
  return loc.address ?? ''
}

/** Multi-stop driving directions URL: origin -> waypoints... -> destination. */
export function buildDirectionsUrl(
  origin: NamedLocation,
  stops: Array<{ address?: string; geo: GeoPoint | null }>,
  destination: NamedLocation,
): string {
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

/** Single-destination "navigate to" URL, used for I'm Here / Next Stop navigation. */
export function buildNavigateUrl(
  destination: { address?: string; geo: GeoPoint | null },
  origin?: { address?: string; geo: GeoPoint | null },
): string {
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
export function buildNearbySearchUrl(category: NearbyCategory, near: { address?: string; geo: GeoPoint | null }): string {
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
