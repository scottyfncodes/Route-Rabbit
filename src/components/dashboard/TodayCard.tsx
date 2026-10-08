import { Button } from '../ui/Button'
import { formatDateHeading, formatDuration, formatTime } from '../../lib/time'
import type { DaySummary } from '../../lib/daySummary'

interface Props {
  date: string
  /** Today's built route, or null when none has been built yet. */
  summary: DaySummary | null
  /** Shown in place of a real route when there are no patients at all. */
  example: DaySummary
  hasPatients: boolean
  onOpenDay: () => void
  onAddPatient: () => void
}

/**
 * The Home dashboard's hero: today's visits in route order with the day's totals,
 * and one primary action. Three states -- a built route, patients but no route
 * for today yet, and a clearly labeled example day before any patients exist.
 */
export function TodayCard({ date, summary, example, hasPatients, onOpenDay, onAddPatient }: Props) {
  const isExample = !hasPatients
  const day = summary ?? (isExample ? example : null)

  return (
    <section className="bg-surface rounded-2xl border border-line-soft px-4 pt-4 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-bold text-label uppercase tracking-wide flex items-center gap-2">
          Today
          {isExample && (
            <span className="text-[11px] font-bold text-accent bg-primary-50 rounded-full px-2 py-0.5 tracking-wide">Example</span>
          )}
        </h2>
        <span className="text-[13px] text-muted">{formatDateHeading(date)}</span>
      </div>

      {day ? (
        <>
          <p className="text-[22px] font-extrabold text-ink leading-tight mt-1.5">
            {day.visitCount} visit{day.visitCount === 1 ? '' : 's'}
            <span className="text-muted font-semibold text-[15px]">
              {' '}
              · {formatDuration(day.totalDriveMinutes)} driving · {day.totalMiles} mi
            </span>
          </p>
          {day.firstVisitTime && <p className="text-[13.5px] text-muted mt-0.5">First visit {formatTime(day.firstVisitTime)}</p>}

          <ol className="mt-3 divide-y divide-line-soft" aria-label={isExample ? 'Example visits' : "Today's visits"}>
            {day.visits.map((v, i) => (
              <li key={`${v.initials}-${v.arrive}`} className="flex items-center gap-3 py-2">
                <span className="w-6 h-6 rounded-full bg-primary-50 text-accent text-[12px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="font-bold text-[15px] text-ink w-[76px] shrink-0 tabular-nums">{formatTime(v.arrive)}</span>
                <span className="font-semibold text-[15px] text-ink truncate flex-1">{v.initials}</span>
                {v.driveMinutesFromPrev > 0 && (
                  <span className="text-[12.5px] text-muted shrink-0">{v.driveMinutesFromPrev} min drive</span>
                )}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <p className="text-[22px] font-extrabold text-ink leading-tight mt-1.5">No route yet</p>
          <p className="text-[13.5px] text-muted mt-0.5">Pick today's patients and build the route in the day view.</p>
        </>
      )}

      <div className="mt-4">
        {isExample ? (
          <Button size="lg" fullWidth onClick={onAddPatient}>
            Add your first patient
          </Button>
        ) : (
          <Button size="lg" fullWidth onClick={onOpenDay}>
            {summary ? "Open today's route" : "Build today's route"}
          </Button>
        )}
      </div>

      {isExample && (
        <p className="text-[12.5px] text-subtle mt-3 leading-snug text-center">
          Example day with fictional initials. Your real route appears here once you add patients.
        </p>
      )}
    </section>
  )
}
