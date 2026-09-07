import { useCallback, useEffect, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'
import { buildRoute, selectWeeklyDays } from '../lib/routing'
import { addDays, weekdayOf } from '../lib/time'
import type { AppSettings, DayPlan, DayWeather, Patient } from '../types'

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
}

/**
 * Builds an optimized route for every day of the given week in one pass, using
 * each active patient's own available days as their recurring weekly schedule.
 * Keeps each day's existing start/end location, day-start time, and lunch
 * preferences (falling back to defaults for days with no saved plan yet), but
 * replaces that day's patient selection and result outright.
 */
export function buildWeekRoutes(
  weekStart: string,
  patients: Patient[],
  settings: AppSettings,
  dailyWeather?: Record<string, DayWeather>,
): WeekBuildSummary {
  const map = readStorage<DayPlanMap>(KEY, {})
  let totalVisits = 0
  let daysWithConflicts = 0
  let daysBuilt = 0

  // Pin each patient's actual visit days for the whole week up front, so a
  // visitsPerWeek cap picks the same specific weekdays across every day's
  // build rather than being re-decided (and potentially drifting) per day.
  const weeklyDaysByPatient = new Map(patients.map((p) => [p.id, selectWeeklyDays(p)]))

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const weekday = weekdayOf(date)
    const existing = map[date] ?? defaultPlan(date, settings)
    const dayPatients = patients.filter((p) => p.status === 'active' && (weeklyDaysByPatient.get(p.id) ?? []).includes(weekday))
    const weather = dailyWeather?.[date]

    const result = buildRoute({
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

    map[date] = {
      ...existing,
      patientIds: dayPatients.map((p) => p.id),
      cancelledPatientIds: [],
      makeupPatientIds: [],
      activeStopId: null,
      currentLocationOverride: null,
      result,
    }

    daysBuilt += 1
    totalVisits += result.visitCount
    if (result.conflicts.length > 0) daysWithConflicts += 1
  }

  writeStorage(KEY, map)
  return { daysBuilt, totalVisits, daysWithConflicts }
}
