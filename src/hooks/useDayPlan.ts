import { useCallback, useEffect, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'
import { assignWeekDays } from '../lib/balanceWeek'
import { isVisitWeek, visitOptionsOf, withOption } from '../lib/visitOptions'
import { planRoute } from '../lib/planRoute'
import { addDays, weekdayOf } from '../lib/time'
import { TWICE_A_MONTH, type AppSettings, type BuiltRoute, type DayPlan, type DayWeather, type Patient } from '../types'

const KEY = 'dayPlans'
type DayPlanMap = Record<string, DayPlan>

function defaultPlan(date: string, settings: AppSettings): DayPlan {
  const start = { label: 'Start', address: settings.homeAddress, geo: settings.homeGeo }
  const end = settings.endAddress.trim()
    ? { label: 'End', address: settings.endAddress, geo: settings.endGeo }
    : { ...start, label: 'End' }
  return {
    date,
    dayStartTime: '08:00',
    startLocation: start,
    endLocation: end,
    patientIds: [],
    cancelledPatientIds: [],
    makeupPatientIds: [],
    lunch: { enabled: true, earliest: '11:30', latest: '13:30', duration: 30 },
    currentLocationOverride: null,
    activeStopId: null,
    result: null,
  }
}

/** Fills in fields added after a plan may have already been saved to storage (e.g. an older day plan with no makeupPatientIds yet). */
function withPlanDefaults(date: string, settings: AppSettings, stored?: Partial<DayPlan>): DayPlan {
  return { ...defaultPlan(date, settings), ...stored }
}

function withoutKey(record: Record<string, number> | undefined, key: string): Record<string, number> | undefined {
  if (!record || !(key in record)) return record
  const { [key]: _removed, ...rest } = record
  return rest
}

export function useDayPlan(date: string, settings: AppSettings) {
  const [plans, setPlans] = useState<DayPlanMap>(() => readStorage<DayPlanMap>(KEY, {}))

  useEffect(() => {
    writeStorage(KEY, plans)
  }, [plans])

  const plan = withPlanDefaults(date, settings, plans[date])

  const updatePlan = useCallback(
    (changes: Partial<DayPlan> | ((prev: DayPlan) => Partial<DayPlan>)) => {
      setPlans((prev) => {
        const current = withPlanDefaults(date, settings, prev[date])
        const delta = typeof changes === 'function' ? changes(current) : changes
        return { ...prev, [date]: { ...current, ...delta } }
      })
    },
    [date, settings],
  )

  const togglePatientInDay = useCallback(
    (patientId: string) => {
      updatePlan((prev) => {
        const has = prev.patientIds.includes(patientId)
        return {
          patientIds: has ? prev.patientIds.filter((id) => id !== patientId) : [...prev.patientIds, patientId],
          cancelledPatientIds: prev.cancelledPatientIds.filter((id) => id !== patientId),
          makeupPatientIds: prev.makeupPatientIds.filter((id) => id !== patientId),
          visitDurations: withoutKey(prev.visitDurations, patientId),
        }
      })
    },
    [updatePlan],
  )

  const cancelPatientToday = useCallback(
    (patientId: string) => {
      updatePlan((prev) => ({
        cancelledPatientIds: prev.cancelledPatientIds.includes(patientId)
          ? prev.cancelledPatientIds
          : [...prev.cancelledPatientIds, patientId],
      }))
    },
    [updatePlan],
  )

  const restorePatientToday = useCallback(
    (patientId: string) => {
      updatePlan((prev) => ({
        cancelledPatientIds: prev.cancelledPatientIds.filter((id) => id !== patientId),
      }))
    },
    [updatePlan],
  )

  return { plan, updatePlan, togglePatientInDay, cancelPatientToday, restorePatientToday }
}

/** Visit counts per date, for the weekly view -- reads the raw stored map directly. */
export function readWeekPlans(): DayPlanMap {
  return readStorage<DayPlanMap>(KEY, {})
}

export interface WeekBuildSummary {
  daysBuilt: number
  totalVisits: number
  daysWithConflicts: number
  /** Driving legs across the week that fell back to the estimate. */
  estimatedLegs: number
  /** Patients scheduled with one of their other visit options because their first choice didn't fit. */
  alternatesUsed: number
}

/** How many times Build My Week re-plans to try patients' other visit options. */
const MAX_OPTION_PASSES = 3

/**
 * Builds an optimized route for every day of the given week in one pass, using
 * each active patient's own available days as their recurring weekly schedule.
 * Keeps each day's existing start/end location, day-start time, and lunch
 * preferences (falling back to defaults for days with no saved plan yet), but
 * replaces that day's patient selection and result outright.
 *
 * Patients with more than one visit option (e.g. 60 min once a week, or 30 min
 * twice a week) start on their first choice. Anyone the router couldn't fit on
 * one of their days moves to their next option and the week is re-planned.
 */
export async function buildWeekRoutes(
  weekStart: string,
  patients: Patient[],
  settings: AppSettings,
  dailyWeather?: Record<string, DayWeather>,
): Promise<WeekBuildSummary> {
  const map = readStorage<DayPlanMap>(KEY, {})
  const active = patients.filter((p) => p.status === 'active')
  const optionIndex = new Map(active.map((p) => [p.id, 0]))
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const results = new Map<string, { key: string; patients: Patient[]; result: BuiltRoute }>()

  for (let pass = 0; pass <= MAX_OPTION_PASSES; pass++) {
    // Pin everyone's visit days for the whole week up front, balanced across the
    // caseload so no day ends up packed while another sits nearly empty.
    const withOptions = active.map((p) => withOption(p, visitOptionsOf(p)[optionIndex.get(p.id) ?? 0]))
    const weekDays = assignWeekDays(withOptions)
    const scheduled = withOptions.map((patient) => {
      const offWeek = patient.visitsPerWeek === TWICE_A_MONTH && !isVisitWeek(patient, weekStart)
      return { patient, days: offWeek ? [] : (weekDays.get(patient.id) ?? []) }
    })

    for (const date of dates) {
      const weekday = weekdayOf(date)
      const existing = map[date] ?? defaultPlan(date, settings)
      const dayPatients = scheduled.filter((s) => s.days.includes(weekday)).map((s) => s.patient)
      const key = dayPatients.map((p) => `${p.id}:${p.visitDuration}`).join('|')
      // Nothing changed for this day since the last pass, so its route would come out the same.
      if (results.get(date)?.key === key) continue
      const weather = dailyWeather?.[date]

      // One day at a time: each day's drive times come from its own date, and most legs repeat (and hit the cache) day to day.
      const result = await planRoute({
        date,
        dayStartTime: existing.dayStartTime,
        startLocation: existing.startLocation,
        endLocation: existing.endLocation,
        patients: dayPatients,
        lunch: existing.lunch,
        avgSpeedMph: settings.avgSpeedMph,
        weatherImpact: weather?.impact,
        weatherLabel: weather?.label,
      })
      results.set(date, { key, patients: dayPatients, result })
    }

    // Who didn't make it onto a day they were planned for, and has another option to try?
    let advanced = false
    for (const { patients: dayPatients, result } of results.values()) {
      const visited = new Set(result.stops.filter((s) => s.kind === 'visit').map((s) => s.patientId))
      for (const p of dayPatients) {
        if (visited.has(p.id) || !p.geo) continue
        const original = active.find((a) => a.id === p.id)
        const idx = optionIndex.get(p.id) ?? 0
        if (original && idx + 1 < visitOptionsOf(original).length) {
          optionIndex.set(p.id, idx + 1)
          advanced = true
        }
      }
    }
    if (!advanced) break
  }

  let totalVisits = 0
  let daysWithConflicts = 0
  let estimatedLegs = 0
  for (const date of dates) {
    const built = results.get(date)
    if (!built) continue
    const existing = map[date] ?? defaultPlan(date, settings)
    map[date] = {
      ...existing,
      patientIds: built.patients.map((p) => p.id),
      cancelledPatientIds: [],
      makeupPatientIds: [],
      activeStopId: null,
      currentLocationOverride: null,
      visitDurations: Object.fromEntries(built.patients.map((p) => [p.id, p.visitDuration])),
      result: built.result,
    }
    totalVisits += built.result.visitCount
    if (built.result.conflicts.length > 0) daysWithConflicts += 1
    estimatedLegs += built.result.estimatedLegCount ?? 0
  }

  writeStorage(KEY, map)
  const alternatesUsed = [...optionIndex.values()].filter((i) => i > 0).length
  return { daysBuilt: dates.length, totalVisits, daysWithConflicts, estimatedLegs, alternatesUsed }
}
