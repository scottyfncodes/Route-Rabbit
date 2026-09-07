import { useState } from 'react'
import { Button } from '../ui/Button'
import type { MakeupCandidate } from '../../lib/makeup'
import { formatTime } from '../../lib/time'
import type { Patient, PatientPriority, Stop } from '../../types'

const PRIORITY_DOT: Record<PatientPriority, string> = { high: '🔴', medium: '🟡', low: '🟢' }
const PRIORITY_LABEL: Record<PatientPriority, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' }

interface Props {
  patient: Patient
  stop: Stop
  candidates: MakeupCandidate[]
  onAddCandidate: (patientId: string) => void
  onLeaveOpen: () => void
  onDismiss: () => void
}

export function CancelVisitModal({ patient, stop, candidates, onAddCandidate, onLeaveOpen, onDismiss }: Props) {
  const [step, setStep] = useState<'confirm' | 'candidates'>('confirm')
  const slotTime = formatTime(stop.arrive)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-6 pt-10">
      <div className="bg-surface rounded-3xl w-full max-w-[480px] max-h-[85vh] overflow-y-auto px-6 py-7 space-y-4">
        {step === 'confirm' ? (
          <>
            <h1 className="text-[19px] font-extrabold text-ink">Cancel visit for {patient.initials}?</h1>
            <p className="text-[15px] text-ink leading-relaxed">This will open a {slotTime} slot.</p>
            <div className="space-y-2 pt-2">
              <Button size="lg" fullWidth onClick={() => setStep('candidates')}>
                Find a make-up
              </Button>
              <Button variant="outline" size="lg" fullWidth onClick={onLeaveOpen}>
                Leave Slot Open
              </Button>
              <button onClick={onDismiss} className="w-full text-center text-[14px] font-semibold text-muted py-2">
                Never mind
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-[19px] font-extrabold text-ink">Visit cancelled</h1>
            <p className="text-[15px] text-ink leading-relaxed">The {slotTime} slot is now open.</p>

            <div>
              <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Possible make-up visits</h2>
              {candidates.length === 0 ? (
                <p className="text-[14px] text-muted bg-app rounded-2xl px-4 py-4">No make-up visits are currently available.</p>
              ) : (
                <div className="space-y-2">
                  {candidates.map(({ patient: c, extraDriveMinutes }) => (
                    <div key={c.id} className="bg-app rounded-2xl border border-line-soft px-4 py-3.5 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span role="img" aria-label={PRIORITY_LABEL[c.priority]} title={PRIORITY_LABEL[c.priority]} className="text-[11px]">
                            {PRIORITY_DOT[c.priority]}
                          </span>
                          <span className="font-bold text-[15.5px] text-ink">{c.initials}</span>
                        </div>
                        <div className="text-[12.5px] text-muted truncate">
                          {c.visitDuration} min · window {formatTime(c.windowStart)}–{formatTime(c.windowEnd)}
                          {extraDriveMinutes !== null ? ` · ~${Math.round(extraDriveMinutes)} min added drive` : ''}
                        </div>
                      </div>
                      <Button size="md" onClick={() => onAddCandidate(c.id)} className="shrink-0">
                        Add to Route
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button variant="outline" size="lg" fullWidth onClick={onLeaveOpen}>
              Leave Slot Open
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
