import { useMemo, useState } from 'react'
import { readWeekPlans } from '../hooks/useDayPlan'
import { addDays, formatDateHeading, startOfWeek, todayStr } from '../lib/time'

interface Props {
  onSelectDate: (date: string) => void
}

export function WeeklyPage({ onSelectDate }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayStr()))
  const plans = useMemo(() => readWeekPlans(), [weekStart])
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = todayStr()

  const totalVisits = days.reduce((sum, d) => {
    const plan = plans[d]
    if (!plan) return sum
    return sum + plan.patientIds.filter((id) => !plan.cancelledPatientIds.includes(id)).length
  }, 0)

  return (
    <div className="flex-1 flex flex-col">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="w-9 h-9 flex items-center justify-center text-[20px] text-accent">
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-[19px] font-extrabold text-ink">Week of {formatDateHeading(weekStart)}</h1>
          <p className="text-[12.5px] text-muted">{totalVisits} visits planned</p>
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="w-9 h-9 flex items-center justify-center text-[20px] text-accent">
          ›
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2.5">
        {days.map((d) => {
          const plan = plans[d]
          const visitCount = plan ? plan.patientIds.filter((id) => !plan.cancelledPatientIds.includes(id)).length : 0
          const built = Boolean(plan?.result)
          const isToday = d === today

          return (
            <button
              key={d}
              onClick={() => onSelectDate(d)}
              className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border-2 text-left ${
                isToday ? 'bg-mint-50 border-primary-400' : 'bg-surface border-line-soft'
              }`}
            >
              <div>
                <div className="font-bold text-[16px] text-ink">{formatDateHeading(d)}</div>
                <div className="text-[13px] text-muted">
                  {visitCount === 0 ? 'No visits planned' : `${visitCount} visit${visitCount === 1 ? '' : 's'}`}
                  {built && plan?.result ? ` · ${plan.result.efficiency}% efficient` : ''}
                </div>
              </div>
              <span className="text-[20px] text-faint">›</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
