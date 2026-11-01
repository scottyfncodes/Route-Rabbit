import type { BuiltRoute, DriveSource, GeoPoint, LunchPreference, NamedLocation, Patient, PatientPriority, RouteConflict, Stop, Weekday, WeatherImpact } from '../types'
import { estimateLeg } from './distance'
import type { RoadLeg } from './driveTimes'
import { fromMinutes, toMinutes, weekdayOf } from './time'
import { speedMultiplierFor, weatherAdvisory } from './weather'

export interface RoutingInput {
  date: string
  dayStartTime: string
  startLocation: NamedLocation
  endLocation: NamedLocation
  patients: Patient[]
  lunch: LunchPreference
  avgSpeedMph: number
  /** Forecasted driving impact for this date, if known -- slows the effective speed used for every leg. */
  weatherImpact?: WeatherImpact
  weatherLabel?: string
  /** Patients added today as a make-up visit -- exempt from the regular availableDays check for this date only. */
  makeupPatientIds?: string[]
  /**
   * Patients already visited (or in progress) today, in the order they were seen. They
   * stay at the front of the route in this exact order; only the rest of the day is
   * re-optimized -- so a mid-day rebuild never reshuffles visits that already happened.
   */
  lockedPatientIds?: string[]
  /**
   * Minutes since midnight that the not-yet-visited part of the day can't start before --
   * "now" on a same-day rebuild, so a visit that ran long pushes the rest of the day back
   * instead of the plan pretending everything is still on time.
   */
  resumeAtMinutes?: number
  /**
   * Real road drive time for a leg leaving at `departMinutes`, or null when there isn't one
   * (offline, service down, never fetched). Null legs fall back to the straight-line estimate
   * and are flagged as estimated on the route. Leave unset to estimate everything.
   */
  roadLeg?: (from: GeoPoint, to: GeoPoint, departMinutes: number) => RoadLeg | null
}

export interface DrivenLeg {
  minutes: number
  miles: number
  source: DriveSource
}

/** One leg lookup for the whole build: real road time when we have it, the estimate when we don't. */
export type LegFn = (from: GeoPoint, to: GeoPoint, departMinutes: number) => DrivenLeg

export function legFunction(
  avgSpeedMph: number,
  speedMultiplier: number,
  roadLeg?: RoutingInput['roadLeg'],
): LegFn {
  const estimateSpeed = avgSpeedMph * speedMultiplier
  return (from, to, departMinutes) => {
    const road = roadLeg?.(from, to, departMinutes)
    // Google's traffic prediction doesn't know about snow, so a bad-weather day slows real legs the same way it slows estimates.
    if (road) return { minutes: road.minutes / speedMultiplier, miles: road.miles, source: 'road' }
    return { ...estimateLeg(from, to, estimateSpeed), source: 'estimate' }
  }
}

const NO_DRIVE: DrivenLeg = { minutes: 0, miles: 0, source: 'road' }

const OPEN_BLOCK_THRESHOLD_MINUTES = 15

interface Interval {
  start: number
  end: number
}

/** Subtracts a patient's conflict windows (for one weekday) out of their overall availability window. */
function freeIntervals(windowStart: number, windowEnd: number, blockedIntervals: Interval[]): Interval[] {
  const blocks = blockedIntervals
    .map((b) => ({ start: Math.max(windowStart, b.start), end: Math.min(windowEnd, b.end) }))
    .filter((b) => b.start < b.end)
    .sort((a, b) => a.start - b.start)

  const free: Interval[] = []
  let cursor = windowStart
  for (const block of blocks) {
    if (block.start > cursor) free.push({ start: cursor, end: block.start })
    cursor = Math.max(cursor, block.end)
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd })
  return free
}

/** Earliest moment at/after `arrival` where a visit of `duration` fits within a free interval. */
function earliestSlot(free: Interval[], arrival: number, duration: number): number | null {
  for (const interval of free) {
    const start = Math.max(arrival, interval.start)
    if (start + duration <= interval.end) return start
  }
  return null
}

