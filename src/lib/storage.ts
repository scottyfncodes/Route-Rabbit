import { useCallback, useEffect, useState } from 'react'

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

export function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // storage full or unavailable; silently ignore, data stays in-memory for this session
  }
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
