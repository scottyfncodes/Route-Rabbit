import type { BuiltRoute, LunchPreference, NamedLocation, Patient, RouteConflict, Stop, Weekday, WeatherImpact } from '../types'
import { WEEKDAYS } from '../types'
import { estimateLeg } from './distance'
import { buildDirectionsUrl } from './googleMaps'
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
}

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

/**
 * Picks which of a patient's available days actually get a visit each week, for
 * patients seen less often than they're available (e.g. available Mon/Wed/Fri but
 * only needs 2x/week). Spreads the chosen days evenly across their available set so
 * the same specific weekdays are picked every week -- a predictable routine rather
 * than whatever happens to be most efficient that particular week.
 */
export function selectWeeklyDays(patient: Patient): Weekday[] {
  const available = WEEKDAYS.filter((d) => patient.availableDays.includes(d))
  const need = patient.visitsPerWeek
  if (!need || need >= available.length) return available
  if (need <= 0) return []

  const chosen = new Set<Weekday>()
  if (need === 1) {
    chosen.add(available[Math.floor((available.length - 1) / 2)])
  } else {
    for (let i = 0; i < need; i++) {
      const idx = Math.round((i * (available.length - 1)) / (need - 1))
      chosen.add(available[idx])
    }
  }
  // rounding can collide on small lists; backfill from the remaining available days if short
  for (const d of available) {
    if (chosen.size >= need) break
    chosen.add(d)
  }

  return WEEKDAYS.filter((d) => chosen.has(d))
}

interface ScheduledVisit {
  patient: Patient
  arrive: number
  depart: number
  driveMinutes: number
  driveMiles: number
}

/** Forward-simulate a fixed patient order from the start location; reports feasibility per stop. */
function simulateOrder(
  order: Patient[],
  start: { geo: NamedLocation['geo'] },
  dayStartMinutes: number,
  avgSpeedMph: number,
  weekday: Weekday,
): { visits: ScheduledVisit[]; feasible: boolean; totalDriveMinutes: number; finishMinutes: number } {
  let currentTime = dayStartMinutes
  let currentGeo = start.geo
  const visits: ScheduledVisit[] = []
  let feasible = true
  let totalDriveMinutes = 0

  for (const patient of order) {
    let driveMinutes = 0
    let driveMiles = 0
    if (currentGeo && patient.geo) {
      const leg = estimateLeg(currentGeo, patient.geo, avgSpeedMph)
      driveMinutes = leg.minutes
      driveMiles = leg.miles
    }
    const arrive = currentTime + driveMinutes
    const slot = findVisitSlot(patient, weekday, arrive)
    const actualStart = slot ?? arrive
    const depart = actualStart + patient.visitDuration
    if (slot === null) feasible = false

    visits.push({ patient, arrive: actualStart, depart, driveMinutes, driveMiles })
    totalDriveMinutes += driveMinutes
    currentTime = depart
    currentGeo = patient.geo ?? currentGeo
  }

  return { visits, feasible, totalDriveMinutes, finishMinutes: currentTime }
}

/** Greedy nearest/most-urgent construction, respecting hard availability windows and conflicts. */
function greedyConstruct(
  candidates: Patient[],
  start: { geo: NamedLocation['geo'] },
  dayStartMinutes: number,
  avgSpeedMph: number,
  weekday: Weekday,
): { order: Patient[]; unscheduled: Patient[] } {
  const remaining = [...candidates]
  const order: Patient[] = []
  let currentTime = dayStartMinutes
  let currentGeo = start.geo

  while (remaining.length > 0) {
    let bestIdx = -1
    let bestScore = Infinity

    remaining.forEach((patient, idx) => {
      const leg = currentGeo && patient.geo ? estimateLeg(currentGeo, patient.geo, avgSpeedMph) : { minutes: 0, miles: 0 }
      const arrive = currentTime + leg.minutes
      const actualStart = findVisitSlot(patient, weekday, arrive)
      if (actualStart === null) return

      const windowEnd = toMinutes(patient.windowEnd)
      const waitMinutes = actualStart - arrive
      const slackMinutes = windowEnd - actualStart
      // Prefer nearby + low-wait candidates, with a mild tie-break toward tighter deadlines.
      const score = leg.minutes + waitMinutes * 0.75 + slackMinutes * 0.05
      if (score < bestScore) {
        bestScore = score
        bestIdx = idx
      }
    })

    if (bestIdx === -1) break // nothing left is feasible from here; stop and report conflicts

    const [chosen] = remaining.splice(bestIdx, 1)
    const leg = currentGeo && chosen.geo ? estimateLeg(currentGeo, chosen.geo, avgSpeedMph) : { minutes: 0, miles: 0 }
    const arrive = currentTime + leg.minutes
    const actualStart = findVisitSlot(chosen, weekday, arrive) ?? arrive
    currentTime = actualStart + chosen.visitDuration
    currentGeo = chosen.geo ?? currentGeo
    order.push(chosen)
  }

  return { order, unscheduled: remaining }
}

/**
 * Ranks a simulated day: finishing sooner matters far more than shaving a few
 * minutes of driving, since a route that "wins" on drive time by leaving a
 * huge unproductive gap mid-day is a worse schedule in practice.
 */
