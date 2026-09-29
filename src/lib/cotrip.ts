import type { CotripSnapshot } from '../types'
import { readStorage, writeStorage } from './storage'

const CACHE_KEY = 'cotripCache'
/** Road alerts change faster than weather; the proxy's CDN cache is 2 minutes anyway. */
const CACHE_TTL_MS = 5 * 60 * 1000

interface Cached {
  savedAt: number
  snapshot: CotripSnapshot
}

/**
 * Colorado road alerts + surface conditions from CDOT's COtrip feed, via the app's own
 * /api/cotrip proxy (which holds the API key). Only available where that proxy runs --
 * on Vercel -- so everywhere else (GitHub Pages, plain `vite` dev) this resolves to null
 * and road features simply stay hidden.
 */
export async function fetchRoadSnapshot(options: { force?: boolean } = {}): Promise<CotripSnapshot | null> {
  const cached = readStorage<Cached | null>(CACHE_KEY, null)
  if (!options.force && cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.snapshot

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/cotrip?feed=snapshot`, { headers: { Accept: 'application/json' } })
    if (!res.ok || !res.headers.get('Content-Type')?.includes('json')) return cached?.snapshot ?? null
    const snapshot = (await res.json()) as CotripSnapshot
    if (!Array.isArray(snapshot.alerts) || !Array.isArray(snapshot.conditions)) return cached?.snapshot ?? null
    writeStorage<Cached>(CACHE_KEY, { savedAt: Date.now(), snapshot })
    return snapshot
  } catch {
    return cached?.snapshot ?? null
  }
}
