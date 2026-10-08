import { useMemo, useState } from 'react'
import { TodayCard } from '../components/dashboard/TodayCard'
import { WeatherWidget } from '../components/dashboard/WeatherWidget'
import { LocationInput } from '../components/route/LocationInput'
import { QuickActions } from '../components/route/QuickActions'
import { BrandMark } from '../components/ui/BrandMark'
import { useWeather } from '../hooks/useWeather'
import { readWeekPlans } from '../hooks/useDayPlan'
import { EXAMPLE_DAY, summarizeDay } from '../lib/daySummary'
import { addDays, startOfWeek, todayStr } from '../lib/time'
import type { AppSettings, NamedLocation } from '../types'
import type { usePatients } from '../hooks/usePatients'
import type { Tab } from '../components/layout/BottomNav'

interface Props {
  settings: AppSettings
  updateSettings: (changes: Partial<AppSettings>) => void
  patientsApi: ReturnType<typeof usePatients>
  onNavigate: (tab: Tab) => void
  onOpenDay: (date: string) => void
}

export function HomePage({ settings, updateSettings, patientsApi, onNavigate, onOpenDay }: Props) {
  const { forecast, loading, refresh } = useWeather(settings.homeGeo)

  const hasStart = Boolean(settings.homeAddress.trim())
  const [customEnd, setCustomEnd] = useState(() => Boolean(settings.endAddress.trim()))
  // The start/end form is tucked behind a one-line row -- today's route is the hero, not setup.
  const [editingLocations, setEditingLocations] = useState(false)

  const startLocation: NamedLocation = { label: 'Start', address: settings.homeAddress, geo: settings.homeGeo }
  const endLocation: NamedLocation = { label: 'End', address: settings.endAddress, geo: settings.endGeo }

  const activePatientCount = patientsApi.patients.filter((p) => p.status === 'active').length
  const today = todayStr()

  const plans = useMemo(() => readWeekPlans(), [])
  const patientsById = useMemo(() => new Map(patientsApi.patients.map((p) => [p.id, p])), [patientsApi.patients])
  const todaySummary = useMemo(() => summarizeDay(plans[today], patientsById), [plans, today, patientsById])

  const weekVisits = useMemo(() => {
    const weekStart = startOfWeek(today)
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).reduce((sum, d) => {
      const plan = plans[d]
      if (!plan) return sum
      return sum + plan.patientIds.filter((id) => !plan.cancelledPatientIds.includes(id)).length
    }, 0)
  }, [plans, today])

  return (
    <div className="flex-1 flex flex-col">
      <header className="px-4 pt-5 pb-3 flex items-center gap-3">
        <BrandMark className="w-11 h-11 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold text-ink leading-none tracking-tight">Route Rabbit</h1>
          <p className="text-[13px] text-muted mt-1 leading-snug">Today's home visits, in the best order.</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
        <TodayCard
          date={today}
          summary={todaySummary}
          example={EXAMPLE_DAY}
          hasPatients={activePatientCount > 0}
          onOpenDay={() => onOpenDay(today)}
          onAddPatient={() => onNavigate('patients')}
        />

        <div className="bg-surface rounded-2xl border border-line-soft px-4 py-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-label uppercase tracking-wide">Start location</div>
              <div className={`text-[14px] mt-0.5 truncate ${hasStart ? 'text-ink font-medium' : 'text-muted'}`}>
                {hasStart ? settings.homeAddress : 'Not set yet -- used for drive times'}
              </div>
            </div>
            <button
              onClick={() => setEditingLocations((v) => !v)}
              className="shrink-0 text-[13.5px] font-bold text-accent px-2 py-1"
              aria-expanded={editingLocations}
            >
              {editingLocations ? 'Done' : hasStart ? 'Change' : 'Set'}
            </button>
          </div>

          {editingLocations && (
            <>
              <LocationInput
                label="Start location"
                value={startLocation}
                placeholder="Where your day begins"
                onChange={(loc) => updateSettings({ homeAddress: loc.address })}
              />
              <label className="flex items-center gap-2.5 py-0.5">
                <input
                  type="checkbox"
                  checked={!customEnd}
                  onChange={(e) => {
                    const same = e.target.checked
                    setCustomEnd(!same)
                    if (same) updateSettings({ endAddress: '' })
                  }}
                  className="w-5 h-5 shrink-0 accent-primary-600"
                />
                <span className="text-[13.5px] font-medium text-ink">Start and end location are the same</span>
              </label>
              {customEnd && (
                <LocationInput
                  label="End location"
                  value={endLocation}
                  placeholder="Where your day ends"
                  onChange={(loc) => updateSettings({ endAddress: loc.address })}
                />
              )}
            </>
          )}
        </div>

        {settings.homeGeo && <WeatherWidget forecast={forecast} loading={loading} hasLocation onRefresh={refresh} />}

        {(activePatientCount > 0 || weekVisits > 0) && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => onNavigate('patients')} className="bg-surface rounded-2xl border border-line-soft px-4 py-4 text-left">
              <div className="text-[26px] font-extrabold text-ink leading-none">{activePatientCount}</div>
              <div className="text-[13px] text-muted mt-1">Active patients →</div>
            </button>
            <button onClick={() => onNavigate('weekly')} className="bg-surface rounded-2xl border border-line-soft px-4 py-4 text-left">
              <div className="text-[26px] font-extrabold text-ink leading-none">{weekVisits}</div>
              <div className="text-[13px] text-muted mt-1">Visits this week →</div>
            </button>
          </div>
        )}

        <div>
          <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">On the road</h2>
          <QuickActions near={startLocation} />
        </div>
      </div>
    </div>
  )
}