function conflictIntervalsFor(patient: Patient, weekday: Weekday): Interval[] {
  return patient.conflicts
    .filter((c) => c.day === weekday)
    .map((c) => ({ start: toMinutes(c.startTime), end: toMinutes(c.endTime) }))
}

/** Where (if anywhere) this patient could start a visit today, respecting their window and any conflicts. */
function findVisitSlot(patient: Patient, weekday: Weekday, arrival: number): number | null {
  const windowStart = toMinutes(patient.windowStart)
  const windowEnd = toMinutes(patient.windowEnd)
  const free = freeIntervals(windowStart, windowEnd, conflictIntervalsFor(patient, weekday))
  return earliestSlot(free, arrival, patient.visitDuration)
}

interface ScheduledVisit {
  patient: Patient
  arrive: number
  depart: number
  driveMinutes: number
  driveMiles: number
  driveSource: DriveSource
}

/** Visits from index `afterCount` on can't leave for their drive before `atMinutes`. */
interface Resume {
  afterCount: number
  atMinutes: number
}

/** Forward-simulate a fixed patient order from the start location; reports feasibility per stop. */
function simulateOrder(
  order: Patient[],
  start: { geo: NamedLocation['geo'] },
  dayStartMinutes: number,
  leg: LegFn,
  weekday: Weekday,
  resume?: Resume,
  endGeo?: GeoPoint | null,
  /** Visits before this index already happened, so they can't make the plan infeasible. */
  settledCount = 0,
): { visits: ScheduledVisit[]; feasible: boolean; totalDriveMinutes: number; finishMinutes: number; homeMinutes: number; endDriveMinutes: number } {
  let currentTime = dayStartMinutes
  let currentGeo = start.geo
  const visits: ScheduledVisit[] = []
  let feasible = true
  let totalDriveMinutes = 0

  // Running behind: the visit underway when the day resumes simply runs until then.
  const applyResume = () => {
    if (!resume || resume.atMinutes <= currentTime) return
    if (visits.length > 0) visits[visits.length - 1].depart = resume.atMinutes
    currentTime = resume.atMinutes
  }

  order.forEach((patient, idx) => {
    if (resume && idx === resume.afterCount) applyResume()
    const drive = currentGeo && patient.geo ? leg(currentGeo, patient.geo, currentTime) : NO_DRIVE
    const driveMinutes = drive.minutes
    const driveMiles = drive.miles
    const arrive = currentTime + driveMinutes
    const slot = findVisitSlot(patient, weekday, arrive)
    const actualStart = slot ?? arrive
    const depart = actualStart + patient.visitDuration
    if (slot === null && idx >= settledCount) feasible = false

    visits.push({ patient, arrive: actualStart, depart, driveMinutes, driveMiles, driveSource: drive.source })
    totalDriveMinutes += driveMinutes
    currentTime = depart
    currentGeo = patient.geo ?? currentGeo
  })
  if (resume && order.length === resume.afterCount) applyResume()

  const endDriveMinutes = currentGeo && endGeo ? leg(currentGeo, endGeo, currentTime).minutes : 0
  return { visits, feasible, totalDriveMinutes, finishMinutes: currentTime, homeMinutes: currentTime + endDriveMinutes, endDriveMinutes }
}

const PRIORITY_RANK: Record<PatientPriority, number> = { high: 0, medium: 1, low: 2 }

/** Minutes of slack in a patient's day: free time in their window (minus blocked times) beyond the visit itself. */
function windowSlack(patient: Patient, weekday: Weekday): number {
  const free = freeIntervals(toMinutes(patient.windowStart), toMinutes(patient.windowEnd), conflictIntervalsFor(patient, weekday))
  return free.reduce((sum, i) => sum + Math.max(0, i.end - i.start - patient.visitDuration), 0)
}

/**
 * The order patients claim their place in the day: higher scheduling priority first, so
 * their visits are set before anyone else's and never bumped for a lower-priority one.
 * Within the same priority, the tightest windows go first, since they have the fewest
 * places they can go.
 */
