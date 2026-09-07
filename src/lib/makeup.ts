import type { GeoPoint, Patient, PatientPriority, Weekday } from '../types'
import { estimateLeg } from './distance'
import { toMinutes } from './time'

export interface MakeupCandidate {
  patient: Patient
  /** Extra one-way drive minutes this candidate adds if slotted between the route's existing neighbors here. Null when geography is unknown. */
  extraDriveMinutes: number | null
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
}

const PRIORITY_RANK: Record<PatientPriority, number> = { high: 0, medium: 1, low: 2 }

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Would this slot fit inside the patient's own window without landing on one of their blocked times? */
function fitsWindow(patient: Patient, weekday: Weekday, slotStart: number, slotEnd: number): boolean {
  const windowStart = toMinutes(patient.windowStart)
  const windowEnd = toMinutes(patient.windowEnd)
  if (slotStart < windowStart || slotEnd > windowEnd) return false
  return !patient.conflicts.some((c) => c.day === weekday && overlaps(slotStart, slotEnd, toMinutes(c.startTime), toMinutes(c.endTime)))
}

/** Extra one-way driving this candidate would add versus the route just going straight from prev to next. */
function routeImpactMinutes(candidateGeo: GeoPoint | null, prevGeo: GeoPoint | null, nextGeo: GeoPoint | null, avgSpeedMph: number): number | null {
  if (!candidateGeo) return null
  const inLeg = prevGeo ? estimateLeg(prevGeo, candidateGeo, avgSpeedMph).minutes : 0
  const outLeg = nextGeo ? estimateLeg(candidateGeo, nextGeo, avgSpeedMph).minutes : 0
  const baseline = prevGeo && nextGeo ? estimateLeg(prevGeo, nextGeo, avgSpeedMph).minutes : 0
  return Math.max(0, inLeg + outLeg - baseline)
}

/**
 * Finds and ranks patients who could reasonably fill a just-opened slot.
 *
 * Eligibility (all required): active status, marked available for make-up visits, not
 * already on today's route, and the slot fits inside their own window without hitting a
 * blocked time -- the same hard constraints the router already enforces for regular visits.
 * Availability on the cancelled day's *regular* schedule is deliberately not required: a
 * make-up visit is, by definition, outside someone's normal routine.
 *
 * Ranking: scheduling priority (High before Medium before Low) first, then the least
 * added drive time within the same priority tier.
 */
export function findMakeupCandidates(input: FindMakeupCandidatesInput): MakeupCandidate[] {
  const { cancelledPatientId, weekday, slotStart, slotEnd, allPatients, scheduledPatientIdsToday, prevStopGeo, nextStopGeo, avgSpeedMph } = input
  const start = toMinutes(slotStart)
  const end = toMinutes(slotEnd)
  const scheduledSet = new Set(scheduledPatientIdsToday)

  const candidates: MakeupCandidate[] = allPatients
    .filter((p) => p.id !== cancelledPatientId)
    .filter((p) => p.status === 'active')
    .filter((p) => p.makeupAvailable)
    .filter((p) => !scheduledSet.has(p.id))
    .filter((p) => fitsWindow(p, weekday, start, end))
    .map((patient) => ({ patient, extraDriveMinutes: routeImpactMinutes(patient.geo, prevStopGeo, nextStopGeo, avgSpeedMph) }))

  candidates.sort((a, b) => {
    const rankDiff = PRIORITY_RANK[a.patient.priority] - PRIORITY_RANK[b.patient.priority]
    if (rankDiff !== 0) return rankDiff
    return (a.extraDriveMinutes ?? Infinity) - (b.extraDriveMinutes ?? Infinity)
  })

  return candidates
}
