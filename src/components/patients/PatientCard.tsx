import type { Patient } from '../../types'
import { formatDays, formatTime } from '../../lib/time'

interface Props {
  patient: Patient
  onEdit: () => void
  onToggleStatus: () => void
}

export function PatientCard({ patient, onEdit, onToggleStatus }: Props) {
  const inactive = patient.status === 'inactive'

  return (
    <div className={`bg-white rounded-2xl border border-black/5 shadow-sm flex items-stretch overflow-hidden ${inactive ? 'opacity-60' : ''}`}>
      <button onClick={onEdit} className="flex-1 flex items-center gap-3 px-4 py-3.5 text-left min-w-0">
        <div className="w-12 h-12 shrink-0 rounded-full bg-primary-100 text-primary-800 font-bold text-[16px] flex items-center justify-center tracking-wide">
          {patient.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[16px] text-[#132825] truncate">{patient.address}</span>
          </div>
          <div className="text-[13px] text-[#5c6966] mt-0.5">
            {patient.visitDuration} min · {formatDays(patient.availableDays)}
          </div>
          <div className="text-[13px] text-[#5c6966]">
            {formatTime(patient.windowStart)}–{formatTime(patient.windowEnd)}
            {!patient.geo && <span className="text-amber-600 font-medium"> · locating…</span>}
          </div>
          {patient.notes && <div className="text-[12px] text-[#7a8582] mt-1 italic truncate">{patient.notes}</div>}
        </div>
      </button>
      <button
        onClick={onToggleStatus}
        className={`w-20 shrink-0 text-[12px] font-bold border-l border-black/5 ${inactive ? 'text-[#7a8582] bg-[#f5f6f4]' : 'text-primary-700 bg-mint-50'}`}
      >
        {inactive ? 'Inactive' : 'Active'}
      </button>
    </div>
  )
}
