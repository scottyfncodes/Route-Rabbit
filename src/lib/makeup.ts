import type { GeoPoint, Patient, PatientPriority, Weekday } from '../types'
import type { RoadLeg } from './driveTimes'
import { legFunction, type LegFn } from './routing'
import { toMinutes } from './time'

export interface MakeupCandidate {
  patient: Patient
  /** Extra one-way drive minutes this candidate adds if slotted between the route's existing neighbors here. Null when geography is unknown. */
  extraDriveMinutes: number | null
  /** True when any leg behind that number is the offline estimate rather than a real road time. */
  driveEstimated: boolean
}

export interface FindMakeupCandidatesInput {
  /** The patient whose visit was just cancelled -- never a candidate for their own opening. */
  cancelledPatientId: string
  weekday: Weekday
  slotStart: string // "HH:MM"
  slotEnd: string // "HH:MM"
  allPatients: Patient[]
  /** Patients already on today's route (after removing the cancelled one) -- can't double-book them. */
  scheduledPatientIdsToday: string[]
  /** The route's stop immediately before the opening, if any. */
  prevStopGeo: GeoPoint | null
  /** The route's stop immediately after the opening, if any. */
  nextStopGeo: GeoPoint | null
  avgSpeedMph: number
  /** Real road legs where cached; anything missing falls back to the estimate. */
  roadLeg?: (from: GeoPoint, to: GeoPoint, departMinutes: number) => RoadLeg | null
}

const PRIORITY_RANK: Record<PatientPriority, number> = { high: 0, medium: 1, low: 2 }

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * Would this patient's own visit fit in the opened slot -- no longer than the slot, and
 * inside their window without landing on one of their blocked times?
 */
function fitsSlot(patient: Patient, weekday: Weekday, slotStart: number, slotEnd: number): boolean {
  const visitEnd = slotStart + patient.visitDuration
  if (visitEnd > slotEnd) return false
  const windowStart = toMinutes(patient.windowStart)
  const windowEnd = toMinutes(patient.windowEnd)
  if (slotStart < windowStart || visitEnd > windowEnd) return false
  return !patient.conflicts.some((c) => c.day === weekday && overlaps(slotStart, visitEnd, toMinutes(c.startTime), toMinutes(c.endTime)))
}

/** Extra one-way driving this candidate would add versus the route just going straight from prev to next. */
function routeImpact(
  candidate: Patient,
  prevGeo: GeoPoint | null,
  nextGeo: GeoPoint | null,
  slotStart: number,
  leg: LegFn,
): { extraDriveMinutes: number | null; driveEstimated: boolean } {
  const candidateGeo = candidate.geo
  if (!candidateGeo) return { extraDriveMinutes: null, driveEstimated: false }
  const legs = [
    prevGeo ? { l: leg(prevGeo, candidateGeo, slotStart), sign: 1 } : null,
    nextGeo ? { l: leg(candidateGeo, nextGeo, slotStart + candidate.visitDuration), sign: 1 } : null,
    prevGeo && nextGeo ? { l: leg(prevGeo, nextGeo, slotStart), sign: -1 } : null,
  ].filter((x): x is { l: ReturnType<LegFn>; sign: number } => x !== null)
  const extra = legs.reduce((sum, { l, sign }) => sum + sign * l.minutes, 0)
  return { extraDriveMinutes: Math.max(0, extra), driveEstimated: legs.some(({ l }) => l.source === 'estimate') }
}

/**
 * Finds and ranks patients who could reasonably fill a just-opened slot.
 *
 * Eligibility (all required): active status, marked available for make-up visits, a
 * located address, not already on today's route, and the slot fits inside their own window without hitting a
 * blocked time (using their own visit length, which can't run past the
 * opening) -- the same hard constraints the router already enforces for regular visits.
 * Availability on the cancelled day's *regular* schedule is deliberately not required: a
 * make-up visit is, by definition, outside someone's normal routine.
 *
 * Ranking: scheduling priority (High before Medium before Low) first, then the least
 * added drive time within the same priority tier.
 */
export function findMakeupCandidates(input: FindMakeupCandidatesInput): MakeupCandidate[] {
  const { cancelledPatientId, weekday, slotStart, slotEnd, allPatients, scheduledPatientIdsToday, prevStopGeo, nextStopGeo, avgSpeedMph } = input
  const leg = legFunction(avgSpeedMph, 1, input.roadLeg)
  const start = toMinutes(slotStart)
  const end = toMinutes(slotEnd)
  const scheduledSet = new Set(scheduledPatientIdsToday)

  const candidates: MakeupCandidate[] = allPatients
    .filter((p) => p.id !== cancelledPatientId)
    .filter((p) => p.status === 'active')
    .filter((p) => p.makeupAvailable)
    .filter((p) => !scheduledSet.has(p.id))
    .filter((p) => p.geo !== null) // the router can't place an address it couldn't locate
    .filter((p) => fitsSlot(p, weekday, start, end))
    .map((patient) => ({ patient, ...routeImpact(patient, prevStopGeo, nextStopGeo, start, leg) }))

  candidates.sort((a, b) => {
    const rankDiff = PRIORITY_RANK[a.patient.priority] - PRIORITY_RANK[b.patient.priority]
    if (rankDiff !== 0) return rankDiff
    // Unknown drive impact sorts last within its tier (and never yields NaN from Infinity - Infinity).
    if (a.extraDriveMinutes === null || b.extraDriveMinutes === null) {
      return Number(a.extraDriveMinutes === null) - Number(b.extraDriveMinutes === null)
    }
    return a.extraDriveMinutes - b.extraDriveMinutes
  })

  return candidates
}
