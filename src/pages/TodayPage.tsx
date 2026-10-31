import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { RouteSetup } from '../components/route/RouteSetup'
import { Timeline } from '../components/route/Timeline'
import { StatsBar } from '../components/route/StatsBar'
import { ConflictBanner } from '../components/route/ConflictBanner'
import { MapView } from '../components/route/MapView'
import { QuickActions } from '../components/route/QuickActions'
import { NextStopCard } from '../components/route/NextStopCard'
import { CancelVisitModal } from '../components/route/CancelVisitModal'
import { useDayPlan } from '../hooks/useDayPlan'
import { useWeather } from '../hooks/useWeather'
import { planRoute } from '../lib/planRoute'
import { fetchRoadLegs, roadLegLookup } from '../lib/driveTimes'
import { DriveTimeNotice } from '../components/route/DriveTimeNotice'
import { findMakeupCandidates } from '../lib/makeup'
import { buildRouteLinks } from '../lib/googleMaps'
import { addDays, formatDateHeading, formatDuration, formatTime, fromMinutes, nowMinutes, todayStr, toMinutes, weekdayOf } from '../lib/time'
import type { AppSettings, BuiltRoute, Patient } from '../types'
import type { usePatients } from '../hooks/usePatients'

interface Props {
  patientsApi: ReturnType<typeof usePatients>
  settings: AppSettings
  date: string
  onDateChange: (date: string) => void
  onBack?: () => void
  /** Where Back returns to, e.g. "Week" or "Home". */
  backLabel?: string
}

interface Delta {
  driveMinutesSaved: number
  prevOrder: string
  newOrder: string
  /** "HH:MM" the rest of today was re-planned from, when the rebuild caught up to the clock. */
  resumedAt: string | null
}

