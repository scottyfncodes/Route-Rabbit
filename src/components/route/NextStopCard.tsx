import { buildNavigateUrl } from '../../lib/googleMaps'
import { QuickActions } from './QuickActions'
import { KIND_ICON } from '../../lib/roadAlerts'
import type { NamedLocation, RoadAlert, Stop } from '../../types'

interface Props {
  nextStop: Stop
  currentLocation: NamedLocation
  /** CDOT alerts on the drive to this stop. */
  roadAlerts?: RoadAlert[]
}

export function NextStopCard({ nextStop, currentLocation, roadAlerts = [] }: Props) {
  return (
    <div className="bg-primary-700 text-white rounded-2xl px-5 py-5 space-y-3">
      <div>
        <div className="text-[12px] font-bold uppercase tracking-wider text-primary-100">Next stop</div>
        <div className="text-[26px] font-extrabold leading-tight">{nextStop.label}</div>
        {nextStop.driveMinutesFromPrev > 0 && (
          <div className="text-[14.5px] text-primary-100 font-medium">{Math.round(nextStop.driveMinutesFromPrev)} min away</div>
        )}
      </div>
      {roadAlerts.length > 0 && (
        <div className="bg-white/10 rounded-xl px-3 py-2.5 space-y-1">
          {roadAlerts.slice(0, 2).map((a) => (
            <div key={a.id} className="text-[13.5px] leading-snug">
              <span aria-hidden>{KIND_ICON[a.kind]}</span> <span className="font-bold">{a.fullClosure ? 'Road closed' : a.title}</span>
              {a.route && <span className="text-primary-100"> on {a.route}</span>}
              {a.impact && !a.fullClosure && <div className="text-primary-100 text-[12.5px]">{a.impact}</div>}
            </div>
          ))}
          {roadAlerts.length > 2 && <div className="text-[12.5px] text-primary-100">+{roadAlerts.length - 2} more on the way</div>}
        </div>
      )}
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
