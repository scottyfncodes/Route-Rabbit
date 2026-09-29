import { useMemo, useState } from 'react'
import { alertsNear, conditionsNear, describeWindow } from '../../lib/roadAlerts'
import { todayStr } from '../../lib/time'
import type { CotripSnapshot, GeoPoint } from '../../types'
import { RoadAlertRow } from './RoadAlertRow'
import { COTRIP_URL, conditionIcon, updatedAgo } from './freshness'

const RADIUS_MILES = 10
const COLLAPSED_COUNT = 3

interface Props {
  snapshot: CotripSnapshot
  geo: GeoPoint
  loading: boolean
  onRefresh: () => void
}

/** Home dashboard: what CDOT is reporting right now around the therapist's start location. */
export function RoadsNearYouCard({ snapshot, geo, loading, onRefresh }: Props) {
  const [showAll, setShowAll] = useState(false)
  const alerts = useMemo(() => alertsNear(snapshot.alerts, geo, RADIUS_MILES), [snapshot, geo])
  const slick = useMemo(() => conditionsNear(snapshot.conditions, geo, RADIUS_MILES).filter((m) => m.condition.impact > 0), [snapshot, geo])
  const shown = showAll ? alerts : alerts.slice(0, COLLAPSED_COUNT)
  const today = todayStr()

  return (
    <div className="bg-surface rounded-2xl border border-line-soft px-4 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-label uppercase tracking-wide">Roads near you</h2>
        <button onClick={onRefresh} className="text-[12px] font-semibold text-accent px-2 py-1" disabled={loading}>
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {alerts.length === 0 && slick.length === 0 ? (
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[26px] leading-none" aria-hidden>
            ✅
          </span>
          <p className="text-[14px] text-ink leading-snug">
            All clear -- no CDOT incidents, closures or slick roads within {RADIUS_MILES} miles.
          </p>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-line-soft">
          {slick.map(({ condition: c, distanceMiles }) => (
            <div key={c.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span className="text-[22px] leading-none pt-0.5 shrink-0" aria-hidden>
                {conditionIcon(c)}
              </span>
              <div className="min-w-0">
                <div className="font-bold text-[14.5px] text-ink leading-snug">
                  {c.closed ? 'Closed' : c.label} <span className="font-semibold text-muted">· {c.route}</span>
                </div>
                <div className="text-[12px] font-medium text-subtle">{distanceMiles < 0.5 ? 'Right nearby' : `${distanceMiles.toFixed(1)} mi away`}</div>
              </div>
            </div>
          ))}
          {shown.map(({ alert, distanceMiles }) => (
            <RoadAlertRow
              key={alert.id}
              alert={alert}
              details={[describeWindow(alert, today), distanceMiles < 0.5 ? 'Right nearby' : `${distanceMiles.toFixed(1)} mi away`]}
            />
          ))}
        </div>
      )}

      {alerts.length > COLLAPSED_COUNT && (
        <button onClick={() => setShowAll((s) => !s)} className="w-full text-center text-[13px] font-semibold text-accent mt-1">
          {showAll ? 'Show fewer' : `Show ${alerts.length - COLLAPSED_COUNT} more`}
        </button>
      )}

      <div className="text-[11.5px] text-faint mt-2">
        CDOT data, updated {updatedAgo(snapshot.fetchedAt)} ·{' '}
        <a href={COTRIP_URL} target="_blank" rel="noreferrer" className="font-semibold text-accent">
          COtrip ↗
        </a>
      </div>
    </div>
  )
}