function placementOrder(patients: Patient[], weekday: Weekday): Patient[] {
  return [...patients].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      windowSlack(a, weekday) - windowSlack(b, weekday) ||
      a.id.localeCompare(b.id),
  )
}

interface DayContext {
  start: { geo: NamedLocation['geo'] }
  endGeo: GeoPoint | null
  dayStartMinutes: number
  leg: LegFn
  weekday: Weekday
  resume?: Resume
  /** Visits already done today, at the front of the order. */
  settledCount: number
}

function simulate(order: Patient[], ctx: DayContext) {
  return simulateOrder(order, ctx.start, ctx.dayStartMinutes, ctx.leg, ctx.weekday, ctx.resume, ctx.endGeo, ctx.settledCount)
}

/** Puts `patient` wherever in the day it costs least, without breaking anyone else's window. Null when there's no such place. */
function bestInsertion(order: Patient[], patient: Patient, fixedCount: number, ctx: DayContext): Patient[] | null {
  let best: Patient[] | null = null
  let bestScore = Infinity
  for (let pos = fixedCount; pos <= order.length; pos++) {
    const candidate = [...order.slice(0, pos), patient, ...order.slice(pos)]
    const result = simulate(candidate, ctx)
    if (!result.feasible) continue
    const score = scheduleScore(result)
    if (score < bestScore - 0.01) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

/** Greedy "nearest next stop" order: often a tight loop, but blind to priority and can strand a tight window. */
function nearestNextOrder(candidates: Patient[], fixed: Patient[], ctx: DayContext): Patient[] {
  const settled = simulate(fixed, ctx)
  const remaining = [...candidates].sort((a, b) => a.id.localeCompare(b.id))
  const order = [...fixed]
  let currentTime = settled.finishMinutes
  let currentGeo = fixed.length > 0 ? (fixed[fixed.length - 1].geo ?? ctx.start.geo) : ctx.start.geo

  while (remaining.length > 0) {
    let bestIdx = -1
    let bestScore = Infinity
    remaining.forEach((patient, idx) => {
      const drive = currentGeo && patient.geo ? ctx.leg(currentGeo, patient.geo, currentTime) : NO_DRIVE
      const arrive = currentTime + drive.minutes
      const actualStart = findVisitSlot(patient, ctx.weekday, arrive)
      if (actualStart === null) return
      const score = drive.minutes + (actualStart - arrive) * 0.75 + (toMinutes(patient.windowEnd) - actualStart) * 0.05
      if (score < bestScore) {
        bestScore = score
        bestIdx = idx
      }
    })
    if (bestIdx === -1) break
    const [chosen] = remaining.splice(bestIdx, 1)
    const drive = currentGeo && chosen.geo ? ctx.leg(currentGeo, chosen.geo, currentTime) : NO_DRIVE
    const arrive = currentTime + drive.minutes
    currentTime = (findVisitSlot(chosen, ctx.weekday, arrive) ?? arrive) + chosen.visitDuration
    currentGeo = chosen.geo ?? currentGeo
    order.push(chosen)
  }
  return order
}

/** How many High, Medium and Low visits a day keeps -- compared High first, so no amount of Lows outweighs one High. */
function priorityCounts(order: Patient[]): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0]
  for (const p of order) counts[PRIORITY_RANK[p.priority]] += 1
  return counts
}

function keepsMorePriority(a: Patient[], b: Patient[]): number {
  const ca = priorityCounts(a)
  const cb = priorityCounts(b)
  for (let i = 0; i < 3; i++) if (ca[i] !== cb[i]) return ca[i] - cb[i]
  return 0
}

/**
 * Builds the day two ways and keeps the better one:
 * 1. Priority first: patients claim their place one at a time, higher priority and tighter
 *    windows first, each going wherever it fits best. Everyone already placed has to keep
 *    fitting, so a lower-priority patient can never push out a higher-priority one.
 * 2. Nearest next stop, which often gives a tighter loop.
 * Both are tidied and then anyone left out gets another try. The winner is whichever keeps
 * more High visits, then Medium, then Low; only when those tie does the better route win.
 */
