import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { AddToHomeScreen } from '../components/settings/AddToHomeScreen'
import { buildDemoPatients } from '../lib/demoData'
import { removeStorage } from '../lib/storage'
import type { AppSettings, ThemeMode } from '../types'
import type { usePatients } from '../hooks/usePatients'

const SPEED_PRESETS: Array<{ label: string; value: number }> = [
  { label: 'Dense city', value: 18 },
  { label: 'Suburban', value: 26 },
  { label: 'Rural/highway', value: 38 },
]

const THEME_PRESETS: Array<{ label: string; value: ThemeMode; icon: string }> = [
  { label: 'Light', value: 'light', icon: '☀️' },
  { label: 'Dark', value: 'dark', icon: '🌙' },
  { label: 'System', value: 'system', icon: '⚙️' },
]

interface Props {
  settings: AppSettings
  updateSettings: (changes: Partial<AppSettings>) => void
  patientsApi: ReturnType<typeof usePatients>
}

export function SettingsPage({ settings, updateSettings, patientsApi }: Props) {
  const [demoLoaded, setDemoLoaded] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const handleLoadDemo = () => {
    patientsApi.importDemoPatients(buildDemoPatients())
    setDemoLoaded(true)
  }

  const handleReset = () => {
    removeStorage('patients')
    removeStorage('dayPlans')
    removeStorage('settings')
    removeStorage('geocodeCache')
    window.location.reload()
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="px-4 pt-6 pb-3">
        <h1 className="text-[24px] font-extrabold text-ink">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-6">
        <AddToHomeScreen />

        <section>
          <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Appearance</h2>
          <div className="flex gap-2">
            {THEME_PRESETS.map((t) => (
              <button
                key={t.value}
                onClick={() => updateSettings({ themeMode: t.value })}
                className={`flex-1 py-3 rounded-xl text-[13px] font-semibold border-2 flex items-center justify-center gap-1.5 ${
                  settings.themeMode === t.value ? 'bg-primary-600 border-primary-600 text-white' : 'bg-surface border-line text-ink'
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Home base address</h2>
          <input
            value={settings.homeAddress}
            onChange={(e) => updateSettings({ homeAddress: e.target.value })}
            placeholder="Where your day usually starts/ends"
            className="w-full text-[16px] bg-surface rounded-2xl border border-line px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <p className="text-[12.5px] text-muted mt-1.5">Used as the default start &amp; end location for new days.</p>
        </section>

        <section>
          <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Typical driving speed</h2>
          <div className="flex gap-2">
            {SPEED_PRESETS.map((s) => (
              <button
                key={s.value}
                onClick={() => updateSettings({ avgSpeedMph: s.value })}
                className={`flex-1 py-3 rounded-xl text-[13px] font-semibold border-2 ${
                  settings.avgSpeedMph === s.value ? 'bg-primary-600 border-primary-600 text-white' : 'bg-surface border-line text-ink'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-muted mt-1.5">Used to estimate drive times between visits when building your route.</p>
        </section>

        <section className="bg-mint-50 border border-mint-200 rounded-2xl px-4 py-4">
          <h2 className="text-[15px] font-bold text-accent mb-1.5">🔒 Privacy, by design</h2>
          <p className="text-[13.5px] text-ink leading-relaxed">
            This app is designed to store minimal scheduling information locally on your device. Do not enter protected health
            information. Patients are tracked by initials only -- no names, dates of birth, diagnoses, insurance, or medical
            history. All data lives in your browser's local storage; nothing is sent to a server or cloud database.
          </p>
        </section>

        <section>
          <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Demo data</h2>
          <div className="bg-surface rounded-2xl border border-line-soft px-4 py-4">
            <p className="text-[13.5px] text-muted mb-3">
              Load six fictional patients (AB, JS, MK, TR, LM, CD) with fake addresses to try building a route, hitting a
              schedule conflict, cancelling a visit, and rebuilding.
            </p>
            <Button variant="secondary" fullWidth onClick={handleLoadDemo} disabled={demoLoaded}>
              {demoLoaded ? '✓ Demo day loaded' : 'Load Demo Day'}
            </Button>
          </div>
        </section>

        <section>
          <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Data</h2>
          <div className="bg-surface rounded-2xl border border-line-soft px-4 py-4">
            {!confirmingReset ? (
              <Button variant="outline" fullWidth onClick={() => setConfirmingReset(true)}>
                Clear all local data
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-[13.5px] text-danger font-medium">
                  This permanently deletes every patient, route, and setting stored on this device. This can't be undone.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" fullWidth onClick={() => setConfirmingReset(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" fullWidth onClick={handleReset}>
                    Delete everything
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        <p className="text-center text-[12px] text-faint pt-2">Route Rabbit &middot; a free, tiny route-planning utility</p>
      </div>
    </div>
  )
}
