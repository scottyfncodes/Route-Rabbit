import { useCallback, useEffect, useState } from 'react'
import { fetchRoadSnapshot } from '../lib/cotrip'
import type { CotripSnapshot } from '../types'

interface Loaded {
  request: number
  snapshot: CotripSnapshot | null
}

/** CDOT road alerts + conditions for all of Colorado, shared by every screen that needs them. */
export function useRoadSnapshot() {
  // Bumped by refresh(); any value above 0 skips the short-lived cache.
  const [request, setRequest] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchRoadSnapshot({ force: request > 0 }).then((snapshot) => {
      if (!cancelled) setLoaded({ request, snapshot })
    })
    return () => {
      cancelled = true
    }
  }, [request])

  const refresh = useCallback(() => setRequest((n) => n + 1), [])
  // Keep showing the previous snapshot while a refresh is in flight.
  return { snapshot: loaded?.snapshot ?? null, loading: loaded?.request !== request, refresh }
}