function insertionConstruct(candidates: Patient[], fixed: Patient[], ctx: DayContext): { order: Patient[]; unscheduled: Patient[] } {
  const byPriority: Patient[] = [...fixed]
  let start = byPriority
  for (const patient of placementOrder(candidates, ctx.weekday)) {
    start = bestInsertion(start, patient, fixed.length, ctx) ?? start
  }

  const results = [start, nearestNextOrder(candidates, fixed, ctx)].map((order) => completeDay(order, candidates, fixed.length, ctx))
  results.sort(
    (a, b) => keepsMorePriority(b.order, a.order) || scheduleScore(simulate(a.order, ctx)) - scheduleScore(simulate(b.order, ctx)),
  )
  return results[0]
}

/** Tidies a starting order, then fits in anyone still missing (priority order) wherever they go. */
function completeDay(initial: Patient[], candidates: Patient[], fixedCount: number, ctx: DayContext): { order: Patient[]; unscheduled: Patient[] } {
  let order = improveOrder(initial, ctx, fixedCount)
  let unscheduled = placementOrder(candidates.filter((p) => !order.includes(p)), ctx.weekday)
  let retry = true
  while (retry && unscheduled.length > 0) {
    retry = false
    for (const patient of unscheduled) {
      const placed = bestInsertion(order, patient, fixedCount, ctx)
      if (!placed) continue
      order = improveOrder(placed, ctx, fixedCount)
      unscheduled = unscheduled.filter((p) => p !== patient)
      retry = true
      break
    }
  }
  return { order, unscheduled }
}

/**
 * Ranks a simulated day: getting home sooner matters far more than shaving a few
 * minutes of driving, since a route that "wins" on drive time by leaving a
 * huge unproductive gap mid-day is a worse schedule in practice. The drive home
 * counts, so the day doesn't end at the farthest patient.
 */
function scheduleScore(result: { homeMinutes: number; totalDriveMinutes: number; endDriveMinutes: number }): number {
  return result.homeMinutes + (result.totalDriveMinutes + result.endDriveMinutes) * 0.1
}

/**
 * Candidate reorderings of `order` for local search: every sub-segment reversal
 * (2-opt) and every single-visit relocation (or-opt). The first `fixedCount`
 * visits are never moved.
 */
function* neighborhood(order: Patient[], fixedCount: number): Generator<Patient[]> {
  const n = order.length
  for (let i = fixedCount; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      yield [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)]
    }
  }
  for (let i = fixedCount; i < n; i++) {
    const without = [...order.slice(0, i), ...order.slice(i + 1)]
    for (let j = fixedCount; j < n; j++) {
      if (j === i || j === i - 1) continue // same order as today (or a plain swap already covered by 2-opt)
      yield [...without.slice(0, j), order[i], ...without.slice(j)]
    }
  }
}

/** Local-search improvement: keep applying the first reversal/relocation that tightens the day until none does. */
function improveOrder(order: Patient[], ctx: DayContext, fixedCount = 0): Patient[] {
  let best = order
  let bestResult = simulate(best, ctx)
  if (!bestResult.feasible) return best

  let evaluations = 0
  const MAX_EVALUATIONS = 20000
  let improved = true

  while (improved && evaluations < MAX_EVALUATIONS) {
    improved = false
    for (const candidate of neighborhood(best, fixedCount)) {
      if (++evaluations > MAX_EVALUATIONS) break
      const result = simulate(candidate, ctx)
      if (result.feasible && scheduleScore(result) < scheduleScore(bestResult) - 0.01) {
        best = candidate
        bestResult = result
        improved = true
        break
      }
    }
  }

  return best
}

interface LunchPlacement {
  index: number // insert lunch after this many visits (0 = before first visit)
  start: number
  end: number
  /** The day's visits with lunch in place -- visits after the lunch may have shifted later to make room. */
  visits: ScheduledVisit[]
}

/**
 * Finds where lunch goes. Prefers an existing gap in the day (no visit moves);
 * failing that, inserts lunch and pushes the following visits later, as long as
 * every one of them still fits its own window and blocked times.
 */
