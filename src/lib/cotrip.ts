// Client for the COtrip proxy in api/cotrip.ts. Only works when deployed on
// Vercel (or under `vercel dev`), since the proxy is a serverless function.

export type CotripFeed =
  | 'incidents'
  | 'roadConditions'
  | 'plannedEvents'
  | 'weatherStations'
  | 'snowPlows'
  | 'destinations'
  | 'signs'
  | 'cwz'
  | 'wzdx'

export async function fetchCotripFeed<T = unknown>(feed: CotripFeed): Promise<T> {
  const res = await fetch(`/api/cotrip?feed=${feed}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`COtrip ${feed} request failed (${res.status})`)
  return (await res.json()) as T
}
