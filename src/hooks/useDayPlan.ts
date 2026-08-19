import { useCallback, useEffect, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'
import { buildRoute } from '../lib/routing'
import { addDays, weekdayOf } from '../lib/time'
import type { AppSettings, DayPlan, Patient } from '../types'

const KEY = 'dayPlans'
type DayPlanMap = Record<string, DayPlan>

function defaultPlan(date: string, settings: AppSettings): DayPlan {
  const home = { label: 'Home', address: settings.homeAddress, geo: settings.homeGeo }
  return {
    date,
    dayStartTime: '08:00',
    startLocation: home,
    endLocation: home,
    patientIds: [],
    cancelledPatientIds: [],
    lunch: { enabled: true, earliest: '11:30', latest: '13:30', duration: 30 },
    currentLocationOverride: null,
    activeStopId: null,
    result: null,
  }
}

export function useDayPlan(date: string, settings: AppSettings) {
  const [plans, setPlans] = useState<DayPlanMap>(() => readStorage<DayPlanMap>(KEY, {}))

  useEffect(() => {
    writeStorage(KEY, plans)
  }, [plans])

  const plan = plans[date] ?? defaultPlan(date, settings)

  const updatePlan = useCallback(
    (changes: Partial<DayPlan> | ((prev: DayPlan) => Partial<DayPlan>)) => {
      setPlans((prev) => {
        const current = prev[date] ?? defaultPlan(date, settings)
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
export function buildWeekRoutes(weekStart: string, patients: Patient[], settings: AppSettings): WeekBuildSummary {
  const map = readStorage<DayPlanMap>(KEY, {})
  let totalVisits = 0
  let daysWithConflicts = 0
  let daysBuilt = 0

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const weekday = weekdayOf(date)
    const existing = map[date] ?? defaultPlan(date, settings)
    const dayPatients = patients.filter((p) => p.status === 'active' && p.availableDays.includes(weekday))

    const result = buildRoute({
      date,
      dayStartTime: existing.dayStartTime,
      startLocation: existing.startLocation,
      endLocation: existing.endLocation,
      patients: dayPatients,
      lunch: existing.lunch,
      avgSpeedMph: settings.avgSpeedMph,
    })

    map[date] = {
      ...existing,
      patientIds: dayPatients.map((p) => p.id),
      cancelledPatientIds: [],
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