function findLunchPlacement(
  visits: ScheduledVisit[],
  lunch: LunchPreference,
  start: { geo: NamedLocation['geo'] },
  dayStartMinutes: number,
  leg: LegFn,
  weekday: Weekday,
  resume?: Resume,
): LunchPlacement | null {
  if (!lunch.enabled) return null
  const earliest = toMinutes(lunch.earliest)
  const latest = toMinutes(lunch.latest)
  const midpoint = (earliest + latest) / 2

  const boundary = (idx: number) => (idx === 0 ? dayStartMinutes : visits[idx - 1].depart)
  // Lunch among visits still to come can't be scheduled in the past.
  const notBefore = (idx: number) => (resume && idx >= resume.afterCount ? resume.atMinutes : -Infinity)

  let best: LunchPlacement | null = null
  let bestDistance = Infinity

  for (let idx = 0; idx <= visits.length; idx++) {
    const lunchStart = Math.max(boundary(idx), earliest, notBefore(idx))
    const lunchEnd = lunchStart + lunch.duration
    if (lunchStart > latest) continue
    // Lunch happens where the previous stop left off, so the drive to the next visit has to come after it.
    const mustLeaveBy = idx < visits.length ? visits[idx].arrive - visits[idx].driveMinutes : Infinity
    if (lunchEnd > mustLeaveBy) continue
    const distance = Math.abs(lunchStart - midpoint)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { index: idx, start: lunchStart, end: lunchEnd, visits }
    }
  }
  if (best) return best

  // No natural gap: try making one by shifting the rest of the day later.
  let bestFinish = Infinity
  for (let idx = resume?.afterCount ?? 0; idx < visits.length; idx++) {
    const lunchStart = Math.max(boundary(idx), earliest, notBefore(idx))
    if (lunchStart > latest) continue
    const lunchEnd = lunchStart + lunch.duration
    const fromGeo = idx === 0 ? start.geo : (visits[idx - 1].patient.geo ?? start.geo)
    const rest = simulateOrder(
      visits.slice(idx).map((v) => v.patient),
      { geo: fromGeo },
      lunchEnd,
      leg,
      weekday,
    )
    if (!rest.feasible) continue
    const distance = Math.abs(lunchStart - midpoint)
    if (rest.finishMinutes < bestFinish - 0.01 || (Math.abs(rest.finishMinutes - bestFinish) <= 0.01 && distance < bestDistance)) {
      bestFinish = rest.finishMinutes
      bestDistance = distance
      best = { index: idx, start: lunchStart, end: lunchEnd, visits: [...visits.slice(0, idx), ...rest.visits] }
    }
  }

  return best
}

function buildStopId(prefix: string, key: string): string {
  return `${prefix}-${key}`
}

