import type { BuiltRoute, LunchPreference, NamedLocation, Patient, RouteConflict, Stop, WeatherImpact } from '../types'
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
}

const OPEN_BLOCK_THRESHOLD_MINUTES = 15

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
    const windowStart = toMinutes(patient.windowStart)
    const windowEnd = toMinutes(patient.windowEnd)
    const actualStart = Math.max(arrive, windowStart)
    const depart = actualStart + patient.visitDuration
    if (depart > windowEnd) feasible = false

    visits.push({ patient, arrive: actualStart, depart, driveMinutes, driveMiles })
    totalDriveMinutes += driveMinutes
    currentTime = depart
    currentGeo = patient.geo ?? currentGeo
  }

  return { visits, feasible, totalDriveMinutes, finishMinutes: currentTime }
}

/** Greedy nearest/most-urgent construction, respecting hard availability windows. */
function greedyConstruct(
  candidates: Patient[],
  start: { geo: NamedLocation['geo'] },
  dayStartMinutes: number,
  avgSpeedMph: number,
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
      const windowStart = toMinutes(patient.windowStart)
      const windowEnd = toMinutes(patient.windowEnd)
      const actualStart = Math.max(arrive, windowStart)
      const feasible = actualStart + patient.visitDuration <= windowEnd
      if (!feasible) return

      const waitMinutes = Math.max(0, windowStart - arrive)
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
    const actualStart = Math.max(arrive, toMinutes(chosen.windowStart))
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

/** Local-search improvement: try reversing sub-segments (2-opt) to tighten the day. */
function twoOptImprove(
  order: Patient[],
  start: { geo: NamedLocation['geo'] },
  dayStartMinutes: number,
  avgSpeedMph: number,
): Patient[] {
  let best = order
  let bestResult = simulateOrder(best, start, dayStartMinutes, avgSpeedMph)
  if (!bestResult.feasible) return best

  let improved = true
  let iterations = 0
  const MAX_ITERATIONS = 300

  while (improved && iterations < MAX_ITERATIONS) {
    improved = false
    for (let i = 0; i < best.length - 1 && !improved; i++) {
      for (let j = i + 1; j < best.length; j++) {
        iterations++
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
        const result = simulateOrder(candidate, start, dayStartMinutes, avgSpeedMph)
        if (result.feasible && scheduleScore(result) < scheduleScore(bestResult) - 0.01) {
          best = candidate
          bestResult = result
          improved = true
          break
        }
      }
    }
  }

  return best
}

interface LunchPlacement {
  index: number // insert lunch after this many visits (0 = before first visit)
  start: number
  end: number
}

function findLunchPlacement(
  visits: ScheduledVisit[],
  lunch: LunchPreference,
  dayStartMinutes: number,
): LunchPlacement | null {
  if (!lunch.enabled) return null
  const earliest = toMinutes(lunch.earliest)
  const latest = toMinutes(lunch.latest)

  const boundary = (idx: number) => (idx === 0 ? dayStartMinutes : visits[idx - 1].depart)

  let best: LunchPlacement | null = null
  let bestDistance = Infinity

  for (let idx = 0; idx <= visits.length; idx++) {
    const availableAt = boundary(idx)
    const nextArrive = idx < visits.length ? visits[idx].arrive : Infinity
    const lunchStart = Math.max(availableAt, earliest)
    const lunchEnd = lunchStart + lunch.duration
    if (lunchStart > latest) continue
    if (lunchEnd > nextArrive) continue // would eat into the next visit's own travel/window
    const distance = Math.abs(lunchStart - (earliest + latest) / 2)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { index: idx, start: lunchStart, end: lunchEnd }
    }
  }

  return best
}

function buildStopId(prefix: string, key: string): string {
  return `${prefix}-${key}`
}

export function buildRoute(input: RoutingInput): BuiltRoute {
  const { date, dayStartTime, startLocation, endLocation, patients, lunch, weatherImpact = 0, weatherLabel } = input
  const avgSpeedMph = input.avgSpeedMph * speedMultiplierFor(weatherImpact)
  const weekday = weekdayOf(date)
  const dayStartMinutes = toMinutes(dayStartTime)
  const conflicts: RouteConflict[] = []
  const weatherNote = weatherLabel ? weatherAdvisory(weatherImpact, weatherLabel) : null

  if (!startLocation.geo) {
    conflicts.push({ message: `Starting location "${startLocation.label}" couldn't be located. Set a valid start address on the Home tab.` })
  }

  const eligible: Patient[] = []
  for (const patient of patients) {
    if (patient.status !== 'active') continue
    if (!patient.availableDays.includes(weekday)) {
      conflicts.push({ patientId: patient.id, message: `${patient.initials} isn't available on ${weekday}.` })
      continue
    }
    if (!patient.geo) {
      conflicts.push({ patientId: patient.id, message: `${patient.initials}'s address couldn't be located. Check the address.` })
      continue
    }
    eligible.push(patient)
  }

  const { order: constructed, unscheduled } = greedyConstruct(eligible, startLocation, dayStartMinutes, avgSpeedMph)
  for (const patient of unscheduled) {
    conflicts.push({
      patientId: patient.id,
      message: `${patient.initials} can only be seen ${patient.windowStart}–${patient.windowEnd}. The current route can't fit them in — try adjusting the day's start time or another patient's window.`,
    })
  }

  const optimizedOrder = twoOptImprove(constructed, startLocation, dayStartMinutes, avgSpeedMph)
  const { visits } = simulateOrder(optimizedOrder, startLocation, dayStartMinutes, avgSpeedMph)

  const lunchPlacement = findLunchPlacement(visits, lunch, dayStartMinutes)
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
