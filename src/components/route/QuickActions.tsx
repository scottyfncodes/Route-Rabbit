import { buildNearbySearchUrl } from '../../lib/googleMaps'
import type { NamedLocation } from '../../types'

interface Props {
  near: NamedLocation
  compact?: boolean
}

const ACTIONS: Array<{ key: 'coffee' | 'lunch' | 'parks'; icon: string; label: string }> = [
  { key: 'coffee', icon: '☕', label: 'Coffee' },
  { key: 'lunch', icon: '🍴', label: 'Lunch' },
  { key: 'parks', icon: '🌳', label: 'Parks' },
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
          className={`flex flex-col items-center justify-center gap-1 rounded-2xl bg-white border border-black/5 font-bold text-[#132825] active:bg-mint-50 ${
            compact ? 'py-3 text-[13px]' : 'py-4 text-[14px]'
          }`}
        >
          <span className={compact ? 'text-[20px]' : 'text-[26px]'}>{a.icon}</span>
          {a.label}
        </a>
      ))}
    </div>
  )
}