export function TodayPage({ patientsApi, settings, date, onDateChange, onBack, backLabel = 'Week' }: Props) {
  const { patients } = patientsApi
  const { plan, updatePlan, togglePatientInDay, restorePatientToday } = useDayPlan(date, settings)
  const { forecast: weather } = useWeather(settings.homeGeo)
  const [showSetup, setShowSetup] = useState(!plan.result)
  const [delta, setDelta] = useState<Delta | null>(null)
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)
  // Bumped when real drive times for make-up candidates arrive, so the list re-ranks with them.
  const [legsVersion, setLegsVersion] = useState(0)

  const weekday = weekdayOf(date)
  const patientsById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients])
  const availableToday = useMemo(
    () => patients.filter((p) => p.status === 'active' && p.availableDays.includes(weekday)),
    [patients, weekday],
  )
  const cancelledToday = plan.cancelledPatientIds.map((id) => patientsById.get(id)).filter((p): p is Patient => Boolean(p))

  /**
   * Visits already done (or underway) today -- every visit up to and including the stop marked
   * "I'm Here". A mid-day rebuild keeps these in place and only re-plans what's left.
   */
  const visitedPatientIds = (): string[] => {
    const builtStops = plan.result?.stops ?? []
    const activeIdx = builtStops.findIndex((s) => s.id === plan.activeStopId)
    if (activeIdx === -1) return []
    return builtStops
      .slice(0, activeIdx + 1)
      .filter((s) => s.kind === 'visit' && s.patientId)
      .map((s) => s.patientId as string)
  }

  const computeResult = (
    cancelledIds: string[],
    patientIds: string[] = plan.patientIds,
    makeupIds: string[] = plan.makeupPatientIds,
    lockedIds: string[] = [],
    resumeAtMinutes?: number,
  ): Promise<BuiltRoute> => {
    const dayPatients = patientIds
      .filter((id) => !cancelledIds.includes(id))
      .map((id) => patientsById.get(id))
      .filter((p): p is Patient => Boolean(p))

    const dayWeather = weather?.daily[date]

    return planRoute({
      date,
      dayStartTime: plan.dayStartTime,
      startLocation: plan.startLocation,
      endLocation: plan.endLocation,
      patients: dayPatients,
      lunch: plan.lunch,
      avgSpeedMph: settings.avgSpeedMph,
      weatherImpact: dayWeather?.impact,
      weatherLabel: dayWeather?.label,
      makeupPatientIds: makeupIds,
      lockedPatientIds: lockedIds.filter((id) => !cancelledIds.includes(id)),
      resumeAtMinutes,
    })
  }

  /**
   * On today's route, a rebuild re-plans what's left from the current time, so running
   * long at one visit pushes the rest back instead of assuming the day is still on time.
   */
  const resumeAt = (): number | undefined => (date === todayStr() ? nowMinutes() : undefined)

  /** The resume time worth calling out: only when it actually moved the day later than planned. */
  const resumedLabel = (resume: number | undefined): string | null =>
    resume !== undefined && resume > toMinutes(plan.dayStartTime) ? fromMinutes(resume) : null

  const orderLabel = (result: BuiltRoute) => result.stops.filter((s) => s.kind === 'visit').map((s) => s.label).join(' → ')

  /** Runs one route build at a time, with the buttons showing it's working while real drive times load. */
  const whileBuilding = async (work: () => Promise<void>) => {
    if (building) return
    setBuilding(true)
    try {
      await work()
    } finally {
      setBuilding(false)
    }
  }

  const handleBuild = () =>
    whileBuilding(async () => {
      const result = await computeResult(plan.cancelledPatientIds)
      updatePlan({ result, activeStopId: null, currentLocationOverride: null })
      setDelta(null)
      setShowSetup(false)
    })

  const rebuildWithCancelled = (cancelledIds: string[]) =>
    whileBuilding(async () => {
    const prevResult = plan.result
    const resume = resumeAt()
    const result = await computeResult(cancelledIds, plan.patientIds, plan.makeupPatientIds, visitedPatientIds(), resume)
    updatePlan({ cancelledPatientIds: cancelledIds, result })
    if (prevResult) {
      setDelta({
        driveMinutesSaved: prevResult.totalDriveMinutes - result.totalDriveMinutes,
        prevOrder: orderLabel(prevResult),
        newOrder: orderLabel(result),
        resumedAt: resumedLabel(resume),
      })
    }
    })

  const handleRebuild = () => rebuildWithCancelled(plan.cancelledPatientIds)
  const handleCancelPatient = (patientId: string) => {
    if (plan.cancelledPatientIds.includes(patientId)) return
    setCancelTargetId(patientId)
  }
  const handleRestorePatient = (patientId: string) => {
    restorePatientToday(patientId)
    rebuildWithCancelled(plan.cancelledPatientIds.filter((id) => id !== patientId))
  }

  const handleLeaveSlotOpen = (patientId: string) => {
    rebuildWithCancelled([...plan.cancelledPatientIds, patientId])
    setCancelTargetId(null)
  }

  const handleAddMakeup = (cancelledId: string, makeupId: string) =>
    whileBuilding(async () => {
    const prevResult = plan.result
    const newCancelled = plan.cancelledPatientIds.includes(cancelledId) ? plan.cancelledPatientIds : [...plan.cancelledPatientIds, cancelledId]
    const newPatientIds = plan.patientIds.includes(makeupId) ? plan.patientIds : [...plan.patientIds, makeupId]
    const newMakeupIds = plan.makeupPatientIds.includes(makeupId) ? plan.makeupPatientIds : [...plan.makeupPatientIds, makeupId]
    const resume = resumeAt()
    const result = await computeResult(newCancelled, newPatientIds, newMakeupIds, visitedPatientIds(), resume)
    updatePlan({ cancelledPatientIds: newCancelled, patientIds: newPatientIds, makeupPatientIds: newMakeupIds, result })
    if (prevResult) {
      setDelta({
        driveMinutesSaved: prevResult.totalDriveMinutes - result.totalDriveMinutes,
        prevOrder: orderLabel(prevResult),
        newOrder: orderLabel(result),
        resumedAt: resumedLabel(resume),
      })
    }
    setCancelTargetId(null)
    })

  const handleImHere = (stopId: string) => {
    const stop = plan.result?.stops.find((s) => s.id === stopId)
    if (!stop) return
    updatePlan({ activeStopId: stop.id, currentLocationOverride: { label: stop.label, address: stop.address ?? '', geo: stop.geo } })
  }

  const stops = plan.result?.stops ?? []
  const activeIdx = stops.findIndex((s) => s.id === plan.activeStopId)
  const nextStop = stops.slice(activeIdx + 1).find((s) => s.kind === 'visit')
  const currentLocation = plan.currentLocationOverride ?? plan.startLocation
  const routeLinks = buildRouteLinks(stops)

  const canGoNext = date < addDays(todayStr(), 90)

  const cancelTargetPatient = cancelTargetId ? patientsById.get(cancelTargetId) : undefined
  const cancelTargetStop = cancelTargetId ? stops.find((s) => s.patientId === cancelTargetId) : undefined
  const cancelIdx = cancelTargetStop ? stops.indexOf(cancelTargetStop) : -1
  const slotPrevGeo = cancelIdx > 0 ? (stops[cancelIdx - 1]?.geo ?? null) : null
  const slotNextGeo = cancelIdx >= 0 ? (stops[cancelIdx + 1]?.geo ?? null) : null

  // When a slot opens, fetch real drive times for each possible make-up (in and out of the
  // gap) at the slot's time, then re-rank. One small request; cached after that.
  const cancelSlotKey = cancelTargetStop ? `${cancelTargetStop.id}@${cancelTargetStop.arrive}` : null
  useEffect(() => {
    if (!cancelSlotKey || !cancelTargetStop || !cancelTargetId) return
    const slotStart = toMinutes(cancelTargetStop.arrive)
    const requests = patients
      .filter((p) => p.id !== cancelTargetId && p.status === 'active' && p.makeupAvailable && p.geo)
      .flatMap((p) => [
        ...(slotPrevGeo ? [{ from: slotPrevGeo, to: p.geo!, departMinutes: slotStart }] : []),
        ...(slotNextGeo ? [{ from: p.geo!, to: slotNextGeo, departMinutes: slotStart + p.visitDuration }] : []),
      ])
    if (slotPrevGeo && slotNextGeo) requests.push({ from: slotPrevGeo, to: slotNextGeo, departMinutes: slotStart })
    let live = true
    fetchRoadLegs(date, requests).then((outcome) => {
      if (live && outcome === 'ok') setLegsVersion((v) => v + 1)
    })
    return () => {
      live = false
    }
    // Re-run only when a different slot opens; the geos and patients come along with it.
  }, [cancelSlotKey, date]) // oxlint-disable-line react-hooks/exhaustive-deps

  // A fresh lookup once real times for this slot arrive (or the route is rebuilt).
  const slotLegs = useMemo(() => roadLegLookup(date), [date, legsVersion, plan.result]) // oxlint-disable-line react-hooks/exhaustive-deps

  const makeupCandidates =
    cancelTargetPatient && cancelTargetStop
      ? findMakeupCandidates({
          cancelledPatientId: cancelTargetPatient.id,
          weekday,
          slotStart: cancelTargetStop.arrive,
          slotEnd: cancelTargetStop.depart,
          allPatients: patients,
          scheduledPatientIdsToday: plan.patientIds.filter((id) => !plan.cancelledPatientIds.includes(id) && id !== cancelTargetPatient.id),
          prevStopGeo: slotPrevGeo,
          nextStopGeo: slotNextGeo,
          avgSpeedMph: settings.avgSpeedMph,
          roadLeg: slotLegs,
        })
      : []

  return (
    <div className="flex-1 flex flex-col">
      {onBack && (
        <button onClick={onBack} className="px-4 pt-5 text-[13px] font-semibold text-accent text-left w-fit">
          ‹ Back to {backLabel}
        </button>
      )}
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
            building={building}
          />
        ) : (
          <div className="px-4 space-y-4">
            <ConflictBanner conflicts={plan.result.conflicts} onEditRoute={() => setShowSetup(true)} />

            {plan.result.weatherNote && (
              <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl px-4 py-3.5">
                <p className="text-[13.5px] text-warning leading-snug">{plan.result.weatherNote}</p>
              </div>
            )}

            {delta && (
              <div className="bg-mint-50 border-2 border-mint-200 rounded-2xl px-4 py-3.5">
                <div className="font-bold text-[15px] text-accent mb-0.5">Route rebuilt</div>
                <div className="text-[14px] text-ink mb-1">{delta.newOrder || 'No visits remain'}</div>
                {delta.resumedAt && (
                  <div className="text-[13px] text-muted mb-1">Rest of the day planned from {formatTime(delta.resumedAt)}, the current time.</div>
                )}
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
              <Button variant="danger" size="lg" fullWidth onClick={handleRebuild} disabled={building}>
                {building ? 'REBUILDING…' : 'REBUILD ROUTE'}
              </Button>
            </div>
            <button onClick={() => setShowSetup(true)} className="w-full text-center text-[13.5px] font-semibold text-accent -mt-2">
              Edit patients, times & locations
            </button>

            <StatsBar result={plan.result} />
            <DriveTimeNotice result={plan.result} />

            {routeLinks.length > 1 && (
              <p className="text-[13px] text-muted -mb-2">
                Google Maps limits how many stops one route can hold, so today opens in {routeLinks.length} parts. Start the next part when you
                finish the last one.
              </p>
            )}
            {routeLinks.map((link, i) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                role="button"
                className="block w-full text-center bg-primary-600 text-white font-extrabold text-[16px] rounded-2xl py-4 active:bg-primary-700"
              >
                {routeLinks.length === 1 ? 'OPEN ROUTE IN GOOGLE MAPS' : `PART ${i + 1}: VISITS ${link.firstVisit}-${link.lastVisit}${link.endsAtDestination ? ' + END' : ''}`}
              </a>
            ))}

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
                makeupPatientIds={plan.makeupPatientIds}
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

      {cancelTargetPatient && cancelTargetStop && (
        <CancelVisitModal
          patient={cancelTargetPatient}
          stop={cancelTargetStop}
          candidates={makeupCandidates}
          onAddCandidate={(makeupId) => handleAddMakeup(cancelTargetPatient.id, makeupId)}
          onLeaveOpen={() => handleLeaveSlotOpen(cancelTargetPatient.id)}
          onDismiss={() => setCancelTargetId(null)}
        />
      )}
    </div>
  )
}
