import { useCallback, useEffect, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'
import type { AppSettings, DayPlan } from '../types'

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
