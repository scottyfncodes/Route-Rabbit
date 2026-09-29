import { describeWindow, type RouteAlertMatch } from '../../lib/roadAlerts'
import type { CotripSnapshot, RoadCondition } from '../../types'
import { RoadAlertRow } from './RoadAlertRow'
import { COTRIP_URL, conditionIcon, updatedAgo } from './freshness'

interface Props {
  snapshot: CotripSnapshot
  date: string
  matches: RouteAlertMatch[]
  /** Surface conditions on roads the route touches -- only meaningful for today. */
  conditions: RoadCondition[] | null
  loading: boolean
  onRefresh: () => void
}

function whereText(m: RouteAlertMatch): string {
  const where = m.leg.to.kind === 'end' ? 'On the drive home' : `On the way to ${m.leg.to.label}`
  const dist = m.distanceMiles < 0.15 ? 'right on your route' : `${m.distanceMiles.toFixed(1)} mi off route`
  return `${where} · ${dist}`
}

/** CDOT incidents, closures, construction and surface conditions along one day's built route. */
export function RouteRoadsCard({ snapshot, date, matches, conditions, loading, onRefresh }: Props) {
  const slick = (conditions ?? []).filter((c) => c.impact > 0)
  const clearRoads = [...new Set((conditions ?? []).filter((c) => c.impact === 0).map((c) => c.route))]
  const allClear = matches.length === 0 && slick.length === 0
  const majorCount = matches.filter((m) => m.alert.severity === 'major').length

  return (
    <section className={`rounded-2xl border-2 px-4 py-3.5 ${allClear ? 'bg-surface border-line-soft' : majorCount > 0 ? 'bg-coral-50 border-coral-100' : 'bg-amber-50 border-amber-100'}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-[15px] text-ink flex items-center gap-2">
          <span aria-hidden>🛣️</span>
          {allClear ? 'Roads look clear' : `${matches.length + slick.length} road ${matches.length + slick.length === 1 ? 'heads-up' : 'heads-ups'}`}
        </h2>
        <button onClick={onRefresh} disabled={loading} className="text-[12px] font-semibold text-accent px-2 py-1">
          {loading ? '…' : '↻'}
        </button>
      </div>

      {allClear ? (
        <p className="text-[13px] text-muted leading-snug mt-1">
          No CDOT incidents, closures or construction along this route{conditions ? ' and no slick roads reported' : ''}.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-line-soft">
          {slick.map((c) => (
            <div key={c.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span className="text-[22px] leading-none pt-0.5 shrink-0" aria-hidden>
                {conditionIcon(c)}
              </span>
              <div className="min-w-0">
                <div className="font-bold text-[14.5px] text-ink leading-snug">
                  {c.closed ? 'Closed' : c.label} <span className="font-semibold text-muted">· {c.route}</span>
                </div>
                <div className="text-[13px] text-muted leading-snug first-letter:uppercase">{c.name.replace(/^[^,]+,\s*/, '')}</div>
                {c.forecast && <div className="text-[12px] font-medium text-subtle mt-0.5">Forecast: {c.forecast}</div>}
              </div>
            </div>
          ))}
          {matches.map((m) => (
            <RoadAlertRow key={m.alert.id} alert={m.alert} details={[describeWindow(m.alert, date), whereText(m)]} />
          ))}
        </div>
      )}

      <div className="text-[11.5px] text-faint mt-3 flex flex-wrap gap-x-1.5">
        {clearRoads.length > 0 && <span>Dry: {clearRoads.slice(0, 4).join(', ')} ·</span>}
        <span>CDOT data, updated {updatedAgo(snapshot.fetchedAt)} ·</span>
        <a href={COTRIP_URL} target="_blank" rel="noreferrer" className="font-semibold text-accent">
          COtrip ↗
        </a>
      </div>
    </section>
  )
}
