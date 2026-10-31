// Real road drive times, fetched through our own /api/drive-times function (Google
// Routes, traffic-aware) and cached on the device so the same leg isn't asked for
// twice. Only coordinates and a departure time ever leave the phone.
//
// Cache shape: one entry per (from, to, weekday, hour). A Monday 9 AM leg is reused for
// every Monday around 9 AM for 30 days, since typical traffic repeats week to week.

import type { GeoPoint, Weekday } from '../types'
import { readStorage, writeStorage } from './storage'
import { weekdayOf } from './time'

const CACHE_KEY = 'driveTimeCache'
const TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 5000
/** Google's cap is 625 elements (25 x 25) per traffic-aware matrix request. */
const MAX_SIDE = 25
/** After the service fails (no key, outage, no signal), wait this long before trying again. */
const RETRY_AFTER_MS = 5 * 60 * 1000

export interface RoadLeg {
  minutes: number
  miles: number
}

/** A leg the router wants a real time for: from, to, and when the drive starts (minutes since midnight). */
export interface LegRequest {
  from: GeoPoint
  to: GeoPoint
  departMinutes: number
}

export type FetchOutcome = 'ok' | 'cached' | 'unavailable'

interface Entry {
  m: number // minutes
  mi: number // miles
  t: number // fetched at (ms)
}
type Cache = Record<string, Entry>

let memory: Cache | null = null
let unavailableUntil = 0

function prune(cache: Cache, now = Date.now()): Cache {
  const fresh = Object.entries(cache).filter(([, e]) => e && now - e.t < TTL_MS)
  // Oldest out first if the cache ever grows past its cap.
  fresh.sort((a, b) => b[1].t - a[1].t)
  return Object.fromEntries(fresh.slice(0, MAX_ENTRIES))
}

function cache(): Cache {
  if (!memory) memory = prune(readStorage<Cache>(CACHE_KEY, {}))
  return memory
}

function persist(): void {
  if (memory) writeStorage(CACHE_KEY, prune(memory))
}

/** Test hook: start from an empty cache with the service considered available. */
export function resetDriveTimeCache(): void {
  memory = {}
  unavailableUntil = 0
}

/** ~1 m precision: the same house always maps to the same key. */
export function pointKey(p: GeoPoint): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
}

function hourOf(minutes: number): number {
  return Math.max(0, Math.min(23, Math.floor(minutes / 60)))
}

function legKey(a: GeoPoint, b: GeoPoint, weekday: Weekday, hour: number): string {
  return `${pointKey(a)}>${pointKey(b)}@${weekday}${hour}`
}

function samePlace(a: GeoPoint, b: GeoPoint): boolean {
  return pointKey(a) === pointKey(b)
}

/** True when this exact leg at this exact weekday/hour is already cached. */
export function hasRoadLeg(a: GeoPoint, b: GeoPoint, weekday: Weekday, departMinutes: number): boolean {
  if (samePlace(a, b)) return true
  return Boolean(cache()[legKey(a, b, weekday, hourOf(departMinutes))])
}

/**
 * The cached real leg for this weekday, at the departure hour if we have it, otherwise
 * the nearest hour we do have (traffic at 10 AM is a far better guess for 10:40 than a
 * straight line). Null when this pair has never been fetched for this weekday.
 */
export function cachedRoadLeg(a: GeoPoint, b: GeoPoint, weekday: Weekday, departMinutes: number): RoadLeg | null {
  if (samePlace(a, b)) return { minutes: 0, miles: 0 }
  const c = cache()
  const hour = hourOf(departMinutes)
  for (let offset = 0; offset < 24; offset++) {
    for (const h of offset === 0 ? [hour] : [hour - offset, hour + offset]) {
      if (h < 0 || h > 23) continue
      const e = c[legKey(a, b, weekday, h)]
      if (e) return { minutes: e.m, miles: e.mi }
    }
  }
  return null
}

/**
 * A memoized lookup for one day's route build. The optimizer asks for the same legs
 * thousands of times, so each (pair, hour) is resolved once.
 */
