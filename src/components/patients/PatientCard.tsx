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
    <div className={`bg-surface rounded-2xl border border-line-soft shadow-sm flex items-stretch overflow-hidden ${inactive ? 'opacity-60' : ''}`}>
      <button onClick={onEdit} className="flex-1 flex items-center gap-3 px-4 py-3.5 text-left min-w-0">
        <div className="w-12 h-12 shrink-0 rounded-full bg-primary-100 text-accent font-bold text-[16px] flex items-center justify-center tracking-wide">
          {patient.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[16px] text-ink truncate">{patient.address}</span>
          </div>
          <div className="text-[13px] text-muted mt-0.5">
            {patient.visitDuration} min · {formatDays(patient.availableDays)}
            {patient.visitsPerWeek ? ` · ${patient.visitsPerWeek}×/week` : ''}
          </div>
          <div className="text-[13px] text-muted">
            {formatTime(patient.windowStart)}–{formatTime(patient.windowEnd)}
            {patient.conflicts.length > 0 ? ` · ${patient.conflicts.length} blocked time${patient.conflicts.length === 1 ? '' : 's'}` : ''}
            {!patient.geo && <span className="text-warning font-medium"> · locating…</span>}
          </div>
          {patient.notes && <div className="text-[12px] text-subtle mt-1 italic truncate">{patient.notes}</div>}
        </div>
      </button>
      <button
        onClick={onToggleStatus}
        className={`w-20 shrink-0 text-[12px] font-bold border-l border-line-soft ${inactive ? 'text-subtle bg-app' : 'text-accent bg-mint-50'}`}
      >
        {inactive ? 'Archived' : 'Active'}
      </button>
    </div>
  )
}
