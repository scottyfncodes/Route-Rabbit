import { buildNavigateUrl } from '../../lib/googleMaps'
import { QuickActions } from './QuickActions'
import type { NamedLocation, Stop } from '../../types'

interface Props {
  nextStop: Stop
  currentLocation: NamedLocation
}

export function NextStopCard({ nextStop, currentLocation }: Props) {
  return (
    <div className="bg-primary-700 text-white rounded-2xl px-5 py-5 space-y-3">
      <div>
        <div className="text-[12px] font-bold uppercase tracking-wider text-primary-100">Next stop</div>
        <div className="text-[26px] font-extrabold leading-tight">{nextStop.label}</div>
        {nextStop.driveMinutesFromPrev > 0 && (
          <div className="text-[14.5px] text-primary-100 font-medium">{Math.round(nextStop.driveMinutesFromPrev)} min away</div>
        )}
      </div>
      <a
        href={buildNavigateUrl({ address: nextStop.address, geo: nextStop.geo }, currentLocation)}
        target="_blank"
        rel="noreferrer"
        role="button"
        className="block w-full text-center bg-white text-primary-800 font-extrabold text-[16px] rounded-xl py-3.5"
      >
        📍 NAVIGATE
      </a>
      <QuickActions near={currentLocation} compact />
    </div>
  )
}
