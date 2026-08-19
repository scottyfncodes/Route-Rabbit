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

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
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

      {dayView ? (
        <TodayPage
          patientsApi={patientsApi}
          settings={settings}
          date={dayView}
          onDateChange={setDayView}
          onBack={() => setDayView(null)}
        />
      ) : (
        <>
          {tab === 'today' && (
            <HomePage settings={settings} updateSettings={updateSettings} patientsApi={patientsApi} onNavigate={setTab} />
          )}
          {tab === 'patients' && <PatientsPage patientsApi={patientsApi} />}
          {tab === 'weekly' && <WeeklyPage onSelectDate={setDayView} patientsApi={patientsApi} settings={settings} />}
          {tab === 'settings' && <SettingsPage settings={settings} updateSettings={updateSettings} />}
        </>
      )}

      <BottomNav active={dayView ? 'weekly' : tab} onChange={handleTabChange} />
    </>
  )
}
