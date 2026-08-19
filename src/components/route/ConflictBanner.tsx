import type { RouteConflict } from '../../types'

interface Props {
  conflicts: RouteConflict[]
  onEditRoute: () => void
}

export function ConflictBanner({ conflicts, onEditRoute }: Props) {
  if (conflicts.length === 0) return null
  return (
    <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl px-4 py-3.5">
      <div className="font-bold text-[15px] text-warning mb-1.5">⚠️ Schedule conflict</div>
      <ul className="space-y-1 mb-3">
        {conflicts.map((c, i) => (
          <li key={i} className="text-[13.5px] text-warning leading-snug">
            {c.message}
          </li>
        ))}
      </ul>
      <button onClick={onEditRoute} className="text-[13.5px] font-bold text-warning underline underline-offset-2">
        TRY ANOTHER ROUTE
      </button>
    </div>
  )
}
