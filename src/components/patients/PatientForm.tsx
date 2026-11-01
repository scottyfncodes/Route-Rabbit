import { useCallback, useState } from 'react'
import { lookupAddress } from '../../lib/geocode'
import { formatTime, toMinutes } from '../../lib/time'
import { frequencyLabel, sameOption, visitOptionsOf } from '../../lib/visitOptions'
import {
  TWICE_A_MONTH,
  WEEKDAYS,
  type GeoPoint,
  type Patient,
  type PatientConflict,
  type PatientPriority,
  type VisitOption,
  type Weekday,
} from '../../types'
import { PriorityDot } from '../ui/PriorityDot'
import { PinPicker } from './PinPicker'

const DURATION_PRESETS = [15, 30, 45, 60, 75, 90]
const FREQUENCY_CHOICES: Array<{ value: number | null; label: string }> = [
  { value: TWICE_A_MONTH, label: '2× a month' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 3, label: '3×' },
  { value: 4, label: '4×' },
  { value: 5, label: '5×' },
  { value: null, label: 'Every available day' },
]

/** A sensible second option from the last one: half the length, twice as often (60 min 1× becomes 30 min 2×). */
function suggestNextOption(last: VisitOption | undefined): VisitOption {
  if (!last) return { duration: 45, perWeek: 1 }
  const half = DURATION_PRESETS.filter((d) => d <= last.duration / 2).pop() ?? DURATION_PRESETS[0]
  const base = last.perWeek === null || last.perWeek === TWICE_A_MONTH ? 1 : last.perWeek
  return { duration: half, perWeek: Math.min(5, base * 2) }
}
const PRIORITY_OPTIONS: Array<{ value: PatientPriority; label: string }> = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
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
  visitOptions: VisitOption[]
  conflicts: PatientConflict[]
  notes: string
  priority: PatientPriority
  makeupAvailable: boolean
  geo: GeoPoint | null
  matchedAddress: string | null
  geoExact: boolean
  geoConfirmed: boolean
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
      visitsPerWeek: 1,
      visitOptions: [{ duration: 45, perWeek: 1 }],
      conflicts: [],
      notes: '',
      priority: 'medium',
      makeupAvailable: false,
      geo: null,
      matchedAddress: null,
      geoExact: false,
      geoConfirmed: false,
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
    visitOptions: visitOptionsOf(patient),
    conflicts: patient.conflicts,
    notes: patient.notes ?? '',
    priority: patient.priority,
    makeupAvailable: patient.makeupAvailable,
    geo: patient.geo,
    matchedAddress: patient.matchedAddress ?? null,
    geoExact: patient.geoExact ?? false,
    geoConfirmed: patient.geoConfirmed ?? false,
  }
}

interface Props {
  patient?: Patient
  onSave: (values: PatientFormValues) => void
  onCancel: () => void
  onDelete?: () => void
  /** Where to drop a hand-placed pin when the address can't be found at all. */
  fallbackCenter?: GeoPoint | null
}

type LookupState = 'idle' | 'looking' | 'notFound'

