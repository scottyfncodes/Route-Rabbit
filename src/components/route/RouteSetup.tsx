import { Button } from '../ui/Button'
import { LocationInput } from './LocationInput'
import { formatTime } from '../../lib/time'
import type { DayPlan, Patient } from '../../types'

const LUNCH_DURATIONS = [20, 30, 45, 60]

interface Props {
  plan: DayPlan
  availableToday: Patient[]
  onUpdatePlan: (changes: Partial<DayPlan>) => void
  onTogglePatient: (id: string) => void
  onBuild: () => void
}

export function RouteSetup({ plan, availableToday, onUpdatePlan, onTogglePatient, onBuild }: Props) {
  const selectedCount = plan.patientIds.filter((id) => availableToday.some((p) => p.id === id)).length

  return (
    <div className="px-4 pb-32 space-y-5">
      <div className="grid grid-cols-1 gap-3">
        <LocationInput label="Start location" value={plan.startLocation} onChange={(loc) => onUpdatePlan({ startLocation: loc })} placeholder="Home address" />
        <LocationInput label="End location" value={plan.endLocation} onChange={(loc) => onUpdatePlan({ endLocation: loc })} placeholder="Home address" />
        <button
          onClick={() => onUpdatePlan({ endLocation: plan.startLocation })}
          className="text-primary-700 text-[13px] font-semibold text-left -mt-2"
        >
          End where I start
        </button>
      </div>

      <div>
        <label className="block text-[13px] font-bold text-[#4a5a57] mb-1.5 uppercase tracking-wide">Day starts at</label>
        <input
          type="time"
          value={plan.dayStartTime}
          onChange={(e) => onUpdatePlan({ dayStartTime: e.target.value })}
          className="w-full text-[16px] bg-white rounded-2xl border border-black/10 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </div>

      <div className="bg-white rounded-2xl border border-black/5 px-4 py-4">
        <label className="flex items-center justify-between mb-1">
          <span className="text-[15px] font-bold text-[#132825]">🍴 Lunch / break</span>
          <input
            type="checkbox"
            checked={plan.lunch.enabled}
            onChange={(e) => onUpdatePlan({ lunch: { ...plan.lunch, enabled: e.target.checked } })}
            className="w-5 h-5 accent-primary-600"
          />
        </label>
        {plan.lunch.enabled && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[12px] text-[#5c6966] mb-1">Earliest</span>
                <input
                  type="time"
                  value={plan.lunch.earliest}
                  onChange={(e) => onUpdatePlan({ lunch: { ...plan.lunch, earliest: e.target.value } })}
                  className="w-full text-[15px] bg-[#f5f6f4] rounded-xl border border-black/10 px-3 py-2.5"
                />
              </div>
              <div>
                <span className="block text-[12px] text-[#5c6966] mb-1">Latest</span>
                <input
                  type="time"
                  value={plan.lunch.latest}
                  onChange={(e) => onUpdatePlan({ lunch: { ...plan.lunch, latest: e.target.value } })}
                  className="w-full text-[15px] bg-[#f5f6f4] rounded-xl border border-black/10 px-3 py-2.5"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {LUNCH_DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => onUpdatePlan({ lunch: { ...plan.lunch, duration: d } })}
                  className={`flex-1 py-2 rounded-lg text-[13px] font-semibold border-2 ${
                    plan.lunch.duration === d ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-black/10 text-[#132825]'
                  }`}
                >
                  {d}m
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[15px] font-bold text-[#132825]">Who are you seeing?</h2>
          <span className="text-[13px] text-[#5c6966]">{selectedCount} selected</span>
        </div>
        {availableToday.length === 0 && (
          <p className="text-[14px] text-[#5c6966] bg-white rounded-2xl border border-black/5 px-4 py-4">
            No active patients are available on this day. Add patients or adjust their available days.
          </p>
        )}
        <div className="space-y-2">
          {availableToday.map((p) => {
            const checked = plan.patientIds.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => onTogglePatient(p.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left ${
                  checked ? 'bg-mint-50 border-primary-500' : 'bg-white border-black/5'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    checked ? 'bg-primary-600 border-primary-600' : 'border-black/20'
                  }`}
                >
                  {checked && <span className="text-white text-[13px] font-bold">✓</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[15px] text-[#132825]">{p.initials}</div>
                  <div className="text-[12.5px] text-[#5c6966] truncate">
                    {p.visitDuration} min · {formatTime(p.windowStart)}–{formatTime(p.windowEnd)}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="fixed left-0 right-0 bottom-16 max-w-[560px] mx-auto px-4">
        <Button size="lg" fullWidth disabled={selectedCount === 0} onClick={onBuild}>
          🐰 BUILD MY ROUTE
        </Button>
      </div>
    </div>
  )
}
