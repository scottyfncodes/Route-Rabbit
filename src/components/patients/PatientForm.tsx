import { useState } from 'react'
import { WEEKDAYS, type Patient, type Weekday } from '../../types'

const DURATION_PRESETS = [15, 30, 45, 60, 75, 90]

export interface PatientFormValues {
  initials: string
  address: string
  visitDuration: number
  availableDays: Weekday[]
  windowStart: string
  windowEnd: string
  notes: string
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
      notes: '',
    }
  }
  return {
    initials: patient.initials,
    address: patient.address,
    visitDuration: patient.visitDuration,
    availableDays: patient.availableDays,
    windowStart: patient.windowStart,
    windowEnd: patient.windowEnd,
    notes: patient.notes ?? '',
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

  const set = <K extends keyof PatientFormValues>(key: K, val: PatientFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: val }))

  const toggleDay = (day: Weekday) => {
    set('availableDays', values.availableDays.includes(day) ? values.availableDays.filter((d) => d !== day) : [...values.availableDays, day])
  }

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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f5f6f4]">
      <header className="flex items-center justify-between px-4 py-4 border-b border-black/5 bg-white">
        <button onClick={onCancel} className="text-primary-700 font-semibold text-[16px] px-1">
          Cancel
        </button>
        <h1 className="text-[17px] font-bold text-[#132825]">{patient ? 'Edit Patient' : 'New Patient'}</h1>
        <button onClick={handleSubmit} className="text-primary-700 font-bold text-[16px] px-1">
          Save
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 pb-28">
        {error && <div className="bg-coral-50 text-coral-700 text-[14px] font-medium rounded-xl px-4 py-3">{error}</div>}

        <div>
          <label className="block text-[13px] font-bold text-[#4a5a57] mb-1.5 uppercase tracking-wide">Initials only -- no names</label>
          <input
            autoFocus
            value={values.initials}
            onChange={(e) => set('initials', e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="AB"
            className="w-full text-[28px] font-bold tracking-widest uppercase bg-white rounded-2xl border border-black/10 px-4 py-3 text-center focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold text-[#4a5a57] mb-1.5 uppercase tracking-wide">Home address</label>
          <input
            value={values.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="123 Main St, Springfield, IL"
            className="w-full text-[16px] bg-white rounded-2xl border border-black/10 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold text-[#4a5a57] mb-1.5 uppercase tracking-wide">Visit duration</label>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_PRESETS.map((d) => (
              <button
                key={d}
                onClick={() => set('visitDuration', d)}
                className={`py-3 rounded-xl font-semibold text-[15px] border-2 ${
                  values.visitDuration === d ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-black/10 text-[#132825]'
                }`}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-bold text-[#4a5a57] mb-1.5 uppercase tracking-wide">Available days</label>
          <div className="flex gap-1.5 flex-wrap">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`w-12 h-12 rounded-full font-bold text-[13px] border-2 ${
                  values.availableDays.includes(day) ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-black/10 text-[#132825]'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-bold text-[#4a5a57] mb-1.5 uppercase tracking-wide">Window start</label>
            <input
              type="time"
              value={values.windowStart}
              onChange={(e) => set('windowStart', e.target.value)}
              className="w-full text-[16px] bg-white rounded-2xl border border-black/10 px-3 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#4a5a57] mb-1.5 uppercase tracking-wide">Window end</label>
            <input
              type="time"
              value={values.windowEnd}
              onChange={(e) => set('windowEnd', e.target.value)}
              className="w-full text-[16px] bg-white rounded-2xl border border-black/10 px-3 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-bold text-[#4a5a57] mb-1.5 uppercase tracking-wide">Scheduling notes (optional)</label>
          <textarea
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            placeholder="e.g. use side door, parent prefers mornings"
            className="w-full text-[16px] bg-white rounded-2xl border border-black/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <p className="text-[12px] text-[#6b7674] mt-1.5">Scheduling logistics only -- never diagnoses, medical history, or PHI.</p>
        </div>

        {onDelete && (
          <button onClick={onDelete} className="w-full text-center text-coral-600 font-semibold text-[15px] py-3">
            Delete patient
          </button>
        )}
      </div>
    </div>
  )
}
