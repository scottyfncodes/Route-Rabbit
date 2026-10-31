import type { BuiltRoute, Patient } from '../types'
import { dayMatrixRequests, fetchRoadLegs, roadLegLookup, type FetchOutcome, type LegRequest } from './driveTimes'
import { buildRoute, drivenLegs, type RoutingInput } from './routing'
import { toMinutes } from './time'

export interface PlanDeps {
  fetchLegs: (date: string, requests: LegRequest[]) => Promise<FetchOutcome>
}

const defaultDeps: PlanDeps = { fetchLegs: (date, requests) => fetchRoadLegs(date, requests) }

/**
 * Builds a day's route with real road drive times where we can get them.
 *
 * 1. One matrix of every leg the day could drive, priced at the day's start time, so the
 *    optimizer compares real times instead of straight lines.
 * 2. Build the route, then fetch the legs it actually drives at the hour each one leaves
 *    (a 3 PM leg gets 3 PM traffic) and rebuild once with those.
 *
 * Both steps hit the device cache first, so rebuilding the same day costs no API calls.
 * Anything still missing (offline, no key, outage) is estimated and flagged on the route.
 */
export async function planRoute(input: RoutingInput, deps: PlanDeps = defaultDeps): Promise<BuiltRoute> {
  const located = input.patients.filter((p): p is Patient & { geo: NonNullable<Patient['geo']> } => p.status === 'active' && Boolean(p.geo))
  const startMinutes = Math.max(toMinutes(input.dayStartTime), input.resumeAtMinutes ?? 0)

  if (located.length > 0) {
    await deps.fetchLegs(
      input.date,
      dayMatrixRequests(input.startLocation.geo, located.map((p) => p.geo), input.endLocation.geo, startMinutes),
    )
  }

  const first = buildRoute({ ...input, roadLeg: roadLegLookup(input.date) })
  const legs = drivenLegs(first)
  if (legs.length === 0) return first

  const outcome = await deps.fetchLegs(input.date, legs)
  // Nothing new came back, so a rebuild would produce the same route.
  if (outcome !== 'ok') return first
  return buildRoute({ ...input, roadLeg: roadLegLookup(input.date) })
}
