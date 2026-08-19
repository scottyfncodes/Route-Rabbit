import { useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { buildWeekRoutes, readWeekPlans, type WeekBuildSummary } from '../hooks/useDayPlan'
import { useWeather } from '../hooks/useWeather'
import { addDays, formatDateHeading, startOfWeek, todayStr } from '../lib/time'
import type { AppSettings } from '../types'
import type { usePatients } from '../hooks/usePatients'

interface Props {
  onSelectDate: (date: string) => void
  patientsApi: ReturnType<typeof usePatients>
  settings: AppSettings
}

export function WeeklyPage({ onSelectDate, patientsApi, settings }: Props) {
  const { patients } = patientsApi
  const { forecast: weather } = useWeather(settings.homeGeo)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayStr()))
  const [refreshKey, setRefreshKey] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [building, setBuilding] = useState(false)
  const [summary, setSummary] = useState<WeekBuildSummary | null>(null)

  const plans = useMemo(() => readWeekPlans(), [weekStart, refreshKey])
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = todayStr()
  const activePatientCount = patients.filter((p) => p.status === 'active').length

  const totalVisits = days.reduce((sum, d) => {
    const plan = plans[d]
    if (!plan) return sum
    return sum + plan.patientIds.filter((id) => !plan.cancelledPatientIds.includes(id)).length
  }, 0)

  const handleBuildWeek = () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBuilding(true)
    setConfirming(false)
    // let the "Building..." state paint before the (synchronous) optimizer runs
    window.setTimeout(() => {
      const result = buildWeekRoutes(weekStart, patients, settings, weather?.daily)
      setSummary(result)
      setRefreshKey((k) => k + 1)
      setBuilding(false)
    }, 30)
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="w-9 h-9 flex items-center justify-center text-[20px] text-accent">
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-[19px] font-extrabold text-ink">Week of {formatDateHeading(weekStart)}</h1>
          <p className="text-[12.5px] text-muted">{totalVisits} visits planned</p>
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="w-9 h-9 flex items-center justify-center text-[20px] text-accent">
          ›
        </button>
      </header>

      <div className="px-4 pb-1">
        {summary && !confirming && (
          <div className="bg-mint-50 border-2 border-mint-200 rounded-2xl px-4 py-3.5 mb-3">
            <div className="font-bold text-[15px] text-accent mb-0.5">Week built</div>
            <div className="text-[14px] text-ink">
              {summary.totalVisits} visit{summary.totalVisits === 1 ? '' : 's'} across {summary.daysBuilt} days
              {summary.daysWithConflicts > 0 ? ` · ${summary.daysWithConflicts} day${summary.daysWithConflicts === 1 ? '' : 's'} need attention` : ''}
            </div>
            <button onClick={() => setSummary(null)} className="text-[12px] text-muted mt-1.5 font-medium">
              Dismiss
            </button>
          </div>
        )}

        {confirming && (
          <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl px-4 py-3.5 mb-3">
            <div className="font-bold text-[14px] text-warning mb-1">Rebuild the whole week?</div>
            <p className="text-[13px] text-warning mb-3">
              This replaces every day's planned patients with whoever is active and available that day, then optimizes each
              route. Any custom picks or cancellations for this week will be reset.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="md" fullWidth onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="md" fullWidth onClick={handleBuildWeek}>
                Yes, build it
              </Button>
            </div>
          </div>
        )}

        {!confirming && (
          <Button size="lg" fullWidth onClick={handleBuildWeek} disabled={activePatientCount === 0 || building}>
            {building ? 'Building…' : '⚡ BUILD MY WEEK'}
          </Button>
        )}
        {activePatientCount === 0 && !confirming && (
          <p className="text-[12.5px] text-muted text-center mt-2">Add active patients first -- each day is built from their available days.</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-6 space-y-2.5">
        {days.map((d) => {
          const plan = plans[d]
          const visitCount = plan ? plan.patientIds.filter((id) => !plan.cancelledPatientIds.includes(id)).length : 0
          const hasConflicts = Boolean(plan?.result?.conflicts.length)
          const isToday = d === today
          const dayWeather = weather?.daily[d]

          return (
            <button
              key={d}
              onClick={() => onSelectDate(d)}
              className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border-2 text-left ${
                isToday ? 'bg-mint-50 border-primary-400' : 'bg-surface border-line-soft'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {dayWeather && (
                  <div className="text-center shrink-0 w-9">
                    <div className="text-[19px] leading-none">{dayWeather.icon}</div>
                    <div className="text-[11px] text-muted font-semibold mt-0.5">{dayWeather.tempMaxF}°</div>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-bold text-[16px] text-ink">{formatDateHeading(d)}</div>
                  <div className="text-[13px] text-muted">
                    {visitCount === 0 ? 'No visits planned' : `${visitCount} visit${visitCount === 1 ? '' : 's'}`}
                    {plan?.result && visitCount > 0 ? ` · ${plan.result.efficiency}% efficient` : ''}
                    {hasConflicts ? ' · ⚠️ needs attention' : ''}
                  </div>
                </div>
              </div>
              <span className="text-[20px] text-faint shrink-0">›</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
