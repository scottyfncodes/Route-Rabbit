import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

const PREFIX = 'routeRabbit:'

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Keys that hold the therapist's own data. A failed write to one of these is a lost change, not a lost cache entry. */
export const DATA_KEYS = ['patients', 'dayPlans', 'settings'] as const

let saveError: string | null = null
const failedKeys = new Set<string>()
const saveListeners = new Set<() => void>()
let askedForPersistence = false

function setSaveError(next: string | null): void {
  if (next === saveError) return
  saveError = next
  saveListeners.forEach((l) => l())
}

function describeSaveError(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return "This device is out of storage space for Route Rabbit, so your last change wasn't saved. Back up your data in Settings."
  }
  return "Route Rabbit couldn't save to this device, so your last change wasn't saved. Back up your data in Settings."
}

/** Ask the browser to keep this site's storage instead of clearing it under pressure or after a week away. Best effort. */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.().catch(() => {})
  } catch {
    // unsupported
  }
}

/** True when the browser has agreed to keep the data, null when it can't say. */
export async function isStoragePersisted(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return null
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}

/**
 * Write and read back. Returns whether the value is really on the device. A
 * failure on one of the therapist's own data keys is shown on every screen
 * (see useSaveError) until a later write to that key succeeds.
 */
export function writeStorage<T>(key: string, value: T): boolean {
  const isData = (DATA_KEYS as readonly string[]).includes(key)
  try {
    const text = JSON.stringify(value)
    window.localStorage.setItem(PREFIX + key, text)
    if (window.localStorage.getItem(PREFIX + key) !== text) throw new Error('read-back mismatch')
    if (isData) {
      failedKeys.delete(key)
      if (failedKeys.size === 0) setSaveError(null)
      if (!askedForPersistence) {
        askedForPersistence = true
        requestPersistentStorage()
      }
    }
    return true
  } catch (err) {
    // The session keeps working in memory; caches can fail quietly, the user's data can't.
    if (isData) {
      failedKeys.add(key)
      setSaveError(describeSaveError(err))
    }
    return false
  }
}

export function getSaveError(): string | null {
  return saveError
}

export function useSaveError(): string | null {
  return useSyncExternalStore(
    (l) => {
      saveListeners.add(l)
      return () => saveListeners.delete(l)
    },
    getSaveError,
    getSaveError,
  )
}

/** The raw stored text for a key, or null. Used by backup and restore so nothing is reshaped on the way out. */
export function readStorageText(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

/** Write raw text without the save-error bookkeeping; restore checks the result itself. */
export function writeStorageText(key: string, text: string | null): void {
  if (text === null) window.localStorage.removeItem(PREFIX + key)
  else window.localStorage.setItem(PREFIX + key, text)
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

/** React state that is persisted to localStorage under a fixed key. */
export function useStoredState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => readStorage(key, initial))

  useEffect(() => {
    writeStorage(key, state)
  }, [key, state])

  const setAndPersist = useCallback((value: T | ((prev: T) => T)) => {
    setState(value)
  }, [])

  return [state, setAndPersist]
}