export function PatientForm({ patient, onSave, onCancel, onDelete, fallbackCenter }: Props) {
  const [values, setValues] = useState<PatientFormValues>(() => valuesFrom(patient))
  // The address text the current pin belongs to. Editing the address clears the pin.
  const [pinFor, setPinFor] = useState<string | null>(() => (patient?.geo ? patient.address : null))
  const [lookup, setLookup] = useState<LookupState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [conflictDay, setConflictDay] = useState<Weekday>('Mon')
  const [conflictStart, setConflictStart] = useState('12:00')
  const [conflictEnd, setConflictEnd] = useState('13:00')
  // Which visit option is open for editing; the rest show as one-line summaries.
  const [openOption, setOpenOption] = useState(0)

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

  const setAddress = (address: string) => {
    setValues((prev) =>
      address.trim() === (pinFor ?? '').trim()
        ? { ...prev, address }
        : { ...prev, address, geo: null, matchedAddress: null, geoExact: false, geoConfirmed: false },
    )
    setLookup('idle')
  }

  const findOnMap = async () => {
    const address = values.address.trim()
    if (!address) return setError('Enter a home address.')
    setError(null)
    setLookup('looking')
    const match = await lookupAddress(address)
    setPinFor(values.address)
    if (!match) {
      setLookup('notFound')
      return
    }
    setLookup('idle')
    setValues((prev) => ({ ...prev, geo: match.geo, matchedAddress: match.matchedAddress, geoExact: match.exact, geoConfirmed: false }))
  }

  const placeByHand = () => {
    if (!fallbackCenter) return
    setPinFor(values.address)
    setLookup('idle')
    setValues((prev) => ({ ...prev, geo: fallbackCenter, matchedAddress: null, geoExact: false, geoConfirmed: false }))
  }

  const movePin = useCallback((geo: GeoPoint) => {
    setValues((prev) => ({ ...prev, geo, geoConfirmed: true }))
  }, [])

  const updateOption = (index: number, changes: Partial<VisitOption>) =>
    set(
      'visitOptions',
      values.visitOptions.map((o, i) => (i === index ? { ...o, ...changes } : o)),
    )

  const addOption = () => {
    const next = suggestNextOption(values.visitOptions[values.visitOptions.length - 1])
    set('visitOptions', [...values.visitOptions, next])
    setOpenOption(values.visitOptions.length)
  }

  const removeOption = (index: number) => {
    if (values.visitOptions.length <= 1) return
    set('visitOptions', values.visitOptions.filter((_, i) => i !== index))
    setOpenOption(0)
  }

  const removeConflict = (id: string) => set('conflicts', values.conflicts.filter((c) => c.id !== id))

  const handleSubmit = () => {
    const initials = values.initials.trim().toUpperCase()
    if (!initials) return setError('Enter patient initials.')
    if (initials.length > 4) return setError('Keep initials short (4 characters or fewer), no full names.')
    if (!values.address.trim()) return setError('Enter a home address.')
    if (values.availableDays.length === 0) return setError('Pick at least one available day.')
    if (values.windowStart >= values.windowEnd) return setError('End time must be after start time.')
    // Drop exact repeats, keeping the first of each.
    const options = values.visitOptions.filter((o, i) => values.visitOptions.findIndex((x) => sameOption(x, o)) === i)
    const longest = Math.max(...options.map((o) => o.duration))
    if (toMinutes(values.windowEnd) - toMinutes(values.windowStart) < longest) {
      return setError(`A ${longest}-min visit doesn't fit in a ${formatTime(values.windowStart)}–${formatTime(values.windowEnd)} window.`)
    }
    setError(null)
    onSave({ ...values, initials, visitOptions: options, visitDuration: options[0].duration, visitsPerWeek: options[0].perWeek })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-app">
      <header
        className="flex items-center justify-between px-4 pb-4 border-b border-line-soft bg-surface"
        style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}
      >
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
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Initials only, no names</label>
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
          <div className="flex gap-2">
            <input
              value={values.address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') findOnMap()
              }}
              placeholder="123 Main St, Denver, CO"
              className="flex-1 min-w-0 text-[16px] bg-surface rounded-2xl border border-line px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            {!values.geo && (
              <button
                onClick={findOnMap}
                disabled={lookup === 'looking' || !values.address.trim()}
                className="shrink-0 px-4 rounded-2xl bg-primary-600 text-white font-bold text-[14px] disabled:opacity-50"
              >
                {lookup === 'looking' ? 'Finding' : 'Find'}
              </button>
            )}
          </div>

          {lookup === 'notFound' && (
            <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3 text-[13px] text-warning leading-snug">
              Couldn't find that address. Check the spelling and include the city and state.
              {fallbackCenter && (
                <button onClick={placeByHand} className="block mt-1.5 font-bold text-accent">
                  Place the pin by hand
                </button>
              )}
            </div>
          )}

          {values.geo && (
            <div className="mt-2.5 space-y-2">
              <div className="bg-surface rounded-xl border border-line-soft px-3.5 py-3">
                <div className="text-[11.5px] font-bold text-label uppercase tracking-wide">Map match</div>
                <div className="text-[14px] text-ink leading-snug mt-0.5">{values.matchedAddress ?? 'Pin placed by hand'}</div>
                {!values.geoConfirmed && !values.geoExact && values.matchedAddress && (
                  <p className="text-[12.5px] text-warning mt-1 leading-snug">
                    Close, but not matched to the exact house. Drag the pin onto the right home.
                  </p>
                )}
              </div>
              <PinPicker key={pinFor ?? 'pin'} geo={values.geo} onMove={movePin} />
              {values.geoConfirmed ? (
                <p className="text-[12.5px] text-accent font-semibold">Pin confirmed. Drive times use this spot.</p>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12.5px] text-muted leading-snug">Drag the pin if it isn't on the house.</p>
                  <button
                    onClick={() => set('geoConfirmed', true)}
                    className="shrink-0 text-[13px] font-bold text-accent bg-primary-50 rounded-full px-3 py-1.5"
                  >
                    Pin is right
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">Visit length and frequency</label>
          <div className="space-y-2">
            {values.visitOptions.map((opt, i) => {
              const many = values.visitOptions.length > 1
              const tag = !many ? null : i === 0 ? 'First choice' : 'Or'
              if (i !== openOption) {
                return (
                  <button
                    key={i}
                    onClick={() => setOpenOption(i)}
                    className="w-full flex items-center justify-between gap-3 bg-surface rounded-xl border border-line-soft px-3.5 py-3 text-left"
                  >
                    <span className="min-w-0">
                      {tag && <span className="block text-[11.5px] font-bold text-label uppercase tracking-wide">{tag}</span>}
                      <span className="block text-[15px] font-semibold text-ink">
                        {opt.duration} min, {frequencyLabel(opt.perWeek)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-bold text-accent">Change</span>
                  </button>
                )
              }
              return (
                <div key={i} className="bg-surface rounded-2xl border-2 border-primary-600 px-3 py-3 space-y-3">
                  {many && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] font-bold text-label uppercase tracking-wide">{tag}</span>
                      <button onClick={() => removeOption(i)} className="text-danger text-[13px] font-bold px-1">
                        Remove
                      </button>
                    </div>
                  )}
                  <div>
                    <div className="text-[12.5px] font-semibold text-muted mb-1.5">Duration</div>
                    <div className="grid grid-cols-3 gap-2">
                      {DURATION_PRESETS.map((d) => (
                        <button
                          key={d}
                          onClick={() => updateOption(i, { duration: d })}
                          className={`py-2.5 rounded-xl font-semibold text-[15px] border-2 ${
                            opt.duration === d ? 'bg-primary-600 border-primary-600 text-white' : 'bg-app border-line text-ink'
                          }`}
                        >
                          {d} min
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-muted mb-1.5">Times per week</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {FREQUENCY_CHOICES.map((f) => (
                        <button
                          key={f.value ?? 'all'}
                          onClick={() => updateOption(i, { perWeek: f.value })}
                          className={`px-3.5 py-2.5 rounded-xl font-semibold text-[14px] border-2 ${
                            opt.perWeek === f.value ? 'bg-primary-600 border-primary-600 text-white' : 'bg-app border-line text-ink'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    {opt.perWeek === TWICE_A_MONTH && (
                      <p className="text-[12px] text-subtle mt-1.5">One visit every other week, starting this week.</p>
                    )}
                  </div>
                </div>
              )
            })}
            <button
              onClick={addOption}
              disabled={values.visitOptions.length >= 4}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-line text-accent font-bold text-[13.5px] disabled:opacity-40"
            >
              + Add another option
            </button>
          </div>
          <p className="text-[12px] text-subtle mt-1.5">
            {values.visitOptions.length > 1
              ? "Build My Week schedules the first choice, and switches to the next option when the first one won't fit that week."
              : 'If they can also be seen another way, like two 30 min visits instead of one hour, add it as another option.'}
          </p>
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
          <p className="text-[12px] text-subtle mt-1.5">
            When they need fewer visits than days they're open, Build My Week picks the same days every week.
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
                <PriorityDot priority={opt.value} className={values.priority === opt.value ? 'ring-2 ring-white' : ''} />
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-subtle mt-1.5">
            Whose schedule gets set first. High priority visits are planned before anyone else's and are never bumped for a lower priority patient. An administrative scheduling preference, not a clinical priority.
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
          <p className="text-[12px] text-subtle mt-1.5">Scheduling logistics only. Never diagnoses, medical history, or PHI.</p>
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
