export type Tab = 'today' | 'patients' | 'weekly' | 'settings'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'today', label: 'Today', icon: '🗺️' },
  { key: 'patients', label: 'Patients', icon: '🧑‍⚕️' },
  { key: 'weekly', label: 'Weekly', icon: '📅' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
]

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="sticky bottom-0 left-0 right-0 bg-white border-t border-black/5 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 ${
            active === tab.key ? 'text-primary-700' : 'text-[#8b9592]'
          }`}
        >
          <span className="text-[20px] leading-none">{tab.icon}</span>
          <span className={`text-[11px] ${active === tab.key ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
