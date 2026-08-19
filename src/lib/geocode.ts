import type { GeoPoint } from '../types'
import { readStorage, writeStorage } from './storage'

const CACHE_KEY = 'geocodeCache'
const MIN_REQUEST_GAP_MS = 1100 // be polite to the free Nominatim/OSM endpoint

type GeoCache = Record<string, GeoPoint | null>

let lastRequestAt = 0
let queue: Promise<unknown> = Promise.resolve()

function normalize(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

function loadCache(): GeoCache {
  return readStorage<GeoCache>(CACHE_KEY, {})
}

function saveCache(cache: GeoCache): void {
  writeStorage(CACHE_KEY, cache)
}

async function throttle(): Promise<void> {
  const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now())
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

/**
 * Geocode a free-text address to lat/lng using OpenStreetMap's free Nominatim
 * service. Results are cached in localStorage indefinitely (addresses rarely
 * move), and requests are throttled to stay within Nominatim's usage policy.
 * Returns null if the address can't be resolved.
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const key = normalize(address)
  if (!key) return null

  const cache = loadCache()
  if (key in cache) return cache[key]

  const run = async (): Promise<GeoPoint | null> => {
    await throttle()
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) return null
      const data = (await res.json()) as Array<{ lat: string; lon: string }>
      if (!data.length) return null
      const point: GeoPoint = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      const updated = loadCache()
      updated[key] = point
      saveCache(updated)
      return point
    } catch {
      return null
    }
  }

  // chain onto the shared queue so calls stay serialized/throttled
  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return result
}

export async function geocodeMany(addresses: string[]): Promise<Map<string, GeoPoint | null>> {
  const results = new Map<string, GeoPoint | null>()
  for (const addr of addresses) {
    results.set(addr, await geocodeAddress(addr))
  }
  return results
}
