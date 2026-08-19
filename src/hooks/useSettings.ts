import { useCallback, useEffect, useState } from 'react'
import { geocodeAddress } from '../lib/geocode'
import { readStorage, writeStorage } from '../lib/storage'
import type { AppSettings } from '../types'

const KEY = 'settings'

const DEFAULT_SETTINGS: AppSettings = {
  homeAddress: '',
  homeGeo: null,
  endAddress: '',
  endGeo: null,
  avgSpeedMph: 26,
  onboardingSeen: false,
  themeMode: 'system',
}

/** Fields whose geocoded companion (e.g. homeAddress -> homeGeo) should refresh when they change. */
const GEOCODE_FIELDS = [
  { address: 'homeAddress', geo: 'homeGeo' },
  { address: 'endAddress', geo: 'endGeo' },
] as const

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readStorage<Partial<AppSettings>>(KEY, {}),
  }))

  useEffect(() => {
    writeStorage(KEY, settings)
  }, [settings])

  const updateSettings = useCallback((changes: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...changes }
      for (const { address, geo } of GEOCODE_FIELDS) {
        const newAddress = changes[address]
        if (newAddress === undefined || newAddress === prev[address]) continue
        next[geo] = null
        if (!newAddress.trim()) continue
        geocodeAddress(newAddress).then((point) => {
          setSettings((cur) => (cur[address] === newAddress ? { ...cur, [geo]: point } : cur))
        })
      }
      return next
    })
  }, [])

  return { settings, updateSettings }
}
