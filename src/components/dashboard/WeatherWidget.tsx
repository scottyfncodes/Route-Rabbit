import { formatDateHeading, addDays, todayStr } from '../../lib/time'
import type { WeatherForecast } from '../../types'

interface Props {
  forecast: WeatherForecast | null
  loading: boolean
  hasLocation: boolean
  onRefresh: () => void
}

export function WeatherWidget({ forecast, loading, hasLocation, onRefresh }: Props) {
  if (!hasLocation) {
    return (
      <div className="bg-surface rounded-2xl border border-line-soft px-4 py-5 text-center">
        <p className="text-[14px] text-muted">Set your start location below to see live weather.</p>
      </div>
    )
  }

  const today = todayStr()
  const upcoming = Array.from({ length: 4 }, (_, i) => addDays(today, i + 1))

  return (
    <div className="bg-surface rounded-2xl border border-line-soft px-4 py-4">
      {forecast ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[38px] leading-none">{forecast.current.icon}</span>
              <div>
                <div className="text-[26px] font-extrabold text-ink leading-none">{forecast.current.tempF}°</div>
                <div className="text-[13px] text-muted mt-0.5">{forecast.current.label}</div>
              </div>
            </div>
            <button onClick={onRefresh} className="text-[12px] font-semibold text-accent px-2 py-1" disabled={loading}>
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
          {forecast.current.impact > 0 && (
            <p className="text-[12.5px] text-warning font-medium mt-2">
              {forecast.current.impact === 2 ? 'Expect slower, wetter drives today.' : 'Drives may run a bit slower today.'}
            </p>
          )}
          <div className="flex justify-between mt-4 pt-3 border-t border-line-soft">
            {upcoming.map((date) => {
              const day = forecast.daily[date]
              if (!day) return null
              return (
                <div key={date} className="text-center">
                  <div className="text-[11px] text-faint font-semibold uppercase">{formatDateHeading(date).slice(0, 3)}</div>
                  <div className="text-[17px] leading-tight my-0.5">{day.icon}</div>
                  <div className="text-[11.5px] text-muted">{day.tempMaxF}°</div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-muted">{loading ? 'Loading weather…' : 'Weather unavailable right now.'}</p>
          <button onClick={onRefresh} className="text-[12px] font-semibold text-accent px-2 py-1" disabled={loading}>
            ↻ Retry
          </button>
        </div>
      )}
    </div>
  )
}
