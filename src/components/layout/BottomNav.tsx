import type { ComponentType } from 'react'
import { RabbitWheelIcon } from '../ui/RabbitWheelIcon'
import { PatientsIcon, SettingsIcon, WeekIcon } from '../ui/NavIcons'

export type Tab = 'today' | 'patients' | 'weekly' | 'settings'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

const TABS: Array<{ key: Tab; label: string; Icon: ComponentType<{ className?: string }> }> = [
  { key: 'today', label: 'Home', Icon: RabbitWheelIcon },
  { key: 'patients', label: 'Patients', Icon: PatientsIcon },
  { key: 'weekly', label: 'Weekly', Icon: WeekIcon },
  { key: 'settings', label: 'Settings', Icon: SettingsIcon },
]

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="sticky bottom-0 left-0 right-0 bg-surface border-t border-line-soft flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 ${
            active === tab.key ? 'text-accent' : 'text-faint'
          }`}
        >
          <tab.Icon className="w-[22px] h-[22px]" />
          <span className={`text-[11px] ${active === tab.key ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
