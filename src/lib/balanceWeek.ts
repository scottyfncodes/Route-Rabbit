import { TWICE_A_MONTH, WEEKDAYS, type GeoPoint, type Patient, type PatientPriority, type Weekday } from '../types'
import { estimateLeg } from './distance'
import { toMinutes } from './time'

/** Rough drive and setup time each visit adds to a day on top of the visit itself. */
const PER_VISIT_OVERHEAD = 20

/** How much busier another day has to be before two visits for the same patient land on back-to-back days. */
const BACK_TO_BACK_PENALTY_VISITS = 1.5

/**
 * How much evenness Build My Week gives up to keep a day in one area. Even days come
 * first: it takes about 40 minutes of driving saved before one day is allowed to carry
 * one more visit than another.
 */
const DRIVE_WEIGHT = 200

/** The day is cut into slots this long to see when visits can actually happen. */
const SLOT_MINUTES = 30

/** How hard to avoid piling more visits into the same hours than those hours can hold. */
const CROWDING_WEIGHT = 20

const PRIORITY_RANK: Record<PatientPriority, number> = { high: 0, medium: 1, low: 2 }

export interface WeekContext {
  /** Where each day starts. Every day's driving is measured from here. */
  home?: GeoPoint | null
  avgSpeedMph?: number
}

interface Plan {
  p: Patient
  available: Weekday[]
  need: number
  /** Minutes of the therapist's day one visit takes up, including getting there. */
  weight: number
  /** Per weekday: how much of the visit's time falls in each slot, spread over the times they can be seen. */
  demand: Map<Weekday, Map<number, number>>
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (items.length < k) return []
  const [first, ...rest] = items
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)]
}

function backToBackPairs(days: Weekday[]): number {
  const idx = days.map((d) => WEEKDAYS.indexOf(d)).sort((a, b) => a - b)
  let pairs = 0
  for (let i = 1; i < idx.length; i++) if (idx[i] - idx[i - 1] === 1) pairs += 1
  return pairs
}

/** Whether the patient's window, minus that weekday's blocked times, has a stretch long enough for the visit. */
function hasRoomFor(p: Patient, day: Weekday): boolean {
  const blocks = p.conflicts
    .filter((c) => c.day === day)
    .map((c) => [toMinutes(c.startTime), toMinutes(c.endTime)] as const)
    .sort((a, b) => a[0] - b[0])
  let cursor = toMinutes(p.windowStart)
  const end = toMinutes(p.windowEnd)
  for (const [bs, be] of blocks) {
    if (Math.min(bs, end) - cursor >= p.visitDuration) return true
    cursor = Math.max(cursor, be)
  }
  return end - cursor >= p.visitDuration
}

/**
 * Spreads one visit's time across the slots of the day when it could happen: inside the
 * patient's window, minus that weekday's blocked times. A patient free all day adds a
 * little to every slot; an after-school-only patient adds a lot to a few.
 */
function slotDemand(p: Patient, day: Weekday, weight: number): Map<number, number> {
  const start = toMinutes(p.windowStart)
  const end = toMinutes(p.windowEnd)
  const blocks = p.conflicts.filter((c) => c.day === day).map((c) => [toMinutes(c.startTime), toMinutes(c.endTime)] as const)
  const free = new Map<number, number>()
  let total = 0
  for (let slot = Math.floor(start / SLOT_MINUTES); slot * SLOT_MINUTES < end; slot++) {
    const s = Math.max(start, slot * SLOT_MINUTES)
    const e = Math.min(end, (slot + 1) * SLOT_MINUTES)
    let minutes = e - s
    for (const [bs, be] of blocks) minutes -= Math.max(0, Math.min(e, be) - Math.max(s, bs))
    if (minutes > 0) {
      free.set(slot, minutes)
      total += minutes
    }
  }
  const demand = new Map<number, number>()
  if (total > 0) for (const [slot, minutes] of free) demand.set(slot, (weight * minutes) / total)
  return demand
}