function scheduleScore(result: { finishMinutes: number; totalDriveMinutes: number }): number {
  return result.finishMinutes + result.totalDriveMinutes * 0.1
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
function improveOrder(
  order: Patient[],
  start: { geo: NamedLocation['geo'] },
  dayStartMinutes: number,
  avgSpeedMph: number,
  weekday: Weekday,
  fixedCount = 0,
): Patient[] {
  let best = order
  let bestResult = simulateOrder(best, start, dayStartMinutes, avgSpeedMph, weekday)
  if (!bestResult.feasible) return best

  let evaluations = 0
  const MAX_EVALUATIONS = 20000
  let improved = true

  while (improved && evaluations < MAX_EVALUATIONS) {
    improved = false
    for (const candidate of neighborhood(best, fixedCount)) {
      if (++evaluations > MAX_EVALUATIONS) break
      const result = simulateOrder(candidate, start, dayStartMinutes, avgSpeedMph, weekday)
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
  avgSpeedMph: number,
  weekday: Weekday,
): LunchPlacement | null {
  if (!lunch.enabled) return null
  const earliest = toMinutes(lunch.earliest)
  const latest = toMinutes(lunch.latest)
  const midpoint = (earliest + latest) / 2

  const boundary = (idx: number) => (idx === 0 ? dayStartMinutes : visits[idx - 1].depart)

  let best: LunchPlacement | null = null
  let bestDistance = Infinity

  for (let idx = 0; idx <= visits.length; idx++) {
    const lunchStart = Math.max(boundary(idx), earliest)
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
  for (let idx = 0; idx < visits.length; idx++) {
    const lunchStart = Math.max(boundary(idx), earliest)
    if (lunchStart > latest) continue
    const lunchEnd = lunchStart + lunch.duration
    const fromGeo = idx === 0 ? start.geo : (visits[idx - 1].patient.geo ?? start.geo)
    const rest = simulateOrder(
      visits.slice(idx).map((v) => v.patient),
      { geo: fromGeo },
      lunchEnd,
      avgSpeedMph,
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
  const avgSpeedMph = input.avgSpeedMph * speedMultiplierFor(weatherImpact)
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
  const lockedRun = simulateOrder(locked, startLocation, dayStartMinutes, avgSpeedMph, weekday)
  const resumeGeo = locked.length > 0 ? (locked[locked.length - 1].geo ?? startLocation.geo) : startLocation.geo

  const { order: constructedRest, unscheduled } = greedyConstruct(
    eligible.filter((p) => !lockedIds.has(p.id)),
    { geo: resumeGeo },
    lockedRun.finishMinutes,
    avgSpeedMph,
    weekday,
  )
  const constructed = [...locked, ...constructedRest]
  for (const patient of unscheduled) {
    const hasConflictsToday = patient.conflicts.some((c) => c.day === weekday)
    conflicts.push({
      patientId: patient.id,
      message: hasConflictsToday
        ? `${patient.initials} can only be seen ${patient.windowStart}–${patient.windowEnd} on ${weekday}, minus their blocked times. The current route can't fit them in.`
        : `${patient.initials} can only be seen ${patient.windowStart}–${patient.windowEnd}. The current route can't fit them in — try adjusting the day's start time or another patient's window.`,
    })
  }

  const optimizedOrder = improveOrder(constructed, startLocation, dayStartMinutes, avgSpeedMph, weekday, locked.length)
  const simulated = simulateOrder(optimizedOrder, startLocation, dayStartMinutes, avgSpeedMph, weekday).visits

  const lunchPlacement = findLunchPlacement(simulated, lunch, startLocation, dayStartMinutes, avgSpeedMph, weekday)
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
  let endDriveMinutes = 0
  let endDriveMiles = 0
  if (cursorGeo && endLocation.geo) {
    const leg = estimateLeg(cursorGeo, endLocation.geo, avgSpeedMph)
    endDriveMinutes = leg.minutes
    endDriveMiles = leg.miles
  }
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
    geo: endLocation.geo,
  })

  const totalTherapyMinutes = visits.reduce((sum, v) => sum + v.patient.visitDuration, 0)
  const totalDriveMinutes = stops.reduce((sum, s) => sum + s.driveMinutesFromPrev, 0)
  const totalMiles = Math.round(stops.reduce((sum, s) => sum + s.driveMilesFromPrev, 0) * 10) / 10
  const openMinutes = stops.filter((s) => s.kind === 'open').reduce((sum, s) => sum + (toMinutes(s.depart) - toMinutes(s.arrive)), 0)
  const totalSpan = endArrive - dayStartMinutes
  const efficiency = totalSpan > 0 ? Math.max(0, Math.min(100, Math.round(((totalTherapyMinutes + totalDriveMinutes) / totalSpan) * 100))) : 0

  const googleMapsUrl =
    visits.length > 0
      ? buildDirectionsUrl(
          startLocation,
          visits.map((v) => ({ address: v.patient.address, geo: v.patient.geo })),
          endLocation,
        )
      : null

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
    googleMapsUrl,
    weatherNote,
  }
}
