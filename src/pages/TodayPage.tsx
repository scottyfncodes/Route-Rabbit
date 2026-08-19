import { useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { RouteSetup } from '../components/route/RouteSetup'
import { Timeline } from '../components/route/Timeline'
import { StatsBar } from '../components/route/StatsBar'
import { ConflictBanner } from '../components/route/ConflictBanner'
import { MapView } from '../components/route/MapView'
import { QuickActions } from '../components/route/QuickActions'
import { NextStopCard } from '../components/route/NextStopCard'
import { useDayPlan } from '../hooks/useDayPlan'
import { buildRoute } from '../lib/routing'
import { addDays, formatDateHeading, formatDuration, todayStr, weekdayOf } from '../lib/time'
import type { AppSettings, BuiltRoute, Patient } from '../types'
import type { usePatients } from '../hooks/usePatients'

interface Props {
  patientsApi: ReturnType<typeof usePatients>
  settings: AppSettings
  date: string
  onDateChange: (date: string) => void
}

interface Delta {
  driveMinutesSaved: number
  prevOrder: string
  newOrder: string
}

export function TodayPage({ patientsApi, settings, date, onDateChange }: Props) {
  const { patients } = patientsApi
  const { plan, updatePlan, togglePatientInDay, restorePatientToday } = useDayPlan(date, settings)
  const [showSetup, setShowSetup] = useState(!plan.result)
  const [delta, setDelta] = useState<Delta | null>(null)

  const weekday = weekdayOf(date)
  const patientsById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients])
  const availableToday = useMemo(
    () => patients.filter((p) => p.status === 'active' && p.availableDays.includes(weekday)),
    [patients, weekday],
  )
  const cancelledToday = plan.cancelledPatientIds.map((id) => patientsById.get(id)).filter((p): p is Patient => Boolean(p))

  const computeResult = (cancelledIds: string[]): BuiltRoute => {
    const dayPatients = plan.patientIds
      .filter((id) => !cancelledIds.includes(id))
      .map((id) => patientsById.get(id))
      .filter((p): p is Patient => Boolean(p))

    return buildRoute({
      date,
      dayStartTime: plan.dayStartTime,
      startLocation: plan.startLocation,
      endLocation: plan.endLocation,
      patients: dayPatients,
      lunch: plan.lunch,
      avgSpeedMph: settings.avgSpeedMph,
    })
  }

  const orderLabel = (result: BuiltRoute) => result.stops.filter((s) => s.kind === 'visit').map((s) => s.label).join(' → ')

  const handleBuild = () => {
    const result = computeResult(plan.cancelledPatientIds)
    updatePlan({ result, activeStopId: null, currentLocationOverride: null })
    setDelta(null)
    setShowSetup(false)
  }

  const rebuildWithCancelled = (cancelledIds: string[]) => {
    const prevResult = plan.result
    const result = computeResult(cancelledIds)
    updatePlan({ cancelledPatientIds: cancelledIds, result })
    if (prevResult) {
      setDelta({
        driveMinutesSaved: prevResult.totalDriveMinutes - result.totalDriveMinutes,
        prevOrder: orderLabel(prevResult),
        newOrder: orderLabel(result),
      })
    }
  }

  const handleRebuild = () => rebuildWithCancelled(plan.cancelledPatientIds)
  const handleCancelPatient = (patientId: string) => {
    if (plan.cancelledPatientIds.includes(patientId)) return
    rebuildWithCancelled([...plan.cancelledPatientIds, patientId])
  }
  const handleRestorePatient = (patientId: string) => {
    restorePatientToday(patientId)
    rebuildWithCancelled(plan.cancelledPatientIds.filter((id) => id !== patientId))
  }

  const handleImHere = (stopId: string) => {
    const stop = plan.result?.stops.find((s) => s.id === stopId)
    if (!stop) return
    updatePlan({ activeStopId: stop.id, currentLocationOverride: { label: stop.label, address: stop.address ?? '', geo: stop.geo } })
  }

  const stops = plan.result?.stops ?? []
  const activeIdx = stops.findIndex((s) => s.id === plan.activeStopId)
  const nextStop = stops.slice(activeIdx + 1).find((s) => s.kind === 'visit')
  const currentLocation = plan.currentLocationOverride ?? plan.startLocation

  const canGoNext = date < addDays(todayStr(), 90)

  return (
    <div className="flex-1 flex flex-col">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between">
        <button onClick={() => onDateChange(addDays(date, -1))} className="w-9 h-9 flex items-center justify-center text-[20px] text-accent" aria-label="Previous day">
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-[19px] font-extrabold text-ink">{formatDateHeading(date)}</h1>
          {date !== todayStr() && (
            <button onClick={() => onDateChange(todayStr())} className="text-[12px] font-semibold text-accent">
              Jump to today
            </button>
          )}
        </div>
        <button
          onClick={() => canGoNext && onDateChange(addDays(date, 1))}
          className="w-9 h-9 flex items-center justify-center text-[20px] text-accent"
          aria-label="Next day"
        >
          ›
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pb-8">
        {showSetup || !plan.result ? (
          <RouteSetup
            plan={plan}
            availableToday={availableToday}
            onUpdatePlan={updatePlan}
            onTogglePatient={togglePatientInDay}
            onBuild={handleBuild}
          />
        ) : (
          <div className="px-4 space-y-4">
            <ConflictBanner conflicts={plan.result.conflicts} onEditRoute={() => setShowSetup(true)} />

            {delta && (
              <div className="bg-mint-50 border-2 border-mint-200 rounded-2xl px-4 py-3.5">
                <div className="font-bold text-[15px] text-accent mb-0.5">Route rebuilt</div>
                <div className="text-[14px] text-ink mb-1">{delta.newOrder || 'No visits remain'}</div>
                {delta.driveMinutesSaved !== 0 && (
                  <div className="text-[13.5px] font-semibold text-accent">
                    {delta.driveMinutesSaved > 0
                      ? `${formatDuration(delta.driveMinutesSaved)} saved`
                      : `${formatDuration(Math.abs(delta.driveMinutesSaved))} more driving`}
                  </div>
                )}
                <button onClick={() => setDelta(null)} className="text-[12px] text-muted mt-1.5 font-medium">
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="danger" size="lg" fullWidth onClick={handleRebuild}>
                🔄 REBUILD ROUTE
              </Button>
            </div>
            <button onClick={() => setShowSetup(true)} className="w-full text-center text-[13.5px] font-semibold text-accent -mt-2">
              Edit patients, times & locations
            </button>

            <StatsBar result={plan.result} />

            {plan.result.googleMapsUrl && (
              <a
                href={plan.result.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                role="button"
                className="block w-full text-center bg-primary-600 text-white font-extrabold text-[16px] rounded-2xl py-4 active:bg-primary-700"
              >
                📍 OPEN ROUTE IN GOOGLE MAPS
              </a>
            )}

            {nextStop && <NextStopCard nextStop={nextStop} currentLocation={currentLocation} />}

            <div>
              <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">On the road</h2>
              <QuickActions near={currentLocation} />
            </div>

            <div>
              <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Map</h2>
              <MapView stops={stops} />
            </div>

            <div>
              <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Timeline</h2>
              <Timeline
                stops={stops}
                patientsById={patientsById}
                activeStopId={plan.activeStopId}
                onImHere={(stop) => handleImHere(stop.id)}
                onCancelPatient={handleCancelPatient}
              />
            </div>

            {cancelledToday.length > 0 && (
              <div>
                <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Cancelled today</h2>
                <div className="space-y-2">
                  {cancelledToday.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-surface rounded-2xl border border-line-soft px-4 py-3">
                      <span className="font-semibold text-[15px] text-ink line-through">{p.initials}</span>
                      <button onClick={() => handleRestorePatient(p.id)} className="text-[13.5px] font-bold text-accent">
                        Add back + rebuild
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