/**
 * Picks which of their available days each patient is seen, across the whole caseload at
 * once. A good week has:
 * - days that carry about the same amount of work,
 * - each day kept to one part of town where it can be,
 * - no more visits squeezed into the same hours than those hours hold (after-school
 *   patients, blocked times),
 * - a patient's visits on days that aren't back to back.
 *
 * Higher-priority patients pick first, so their days are set before anyone else's, and the
 * clean-up pass never trades a day between patients of different priority. Patients with no
 * choice at all (needed every day they're available) are placed before everyone, since
 * their days are fixed anyway.
 *
 * Patients are expected to already carry the visit option being scheduled (visitDuration,
 * visitsPerWeek). Same caseload in, same days out, so the weekly routine holds steady.
 * Twice-a-month patients count at half weight and get one day; the caller drops them in
 * their off weeks, which keeps everyone else's days the same from week to week.
 */
export function assignWeekDays(patients: Patient[], context: WeekContext = {}): Map<string, Weekday[]> {
  const speed = context.avgSpeedMph ?? 26
  const home = context.home ?? null

  const plans: Plan[] = patients.map((p) => {
    const listed = WEEKDAYS.filter((d) => p.availableDays.includes(d))
    // Days their blocked times leave no room for the visit don't count, unless that's every day (the route will flag it).
    const workable = listed.filter((d) => hasRoomFor(p, d))
    const available = workable.length > 0 ? workable : listed
    const need = p.visitsPerWeek === null ? available.length : Math.min(available.length, Math.max(0, Math.ceil(p.visitsPerWeek)))
    const weight = (p.visitDuration + PER_VISIT_OVERHEAD) * (p.visitsPerWeek === TWICE_A_MONTH ? 0.5 : 1)
    return { p, available, need, weight, demand: new Map(available.map((d) => [d, slotDemand(p, d, weight)])) }
  })

  // Drive minutes between every pair of patients (and home), estimated from the map.
  const driveCache = new Map<string, number>()
  const drive = (a: GeoPoint, b: GeoPoint, key: string): number => {
    let minutes = driveCache.get(key)
    if (minutes === undefined) {
      minutes = estimateLeg(a, b, speed).minutes
      driveCache.set(key, minutes)
    }
    return minutes
  }

  const assigned = new Map<string, Weekday[]>()
  const onDay = new Map<Weekday, Plan[]>(WEEKDAYS.map((d) => [d, []]))

  /**
   * One day's cost: squared load (even days), crowding in the same hours, and how spread
   * out its stops are (each stop's drive from the nearest other stop or home, a stand-in
   * for the driving that day will need).
   */
  const dayCost = (day: Weekday, members: Plan[]): number => {
    let load = 0
    const slots = new Map<number, number>()
    for (const m of members) {
      load += m.weight
      for (const [slot, minutes] of m.demand.get(day) ?? []) slots.set(slot, (slots.get(slot) ?? 0) + minutes)
    }
    let crowding = 0
    for (const minutes of slots.values()) crowding += Math.max(0, minutes - SLOT_MINUTES) ** 2

    let spread = 0
    const located = members.filter((m) => m.p.geo)
    for (const m of located) {
      let nearest = home ? drive(m.p.geo!, home, `h|${m.p.id}`) : Infinity
      for (const other of located) {
        if (other === m) continue
        const key = m.p.id < other.p.id ? `${m.p.id}|${other.p.id}` : `${other.p.id}|${m.p.id}`
        nearest = Math.min(nearest, drive(m.p.geo!, other.p.geo!, key))
      }
      if (Number.isFinite(nearest)) spread += nearest * m.weight / (m.p.visitDuration + PER_VISIT_OVERHEAD)
    }

    return load * load + CROWDING_WEIGHT * crowding + DRIVE_WEIGHT * spread
  }

  const spacingCost = (plan: Plan, days: Weekday[]): number =>
    backToBackPairs(days) * BACK_TO_BACK_PENALTY_VISITS * 2 * plan.weight * plan.weight

  /** Change in total cost if `plan` moved from its current days to `next`. */
  const moveDelta = (plan: Plan, next: Weekday[]): number => {
    const current = assigned.get(plan.p.id) ?? []
    const touched = new Set([...current, ...next])
    let delta = spacingCost(plan, next) - (current.length ? spacingCost(plan, current) : 0)
    for (const day of touched) {
      const members = onDay.get(day)!
      const without = members.filter((m) => m !== plan)
      const after = next.includes(day) ? [...without, plan] : without
      delta += dayCost(day, after) - dayCost(day, members)
    }
    return delta
  }

  const place = (plan: Plan, days: Weekday[]) => {
    for (const d of assigned.get(plan.p.id) ?? []) onDay.set(d, onDay.get(d)!.filter((m) => m !== plan))
    for (const d of days) onDay.get(d)!.push(plan)
    assigned.set(plan.p.id, days)
  }

  // First pass: everyone picks their best days in turn.
  const order = [...plans].sort(
    (a, b) =>
      Number(a.available.length > a.need) - Number(b.available.length > b.need) ||
      PRIORITY_RANK[a.p.priority] - PRIORITY_RANK[b.p.priority] ||
      a.available.length - a.need - (b.available.length - b.need) ||
      b.weight - a.weight ||
      a.p.id.localeCompare(b.p.id),
  )
  const options = new Map(plans.map((plan) => [plan, combinations(plan.available, plan.need)]))
  for (const plan of order) {
    let best: Weekday[] = []
    let bestDelta = Infinity
    for (const days of options.get(plan)!) {
      const delta = moveDelta(plan, days)
      if (delta < bestDelta - 1e-6) {
        bestDelta = delta
        best = days
      }
    }
    place(plan, best)
  }

  // Clean-up: move single patients, or trade days between two, while that improves the week.
  const flexible = order.filter((plan) => options.get(plan)!.length > 1)
  for (let sweep = 0; sweep < 30; sweep++) {
    let improved = false

    for (const plan of flexible) {
      const current = assigned.get(plan.p.id)!
      for (const days of options.get(plan)!) {
        if (days.join() === current.join()) continue
        if (moveDelta(plan, days) < -1e-6) {
          place(plan, days)
          improved = true
          break
        }
      }
    }

    for (let i = 0; i < flexible.length; i++) {
      for (let j = i + 1; j < flexible.length; j++) {
        if (tryTrade(flexible[i], flexible[j])) improved = true
      }
    }

    if (!improved) break
  }

  /** Cost of just these days plus these patients' spacing, for comparing a trade before and after. */
  function localCost(days: Weekday[], members: Plan[]): number {
    let cost = 0
    for (const day of days) cost += dayCost(day, onDay.get(day)!)
    for (const plan of members) cost += spacingCost(plan, assigned.get(plan.p.id) ?? [])
    return cost
  }

  /** Swaps one of a's days for one of b's when that makes the week better. Keeps the load the same, so it can fix geography a single move can't. */
  function tryTrade(a: Plan, b: Plan): boolean {
    // Never hand a higher-priority patient's day to a lower-priority one.
    if (a.p.priority !== b.p.priority) return false
    const aDays = assigned.get(a.p.id)!
    const bDays = assigned.get(b.p.id)!
    for (const x of aDays) {
      for (const y of bDays) {
        if (x === y || aDays.includes(y) || bDays.includes(x)) continue
        if (!a.available.includes(y) || !b.available.includes(x)) continue
        const aNext = WEEKDAYS.filter((d) => d === y || (d !== x && aDays.includes(d)))
        const bNext = WEEKDAYS.filter((d) => d === x || (d !== y && bDays.includes(d)))
        const before = localCost([x, y], [a, b])
        place(a, aNext)
        place(b, bNext)
        if (localCost([x, y], [a, b]) < before - 1e-6) return true
        place(a, aDays)
        place(b, bDays)
      }
    }
    return false
  }

  // Report in a stable order regardless of the order patients came in.
  return new Map([...assigned.entries()].sort(([a], [b]) => a.localeCompare(b)))
}