export function buildRoute(input: RoutingInput): BuiltRoute {
  const { date, dayStartTime, startLocation, endLocation, patients, lunch, weatherImpact = 0, weatherLabel, makeupPatientIds } = input
  const leg = legFunction(input.avgSpeedMph, speedMultiplierFor(weatherImpact), input.roadLeg)
  const weekday = weekdayOf(date)
  const dayStartMinutes = toMinutes(dayStartTime)
  const conflicts: RouteConflict[] = []
  const weatherNote = weatherLabel ? weatherAdvisory(weatherImpact, weatherLabel) : null
  const makeupSet = new Set(makeupPatientIds ?? [])

  if (!startLocation.geo) {
    conflicts.push({ message: `Starting location "${startLocation.label}" couldn't be located. Set a valid start address on the Home tab.` })
  }

  const eligible: Patient[] = []
  for (const patient of patients) {
    if (patient.status !== 'active') continue
    if (!patient.availableDays.includes(weekday) && !makeupSet.has(patient.id)) {
      conflicts.push({ patientId: patient.id, message: `${patient.initials} isn't available on ${weekday}.` })
      continue
    }
    if (!patient.geo) {
      conflicts.push({ patientId: patient.id, message: `${patient.initials}'s address couldn't be located. Check the address.` })
      continue
    }
    eligible.push(patient)
  }

  // Visits that already happened today keep their order; everything else is planned from where they leave off.
  const eligibleById = new Map(eligible.map((p) => [p.id, p]))
  const locked = (input.lockedPatientIds ?? []).map((id) => eligibleById.get(id)).filter((p): p is Patient => Boolean(p))
  const lockedIds = new Set(locked.map((p) => p.id))
  const resume: Resume | undefined =
    input.resumeAtMinutes !== undefined ? { afterCount: locked.length, atMinutes: input.resumeAtMinutes } : undefined
  const ctx: DayContext = { start: startLocation, endGeo: endLocation.geo, dayStartMinutes, leg, weekday, resume, settledCount: locked.length }
  const { order: optimizedOrder, unscheduled } = insertionConstruct(
    eligible.filter((p) => !lockedIds.has(p.id)),
    locked,
    ctx,
  )
  for (const patient of unscheduled) {
    const hasConflictsToday = patient.conflicts.some((c) => c.day === weekday)
    conflicts.push({
      patientId: patient.id,
      message: hasConflictsToday
        ? `${patient.initials} can only be seen ${patient.windowStart}–${patient.windowEnd} on ${weekday}, minus their blocked times. The current route can't fit them in.`
        : `${patient.initials} can only be seen ${patient.windowStart}–${patient.windowEnd}. The current route can't fit them in. Try adjusting the day's start time or another patient's window.`,
    })
  }

  const simulated = simulateOrder(optimizedOrder, startLocation, dayStartMinutes, leg, weekday, resume).visits

  const lunchPlacement = findLunchPlacement(simulated, lunch, startLocation, dayStartMinutes, leg, weekday, resume)
  const visits = lunchPlacement?.visits ?? simulated
  if (lunch.enabled && !lunchPlacement) {
    conflicts.push({ message: `Couldn't fit a ${lunch.duration}-min lunch between ${lunch.earliest}–${lunch.latest} without breaking a patient window. Add it manually or widen the lunch window.` })
  }

  // Assemble final stop list: start -> [open?, visit, open?, lunch?]* -> end
  const stops: Stop[] = []
  let cursorTime = dayStartMinutes
  let cursorGeo = startLocation.geo

  stops.push({
    id: buildStopId('start', date),
    kind: 'start',
    label: startLocation.label || 'Start',
    address: startLocation.address,
    arrive: fromMinutes(dayStartMinutes),
    depart: fromMinutes(dayStartMinutes),
    driveMinutesFromPrev: 0,
    driveMilesFromPrev: 0,
    geo: startLocation.geo,
  })

  const pushOpenBlockIfNeeded = (untilMinutes: number) => {
    if (untilMinutes - cursorTime >= OPEN_BLOCK_THRESHOLD_MINUTES) {
      stops.push({
        id: buildStopId('open', String(cursorTime)),
        kind: 'open',
        label: 'Open / Admin',
        arrive: fromMinutes(cursorTime),
        depart: fromMinutes(untilMinutes),
        driveMinutesFromPrev: 0,
        driveMilesFromPrev: 0,
        geo: cursorGeo,
      })
    }
    cursorTime = Math.max(cursorTime, untilMinutes)
  }

  visits.forEach((visit, idx) => {
    if (lunchPlacement && lunchPlacement.index === idx) {
      pushOpenBlockIfNeeded(lunchPlacement.start)
      stops.push({
        id: buildStopId('lunch', String(lunchPlacement.start)),
        kind: 'lunch',
        label: 'Lunch',
        arrive: fromMinutes(lunchPlacement.start),
        depart: fromMinutes(lunchPlacement.end),
        driveMinutesFromPrev: 0,
        driveMilesFromPrev: 0,
        geo: cursorGeo,
      })
      cursorTime = lunchPlacement.end
    }

    const requiredDepart = visit.arrive - visit.driveMinutes
    pushOpenBlockIfNeeded(Math.max(cursorTime, requiredDepart))

    stops.push({
      id: buildStopId('visit', visit.patient.id),
      kind: 'visit',
      patientId: visit.patient.id,
      label: visit.patient.initials,
      address: visit.patient.address,
      arrive: fromMinutes(visit.arrive),
      depart: fromMinutes(visit.depart),
      driveMinutesFromPrev: Math.round(visit.driveMinutes),
      driveMilesFromPrev: Math.round(visit.driveMiles * 10) / 10,
      driveSource: visit.driveSource,
      geo: visit.patient.geo,
    })
    cursorTime = visit.depart
    cursorGeo = visit.patient.geo ?? cursorGeo
  })

  if (lunchPlacement && lunchPlacement.index === visits.length) {
    pushOpenBlockIfNeeded(lunchPlacement.start)
    stops.push({
      id: buildStopId('lunch', String(lunchPlacement.start)),
      kind: 'lunch',
      label: 'Lunch',
      arrive: fromMinutes(lunchPlacement.start),
      depart: fromMinutes(lunchPlacement.end),
      driveMinutesFromPrev: 0,
      driveMilesFromPrev: 0,
      geo: cursorGeo,
    })
    cursorTime = lunchPlacement.end
  }

  // Final leg home/end
  const endDrive = cursorGeo && endLocation.geo ? leg(cursorGeo, endLocation.geo, cursorTime) : NO_DRIVE
  const endDriveMinutes = endDrive.minutes
  const endDriveMiles = endDrive.miles
  const endArrive = cursorTime + endDriveMinutes
  stops.push({
    id: buildStopId('end', date),
    kind: 'end',
    label: endLocation.label || 'End',
    address: endLocation.address,
    arrive: fromMinutes(endArrive),
    depart: fromMinutes(endArrive),
    driveMinutesFromPrev: Math.round(endDriveMinutes),
    driveMilesFromPrev: Math.round(endDriveMiles * 10) / 10,
    driveSource: endDrive.source,
    geo: endLocation.geo,
  })

  const totalTherapyMinutes = visits.reduce((sum, v) => sum + v.patient.visitDuration, 0)
  const totalDriveMinutes = stops.reduce((sum, s) => sum + s.driveMinutesFromPrev, 0)
  const totalMiles = Math.round(stops.reduce((sum, s) => sum + s.driveMilesFromPrev, 0) * 10) / 10
  const openMinutes = stops.filter((s) => s.kind === 'open').reduce((sum, s) => sum + (toMinutes(s.depart) - toMinutes(s.arrive)), 0)
  // Only legs that actually go somewhere count: a visit at the same address as the last one has no drive to estimate.
  const drivenStops = stops.filter((s, i) => i > 0 && s.driveSource && s.driveMilesFromPrev + s.driveMinutesFromPrev > 0)
  const estimatedLegCount = drivenStops.filter((s) => s.driveSource === 'estimate').length
  const totalSpan = endArrive - dayStartMinutes
  const efficiency = totalSpan > 0 ? Math.max(0, Math.min(100, Math.round(((totalTherapyMinutes + totalDriveMinutes) / totalSpan) * 100))) : 0


  return {
    builtAt: Date.now(),
    stops,
    totalTherapyMinutes,
    totalDriveMinutes: Math.round(totalDriveMinutes),
    totalMiles,
    openMinutes: Math.round(openMinutes),
    visitCount: visits.length,
    efficiency,
    conflicts,
    weatherNote,
    estimatedLegCount,
    legCount: drivenStops.length,
  }
}

/**
 * The legs a built route actually drives, with the time each one leaves -- so real
 * traffic can be fetched for the hour that matters. Open/admin blocks don't move you.
 */
export function drivenLegs(route: BuiltRoute): Array<{ from: GeoPoint; to: GeoPoint; departMinutes: number }> {
  const legs: Array<{ from: GeoPoint; to: GeoPoint; departMinutes: number }> = []
  let prev: Stop | null = null
  for (const stop of route.stops) {
    if (stop.kind === 'open') continue
    if (prev?.geo && stop.geo && (stop.kind === 'visit' || stop.kind === 'end')) {
      legs.push({ from: prev.geo, to: stop.geo, departMinutes: toMinutes(prev.depart) })
    }
    if (stop.geo) prev = stop
  }
  return legs
}
