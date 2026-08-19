import { useCallback, useEffect, useState } from 'react'
import { geocodeAddress } from '../lib/geocode'
import { readStorage, writeStorage } from '../lib/storage'
import type { AppSettings } from '../types'

const KEY = 'settings'

const DEFAULT_SETTINGS: AppSettings = {
  homeAddress: '',
  homeGeo: null,
  avgSpeedMph: 26,
  onboardingSeen: false,
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => readStorage<AppSettings>(KEY, DEFAULT_SETTINGS))

  useEffect(() => {
    writeStorage(KEY, settings)
  }, [settings])

  const updateSettings = useCallback((changes: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...changes }
      if (changes.homeAddress !== undefined && changes.homeAddress !== prev.homeAddress) {
        next.homeGeo = null
        geocodeAddress(changes.homeAddress).then((geo) => {
          setSettings((cur) => (cur.homeAddress === changes.homeAddress ? { ...cur, homeGeo: geo } : cur))
        })
      }
      return next
    })
  }, [])

  return { settings, updateSettings }
}
