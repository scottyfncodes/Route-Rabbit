import type { GeoPoint } from '../types'
import { readStorage, writeStorage } from './storage'

const CACHE_KEY = 'addressCache'
const MIN_NOMINATIM_GAP_MS = 1100 // be polite to the free Nominatim/OSM endpoint

export interface AddressMatch {
  geo: GeoPoint
  /** What the geocoder thinks the address is. Shown so the therapist can catch a wrong match. */
  matchedAddress: string
  /** True only for a house-level match. Street, ZIP, or town-level matches need a look. */
  exact: boolean
  source: 'google' | 'osm'
}

type MatchCache = Record<string, AddressMatch>

let lastNominatimAt = 0
let queue: Promise<unknown> = Promise.resolve()

function normalize(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Google Geocoding through our own server function. Only the address text is sent
 * (in a POST body), never initials or notes. Returns undefined when the server can't
 * answer (no key, offline, outage) so the caller knows to try the fallback.
 */
async function viaServer(address: string, fetcher: Fetcher): Promise<AddressMatch | null | undefined> {
  try {
    const res = await fetcher('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { match: null | { lat: number; lng: number; matchedAddress: string; exact: boolean } }
    if (!data.match) return null
    return {
      geo: { lat: data.match.lat, lng: data.match.lng },
      matchedAddress: data.match.matchedAddress,
      exact: data.match.exact,
      source: 'google',
    }
  } catch {
    return undefined
  }
}

/** OpenStreetMap's free Nominatim, throttled. Used only when the server lookup isn't available. */
async function viaNominatim(address: string, fetcher: Fetcher): Promise<AddressMatch | null> {
  const run = async (): Promise<AddressMatch | null> => {
    const wait = Math.max(0, lastNominatimAt + MIN_NOMINATIM_GAP_MS - Date.now())
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastNominatimAt = Date.now()
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`
      const res = await fetcher(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) return null
      const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string; addresstype?: string }>
      if (!data.length) return null
      return {
        geo: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) },
        matchedAddress: data[0].display_name,
        exact: data[0].addresstype === 'house' || data[0].addresstype === 'building',
        source: 'osm',
      }
    } catch {
      return null
    }
  }
  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return result
}

/**
 * Finds an address on the map. Google first (much better at house numbers), then
 * Nominatim if the server lookup is unavailable or comes up empty. Successful matches
 * are cached on the device; misses are not, so a fixed typo or a later retry works.
 */
export async function lookupAddress(address: string, fetcher: Fetcher = fetch): Promise<AddressMatch | null> {
  const key = normalize(address)
  if (!key) return null

  const cache = readStorage<MatchCache>(CACHE_KEY, {})
  if (cache[key]) return cache[key]

  let match = await viaServer(address, fetcher)
  if (!match) match = await viaNominatim(address, fetcher)
  if (match) {
    const updated = readStorage<MatchCache>(CACHE_KEY, {})
    updated[key] = match
    writeStorage(CACHE_KEY, updated)
  }
  return match
}

/** Just the coordinates, for the start/end location fields. */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  return (await lookupAddress(address))?.geo ?? null
}
