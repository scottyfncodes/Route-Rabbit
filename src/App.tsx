import { useState } from 'react'
import { BottomNav, type Tab } from './components/layout/BottomNav'
import { PrivacyOnboarding } from './components/settings/PrivacyOnboarding'
import { TodayPage } from './pages/TodayPage'
import { PatientsPage } from './pages/PatientsPage'
import { WeeklyPage } from './pages/WeeklyPage'
import { SettingsPage } from './pages/SettingsPage'
import { usePatients } from './hooks/usePatients'
import { useSettings } from './hooks/useSettings'
import { todayStr } from './lib/time'

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [date, setDate] = useState(todayStr())
  const patientsApi = usePatients()
  const { settings, updateSettings } = useSettings()

  const goToDate = (d: string) => {
    setDate(d)
    setTab('today')
  }

  return (
    <>
      {!settings.onboardingSeen && <PrivacyOnboarding onDismiss={() => updateSettings({ onboardingSeen: true })} />}

      {tab === 'today' && <TodayPage patientsApi={patientsApi} settings={settings} date={date} onDateChange={setDate} />}
      {tab === 'patients' && <PatientsPage patientsApi={patientsApi} />}
      {tab === 'weekly' && <WeeklyPage onSelectDate={goToDate} />}
      {tab === 'settings' && <SettingsPage settings={settings} updateSettings={updateSettings} patientsApi={patientsApi} />}

      <BottomNav active={tab} onChange={setTab} />
    </>
  )
}
