import { useState } from 'react'
import { formatTime } from '../../lib/time'
import { WEEKDAYS, type Patient, type PatientConflict, type PatientPriority, type Weekday } from '../../types'

const DURATION_PRESETS = [15, 30, 45, 60, 75, 90]
const VISITS_PER_WEEK_OPTIONS: Array<number | null> = [null, 1, 2, 3, 4, 5]
const PRIORITY_OPTIONS: Array<{ value: PatientPriority; label: string; dot: string }> = [
  { value: 'high', label: 'High', dot: '🔴' },
  { value: 'medium', label: 'Medium', dot: '🟡' },
  { value: 'low', label: 'Low', dot: '🟢' },
]

function newConflictId(): string {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export interface PatientFormValues {
  initials: string
  address: string
  visitDuration: number
  availableDays: Weekday[]
  windowStart: string
  windowEnd: string
  visitsPerWeek: number | null
  conflicts: PatientConflict[]
  notes: string
  priority: PatientPriority
  makeupAvailable: boolean
}

function valuesFrom(patient?: Patient): PatientFormValues {
  if (!patient) {
    return {
      initials: '',
      address: '',
      visitDuration: 45,
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      windowStart: '09:00',
      windowEnd: '17:00',
      visitsPerWeek: null,
      conflicts: [],
      notes: '',
      priority: 'medium',
      makeupAvailable: false,
    }
  }
  return {
    initials: patient.initials,
    address: patient.address,
    visitDuration: patient.visitDuration,
    availableDays: patient.availableDays,
    windowStart: patient.windowStart,
    windowEnd: patient.windowEnd,
    visitsPerWeek: patient.visitsPerWeek,
    conflicts: patient.conflicts,
    notes: patient.notes ?? '',
    priority: patient.priority,
    makeupAvailable: patient.makeupAvailable,
  }
}

interface Props {
  patient?: Patient
  onSave: (values: PatientFormValues) => void
  onCancel: () => void
  onDelete?: () => void
}

export function PatientForm({ patient, onSave, onCancel, onDelete }: Props) {
  const [values, setValues] = useState<PatientFormValues>(() => valuesFrom(patient))
  const [error, setError] = useState<string | null>(null)
  const [conflictDay, setConflictDay] = useState<Weekday>('Mon')
  const [conflictStart, setConflictStart] = useState('12:00')
  const [conflictEnd, setConflictEnd] = useState('13:00')

  const set = <K extends keyof PatientFormValues>(key: K, val: PatientFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: val }))

  const toggleDay = (day: Weekday) => {
    set('availableDays', values.availableDays.includes(day) ? values.availableDays.filter((d) => d !== day) : [...values.availableDays, day])
  }

  const addConflict = () => {
    if (conflictStart >= conflictEnd) return setError('Conflict end time must be after start time.')
    setError(null)
    set('conflicts', [...values.conflicts, { id: newConflictId(), day: conflictDay, startTime: conflictStart, endTime: conflictEnd }])
  }

  const removeConflict = (id: string) => set('conflicts', values.conflicts.filter((c) => c.id !== id))

  const handleSubmit = () => {
    const initials = values.initials.trim().toUpperCase()
    if (!initials) return setError('Enter patient initials.')
    if (initials.length > 4) return setError('Keep initials short (4 characters or fewer) -- no full names.')
    if (!values.address.trim()) return setError('Enter a home address.')
    if (values.availableDays.length === 0) return setError('Pick at least one available day.')
    if (values.windowStart >= values.windowEnd) return setError('End time must be after start time.')
    setError(null)
    onSave({ ...values, initials })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-app">
      <header className="flex items-center justify-between px-4 py-4 border-b border-line-soft bg-surface">
        <button onClick={onCancel} className="text-accent font-semibold text-[16px] px-1">
          Cancel
        </button>
        <h1 className="text-[17px] font-bold text-ink">{patient ? 'Edit Patient' : 'New Patient'}</h1>
        <button onClick={handleSubmit} className="text-accent font-bold text-[16px] px-1">
          Save
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 pb-28">
        {error && <div className="bg-coral-50 text-danger text-[14px] font-medium rounded-xl px-4 py-3">{error}</div>}

        <div>
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Initials only -- no names</label>
          <input
            autoFocus
            value={values.initials}
            onChange={(e) => set('initials', e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="AB"
            className="w-full text-[28px] font-bold tracking-widest uppercase bg-surface rounded-2xl border border-line px-4 py-3 text-center focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Home address</label>
          <input
            value={values.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="123 Main St, Springfield, IL"
            className="w-full text-[16px] bg-surface rounded-2xl border border-line px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Visit duration</label>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_PRESETS.map((d) => (
              <button
                key={d}
                onClick={() => set('visitDuration', d)}
                className={`py-3 rounded-xl font-semibold text-[15px] border-2 ${
                  values.visitDuration === d ? 'bg-primary-600 border-primary-600 text-white' : 'bg-surface border-line text-ink'
                }`}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Available days</label>
          <div className="flex gap-1.5 flex-wrap">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`w-12 h-12 rounded-full font-bold text-[13px] border-2 ${
                  values.availableDays.includes(day) ? 'bg-primary-600 border-primary-600 text-white' : 'bg-surface border-line text-ink'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Visits needed per week</label>
          <div className="flex gap-1.5 flex-wrap">
            {VISITS_PER_WEEK_OPTIONS.map((n) => (
              <button
                key={n ?? 'any'}
                onClick={() => set('visitsPerWeek', n)}
                className={`px-4 py-2.5 rounded-xl font-semibold text-[14px] border-2 ${
                  values.visitsPerWeek === n ? 'bg-primary-600 border-primary-600 text-white' : 'bg-surface border-line text-ink'
                }`}
              >
                {n === null ? 'Any' : `${n}×`}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-subtle mt-1.5">
            If fewer than their available days, Build My Week automatically picks which specific days to see them.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Window start</label>
            <input
              type="time"
              value={values.windowStart}
              onChange={(e) => set('windowStart', e.target.value)}
              className="w-full text-[16px] bg-surface rounded-2xl border border-line px-3 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Window end</label>
            <input
              type="time"
              value={values.windowEnd}
              onChange={(e) => set('windowEnd', e.target.value)}
              className="w-full text-[16px] bg-surface rounded-2xl border border-line px-3 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Conflicts (blocked times)</label>
          {values.conflicts.length > 0 && (
            <div className="space-y-2 mb-2.5">
              {values.conflicts.map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-surface rounded-xl border border-line-soft px-3.5 py-2.5">
                  <span className="text-[14px] font-medium text-ink">
                    {c.day} · {formatTime(c.startTime)}–{formatTime(c.endTime)}
                  </span>
                  <button onClick={() => removeConflict(c.id)} className="text-danger text-[13px] font-bold px-1">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="bg-surface rounded-2xl border border-line-soft px-3 py-3 space-y-2.5">
            <select
              value={conflictDay}
              onChange={(e) => setConflictDay(e.target.value as Weekday)}
              className="w-full bg-app rounded-xl border border-line px-3 py-2.5 text-[14px] text-ink"
            >
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                value={conflictStart}
                onChange={(e) => setConflictStart(e.target.value)}
                className="w-full bg-app rounded-xl border border-line px-2 py-2.5 text-[14px] text-ink"
              />
              <input
                type="time"
                value={conflictEnd}
                onChange={(e) => setConflictEnd(e.target.value)}
                className="w-full bg-app rounded-xl border border-line px-2 py-2.5 text-[14px] text-ink"
              />
            </div>
            <button onClick={addConflict} className="w-full py-2.5 rounded-xl bg-primary-600 text-white font-bold text-[13.5px]">
              + Add conflict
            </button>
          </div>
          <p className="text-[12px] text-subtle mt-1.5">
            e.g. Tue 12:00–1:00 for a recurring lunch pickup. The route works around these automatically.
          </p>
        </div>

        <div>
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Scheduling priority</label>
          <div className="grid grid-cols-3 gap-2">
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => set('priority', opt.value)}
                className={`py-3 rounded-xl font-semibold text-[14px] border-2 flex items-center justify-center gap-1.5 ${
                  values.priority === opt.value ? 'bg-primary-600 border-primary-600 text-white' : 'bg-surface border-line text-ink'
                }`}
              >
                <span>{opt.dot}</span>
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-subtle mt-1.5">
            Who to call first when a make-up slot opens up. An administrative scheduling preference, not a clinical priority.
          </p>
        </div>

        <label className="flex items-center gap-3 bg-surface rounded-2xl border border-line-soft px-4 py-3.5">
          <input
            type="checkbox"
            checked={values.makeupAvailable}
            onChange={(e) => set('makeupAvailable', e.target.checked)}
            className="w-5 h-5 shrink-0 accent-primary-600"
          />
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold text-ink">Available for make-up visits</span>
            <span className="block text-[12.5px] text-muted">Can fill an opening from someone else's cancellation, even on a day they aren't normally scheduled.</span>
          </span>
        </label>

        <div>
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Scheduling notes (optional)</label>
          <textarea
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            placeholder="e.g. use side door, parent prefers mornings"
            className="w-full text-[16px] bg-surface rounded-2xl border border-line px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <p className="text-[12px] text-subtle mt-1.5">Scheduling logistics only -- never diagnoses, medical history, or PHI.</p>
        </div>

        {onDelete && (
          <button onClick={onDelete} className="w-full text-center text-danger font-semibold text-[15px] py-3">
            Delete patient
          </button>
        )}
      </div>
    </div>
  )
}
