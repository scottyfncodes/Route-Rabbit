import { useMemo, useState } from 'react'
import { WeatherWidget } from '../components/dashboard/WeatherWidget'
import { LocationInput } from '../components/route/LocationInput'
import { QuickActions } from '../components/route/QuickActions'
import { useWeather } from '../hooks/useWeather'
import { readWeekPlans } from '../hooks/useDayPlan'
import { addDays, startOfWeek, todayStr } from '../lib/time'
import type { AppSettings, NamedLocation } from '../types'
import type { usePatients } from '../hooks/usePatients'
import type { Tab } from '../components/layout/BottomNav'

interface Props {
  settings: AppSettings
  updateSettings: (changes: Partial<AppSettings>) => void
  patientsApi: ReturnType<typeof usePatients>
  onNavigate: (tab: Tab) => void
}

export function HomePage({ settings, updateSettings, patientsApi, onNavigate }: Props) {
  const { forecast, loading, refresh } = useWeather(settings.homeGeo)

  const [customEnd, setCustomEnd] = useState(() => Boolean(settings.endAddress.trim()))

  const startLocation: NamedLocation = { label: 'Start', address: settings.homeAddress, geo: settings.homeGeo }
  const endLocation: NamedLocation = { label: 'End', address: settings.endAddress, geo: settings.endGeo }

  const activePatientCount = patientsApi.patients.filter((p) => p.status === 'active').length

  const weekVisits = useMemo(() => {
    const weekStart = startOfWeek(todayStr())
    const plans = readWeekPlans()
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).reduce((sum, d) => {
      const plan = plans[d]
      if (!plan) return sum
      return sum + plan.patientIds.filter((id) => !plan.cancelledPatientIds.includes(id)).length
    }, 0)
  }, [])

  return (
    <div className="flex-1 flex flex-col">
      <header className="px-4 pt-6 pb-3">
        <h1 className="text-[24px] font-extrabold text-ink">Home</h1>
        <p className="text-[13px] text-muted">Your start point, weather, and quick access on the go</p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-5">
        <WeatherWidget forecast={forecast} loading={loading} hasLocation={Boolean(settings.homeGeo)} onRefresh={refresh} />

        <div className="bg-surface rounded-2xl border border-line-soft px-4 py-4 space-y-3">
          <h2 className="text-[13px] font-bold text-label uppercase tracking-wide">Start &amp; end location</h2>
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
        </div>

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

        <div>
          <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">On the road</h2>
          <QuickActions near={startLocation} />
        </div>
      </div>
    </div>
  )
}
