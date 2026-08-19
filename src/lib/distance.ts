import type { GeoPoint } from '../types'

const EARTH_RADIUS_MILES = 3958.8
/** Straight-line distance underestimates real streets; roads-vs-crow fudge factor. */
const ROAD_WINDING_FACTOR = 1.3
/** Minutes added per stop for parking, traffic lights, and leaving a neighborhood. */
const FIXED_OVERHEAD_MINUTES = 4

export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return EARTH_RADIUS_MILES * c
}

export interface Leg {
  miles: number
  minutes: number
}

/**
 * Estimate a driving leg between two points without calling a paid routing
 * API. Uses a road-winding multiplier on straight-line distance plus a fixed
 * per-stop overhead. Deliberately conservative/practical, not turn-by-turn
 * accurate -- Google Maps handles actual navigation.
 */
export function estimateLeg(a: GeoPoint, b: GeoPoint, avgSpeedMph: number): Leg {
  const crowMiles = haversineMiles(a, b)
  const roadMiles = crowMiles * ROAD_WINDING_FACTOR
  const minutes = (roadMiles / Math.max(5, avgSpeedMph)) * 60 + FIXED_OVERHEAD_MINUTES
  return { miles: roadMiles, minutes }
}
