import { useState } from 'react'
import { BottomNav, type Tab } from './components/layout/BottomNav'
import { PrivacyOnboarding } from './components/settings/PrivacyOnboarding'
import { HomePage } from './pages/HomePage'
import { TodayPage } from './pages/TodayPage'
import { PatientsPage } from './pages/PatientsPage'
import { WeeklyPage } from './pages/WeeklyPage'
import { SettingsPage } from './pages/SettingsPage'
import { usePatients } from './hooks/usePatients'
import { useSettings } from './hooks/useSettings'
import { useTheme } from './hooks/useTheme'
import { useSaveError } from './lib/storage'

/**
 * Each hook reads storage once when it mounts, so after a restore the whole
 * app is remounted to pick up the restored data, opening on Settings with the
 * result.
 */
export default function App() {
  const [generation, setGeneration] = useState(0)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)
  return (
    <AppScreens
      key={generation}
      initialTab={generation > 0 ? 'settings' : 'today'}
      restoreNotice={restoreNotice}
      onRestored={(notice) => {
        setRestoreNotice(notice)
        setGeneration((g) => g + 1)
      }}
    />
  )
}

interface AppScreensProps {
  initialTab: Tab
  restoreNotice: string | null
  onRestored: (notice: string) => void
}

function AppScreens({ initialTab, restoreNotice, onRestored }: AppScreensProps) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const saveError = useSaveError()
  // Set only when a specific day is opened from Weekly -- its overview lives outside the tab bar.
  const [dayView, setDayView] = useState<string | null>(null)
  const patientsApi = usePatients()
  const { settings, updateSettings } = useSettings()
  useTheme(settings.themeMode)

  const handleTabChange = (t: Tab) => {
    setDayView(null)
    setTab(t)
  }

  return (
    <>
      {!settings.onboardingSeen && <PrivacyOnboarding onDismiss={() => updateSettings({ onboardingSeen: true })} />}

      {saveError && (
        <p role="alert" className="mx-4 mt-3 rounded-xl border border-coral-100 bg-coral-50 px-4 py-3 text-[13.5px] font-medium text-danger">
          {saveError}
        </p>
      )}

      {dayView ? (
        <TodayPage
          key={dayView}
          patientsApi={patientsApi}
          settings={settings}
          date={dayView}
          onDateChange={setDayView}
          onBack={() => setDayView(null)}
          backLabel={tab === 'today' ? 'Home' : 'Week'}
        />
      ) : (
        <>
          {tab === 'today' && (
            <HomePage
              settings={settings}
              updateSettings={updateSettings}
              patientsApi={patientsApi}
              onNavigate={setTab}
              onOpenDay={setDayView}
            />
          )}
          {tab === 'patients' && <PatientsPage patientsApi={patientsApi} />}
          {tab === 'weekly' && <WeeklyPage onSelectDate={setDayView} patientsApi={patientsApi} settings={settings} />}
          {tab === 'settings' && (
            <SettingsPage
              settings={settings}
              updateSettings={updateSettings}
              restoreNotice={restoreNotice}
              onRestored={onRestored}
            />
          )}
        </>
      )}

      <BottomNav active={tab} onChange={handleTabChange} />
    </>
  )
}
