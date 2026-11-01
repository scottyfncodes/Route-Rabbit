import { TWICE_A_MONTH, WEEKDAYS, type Patient, type Weekday } from '../types'

/** Rough drive and setup time each visit adds to a day on top of the visit itself. */
const PER_VISIT_OVERHEAD = 20

/** How much busier another day has to be before two visits for the same patient land on back-to-back days. */
const BACK_TO_BACK_PENALTY_VISITS = 1.5

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

/**
 * Picks which of their available days each patient is seen, across the whole caseload at
 * once, so the week's visits spread out instead of everyone landing on the same days.
 *
 * Patients with the fewest choices go first (someone only free Tuesdays has to be on
 * Tuesday), then everyone else fills in around them: each patient takes the days that are
 * lightest so far, with their visits kept off back-to-back days where possible. Patients
 * are expected to already carry the visit option being scheduled (visitDuration,
 * visitsPerWeek). Same caseload in, same days out, so the weekly routine holds steady.
 *
 * Twice-a-month patients count at half weight and get one day; the caller drops them in
 * their off weeks, which keeps everyone else's days the same from week to week.
 */
export function assignWeekDays(patients: Patient[]): Map<string, Weekday[]> {
  const load = new Map<Weekday, number>(WEEKDAYS.map((d) => [d, 0]))
  const assigned = new Map<string, Weekday[]>()

  const plans = patients.map((p) => {
    const available = WEEKDAYS.filter((d) => p.availableDays.includes(d))
    const need = p.visitsPerWeek === null ? available.length : Math.min(available.length, Math.max(0, Math.ceil(p.visitsPerWeek)))
    const weight = (p.visitDuration + PER_VISIT_OVERHEAD) * (p.visitsPerWeek === TWICE_A_MONTH ? 0.5 : 1)
    return { p, available, need, weight }
  })

  plans.sort(
    (a, b) =>
      a.available.length - a.need - (b.available.length - b.need) ||
      b.weight - a.weight ||
      a.p.id.localeCompare(b.p.id),
  )

  for (const { p, available, need, weight } of plans) {
    let best: Weekday[] = []
    let bestCost = Infinity
    for (const days of combinations(available, need)) {
      // Growth in the sum of squared day loads: lowest when the visits go to the lightest days.
      const balance = days.reduce((sum, d) => sum + 2 * (load.get(d) ?? 0) * weight + weight * weight, 0)
      const spacing = backToBackPairs(days) * BACK_TO_BACK_PENALTY_VISITS * 2 * weight * weight
      const cost = balance + spacing
      if (cost < bestCost) {
        bestCost = cost
        best = days
      }
    }
    for (const d of best) load.set(d, (load.get(d) ?? 0) + weight)
    assigned.set(p.id, best)
  }

  return assigned
}
