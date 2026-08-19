import { formatDuration } from '../../lib/time'
import type { BuiltRoute } from '../../types'

interface Props {
  result: BuiltRoute
}

function effColor(eff: number): string {
  if (eff >= 75) return 'text-primary-700'
  if (eff >= 50) return 'text-amber-600'
  return 'text-coral-600'
}

export function StatsBar({ result }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 px-4 py-4 grid grid-cols-2 gap-y-3 gap-x-2">
      <Stat label="Visits" value={String(result.visitCount)} />
      <Stat label="Therapy time" value={formatDuration(result.totalTherapyMinutes)} />
      <Stat label="Driving" value={formatDuration(result.totalDriveMinutes)} />
      <Stat label="Miles" value={`${result.totalMiles} mi`} />
      <Stat label="Open time" value={formatDuration(result.openMinutes)} />
      <div>
        <div className="text-[12px] font-semibold text-[#5c6966] uppercase tracking-wide">Efficiency</div>
        <div className={`text-[20px] font-extrabold ${effColor(result.efficiency)}`}>{result.efficiency}%</div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-[#5c6966] uppercase tracking-wide">{label}</div>
      <div className="text-[20px] font-extrabold text-[#132825]">{value}</div>
    </div>
  )
}
