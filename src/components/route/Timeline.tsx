import type { Patient, Stop } from '../../types'
import { formatTimeShort } from '../../lib/time'

const KIND_ICON: Record<Stop['kind'], string> = {
  start: '🏠',
  visit: '🟢',
  lunch: '🍴',
  open: '☕',
  end: '🏁',
}

interface Props {
  stops: Stop[]
  patientsById: Map<string, Patient>
  activeStopId: string | null
  onImHere: (stop: Stop) => void
  onCancelPatient: (patientId: string) => void
}

export function Timeline({ stops, patientsById, activeStopId, onImHere, onCancelPatient }: Props) {
  return (
    <div className="space-y-0">
      {stops.map((stop, idx) => {
        const patient = stop.patientId ? patientsById.get(stop.patientId) : undefined
        const isActive = stop.id === activeStopId
        const isVisit = stop.kind === 'visit'

        return (
          <div key={stop.id}>
            {idx > 0 && stop.driveMinutesFromPrev > 0 && (
              <div className="flex items-center gap-2 pl-6 py-1.5 text-[13px] text-muted">
                <span className="w-px h-4 bg-line ml-[7px]" />
                <span>🚗 {Math.round(stop.driveMinutesFromPrev)} min drive{stop.driveMilesFromPrev > 0 ? ` · ${stop.driveMilesFromPrev} mi` : ''}</span>
              </div>
            )}
            <div
              className={`rounded-2xl border-2 px-4 py-3.5 flex items-center gap-3 ${
                isActive ? 'border-primary-500 bg-mint-50' : stop.kind === 'visit' ? 'border-line-soft bg-surface' : 'border-dashed border-line bg-transparent'
              }`}
            >
              <div className="text-[22px] leading-none shrink-0">{KIND_ICON[stop.kind]}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-bold text-[15.5px] text-ink whitespace-nowrap shrink-0">
                    {formatTimeShort(stop.arrive)}
                    {stop.arrive !== stop.depart ? `–${formatTimeShort(stop.depart)}` : ''}
                  </span>
                  <span className="font-semibold text-[15px] text-ink truncate">
                    {isVisit ? patient?.initials ?? stop.label : stop.label}
                  </span>
                </div>
                {isVisit && patient?.notes && <div className="text-[12.5px] text-subtle italic truncate">{patient.notes}</div>}
                {isVisit && patient?.address && <div className="text-[12.5px] text-muted truncate">{patient.address}</div>}
              </div>
              {isVisit && patient && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => onImHere(stop)}
                    className={`text-[11.5px] font-bold px-2.5 py-1.5 rounded-full ${
                      isActive ? 'bg-primary-600 text-white' : 'bg-primary-50 text-accent'
                    }`}
                  >
                    📍 I'm Here
                  </button>
                  <button
                    onClick={() => onCancelPatient(patient.id)}
                    className="text-[11.5px] font-bold px-2.5 py-1.5 rounded-full bg-coral-50 text-danger"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
