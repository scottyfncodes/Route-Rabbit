import { useState } from 'react'
import { KIND_ICON } from '../../lib/roadAlerts'
import type { RoadAlert } from '../../types'

const SEVERITY_BADGE: Record<RoadAlert['severity'], { label: string; className: string }> = {
  major: { label: 'Major', className: 'bg-coral-50 text-danger' },
  moderate: { label: 'Delays', className: 'bg-amber-50 text-warning' },
  minor: { label: 'Minor', className: 'bg-primary-50 text-muted' },
}

interface Props {
  alert: RoadAlert
  /** Extra context lines, e.g. when it's active and where it sits relative to the route. */
  details: (string | null)[]
}

/** One CDOT incident / planned event. Tap to expand the full CDOT message. */
export function RoadAlertRow({ alert, details }: Props) {
  const [expanded, setExpanded] = useState(false)
  const badge = SEVERITY_BADGE[alert.severity]
  const shownDetails = details.filter((d): d is string => Boolean(d))

  return (
    <button onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="w-full text-left flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className="text-[22px] leading-none pt-0.5 shrink-0" aria-hidden>
        {KIND_ICON[alert.kind]}
      </span>
      <span className="min-w-0 flex-1 block">
        <span className="flex items-baseline gap-2">
          <span className="font-bold text-[14.5px] text-ink leading-snug flex-1 min-w-0">
            {alert.title}
            {alert.route && <span className="font-semibold text-muted"> · {alert.route}</span>}
          </span>
          <span className={`text-[10.5px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${badge.className}`}>{badge.label}</span>
        </span>
        {(alert.fullClosure || alert.impact) && (
          <span className={`block text-[13px] font-semibold leading-snug mt-0.5 ${alert.fullClosure ? 'text-danger' : 'text-warning'}`}>
            {alert.fullClosure ? 'Road closed' : alert.impact}
          </span>
        )}
        {alert.message && (
          <span className={`text-[13px] text-muted leading-snug mt-1 ${expanded ? 'block' : 'line-clamp-2'}`}>{alert.message}</span>
        )}
        {shownDetails.length > 0 && <span className="block text-[12px] font-medium text-subtle mt-1">{shownDetails.join(' · ')}</span>}
      </span>
    </button>
  )
}
