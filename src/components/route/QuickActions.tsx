import { buildNearbySearchUrl } from '../../lib/googleMaps'
import type { NamedLocation } from '../../types'

interface Props {
  near: NamedLocation
  compact?: boolean
}

const ACTIONS: Array<{ key: 'coffee' | 'lunch' | 'parks'; label: string }> = [
  { key: 'coffee', label: 'Coffee' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'parks', label: 'Parks' },
]

export function QuickActions({ near, compact }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {ACTIONS.map((a) => (
        <a
          key={a.key}
          href={buildNearbySearchUrl(a.key, near)}
          target="_blank"
          rel="noreferrer"
          role="button"
          className={`flex items-center justify-center rounded-2xl bg-surface border border-line-soft font-bold text-ink active:bg-mint-50 ${
            compact ? 'py-3 text-[13px]' : 'py-3.5 text-[14px]'
          }`}
        >
          {a.label}
        </a>
      ))}
    </div>
  )
}