export function roadLegLookup(date: string): (a: GeoPoint, b: GeoPoint, departMinutes: number) => RoadLeg | null {
  const weekday = weekdayOf(date)
  const memo = new Map<string, RoadLeg | null>()
  return (a, b, departMinutes) => {
    const key = `${pointKey(a)}>${pointKey(b)}@${hourOf(departMinutes)}`
    if (!memo.has(key)) memo.set(key, cachedRoadLeg(a, b, weekday, departMinutes))
    return memo.get(key) ?? null
  }
}

/**
 * When to ask Google about: the visit's own date and time. Google only predicts traffic
 * for the future, so a time that has already passed (rebuilding this morning's route, or
 * looking back at last week) moves forward a week at a time to the next matching weekday
 * and hour, which has the same typical traffic.
 */
export function departureIso(date: string, minutes: number, now = Date.now()): string {
  const d = new Date(`${date}T00:00:00`)
  d.setMinutes(Math.round(minutes))
  while (d.getTime() < now + 5 * 60 * 1000) d.setDate(d.getDate() + 7)
  return d.toISOString()
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>

/**
 * Makes sure every requested leg has a real road time cached for its weekday and hour,
 * asking the server only for the ones that are missing. Legs are grouped by departure
 * hour, and each hour is one matrix request (two or more only past 25 x 25 points).
 *
 * Never throws: when the service can't be reached the router simply falls back to its
 * estimate for whatever is still missing, and the route says so.
 */
export async function fetchRoadLegs(date: string, requests: LegRequest[], fetcher: Fetcher = fetch): Promise<FetchOutcome> {
  const weekday = weekdayOf(date)
  const missing = requests.filter((r) => !hasRoadLeg(r.from, r.to, weekday, r.departMinutes))
  if (missing.length === 0) return 'cached'
  if (isOffline() || Date.now() < unavailableUntil) return 'unavailable'

  const byHour = new Map<number, LegRequest[]>()
  for (const r of missing) {
    const h = hourOf(r.departMinutes)
    byHour.set(h, [...(byHour.get(h) ?? []), r])
  }

  const c = cache()

  for (const [hour, legs] of byHour) {
    const origins = uniquePoints(legs.map((l) => l.from))
    const destinations = uniquePoints(legs.map((l) => l.to))
    const departMinutes = Math.min(...legs.map((l) => l.departMinutes))

    for (const originChunk of chunk(origins, MAX_SIDE)) {
      for (const destChunk of chunk(destinations, MAX_SIDE)) {
        let res: Response
        try {
          res = await fetcher('/api/drive-times', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Coordinates and a time only. Nothing else about the patient is in this request.
            body: JSON.stringify({
              origins: originChunk.map(({ lat, lng }) => ({ lat, lng })),
              destinations: destChunk.map(({ lat, lng }) => ({ lat, lng })),
              departureTime: departureIso(date, departMinutes),
            }),
          })
        } catch {
          unavailableUntil = Date.now() + RETRY_AFTER_MS
          persist()
          return 'unavailable'
        }
        if (!res.ok) {
          unavailableUntil = Date.now() + RETRY_AFTER_MS
          persist()
          return 'unavailable'
        }
        const data = (await res.json()) as { legs?: Array<{ o: number; d: number; minutes: number; miles: number }> }
        const now = Date.now()
        for (const leg of data.legs ?? []) {
          const from = originChunk[leg.o]
          const to = destChunk[leg.d]
          if (!from || !to || typeof leg.minutes !== 'number' || typeof leg.miles !== 'number') continue
          c[legKey(from, to, weekday, hour)] = { m: leg.minutes, mi: leg.miles, t: now }
        }
      }
    }
  }

  persist()
  return 'ok'
}

function uniquePoints(points: GeoPoint[]): GeoPoint[] {
  const seen = new Map<string, GeoPoint>()
  for (const p of points) if (!seen.has(pointKey(p))) seen.set(pointKey(p), p)
  return [...seen.values()]
}

/** Every leg a day could possibly drive: start to each patient, patient to patient, each patient to the end. */
export function dayMatrixRequests(start: GeoPoint | null, stops: GeoPoint[], end: GeoPoint | null, departMinutes: number): LegRequest[] {
  const origins = [...(start ? [start] : []), ...stops]
  const destinations = [...stops, ...(end ? [end] : [])]
  const out: LegRequest[] = []
  for (const from of origins) {
    for (const to of destinations) {
      if (!samePlace(from, to)) out.push({ from, to, departMinutes })
    }
  }
  return out
}
