import { useEffect } from 'react'
import type { ThemeMode } from '../types'

/** Keeps the document's `dark` class in sync with the chosen theme (and the OS setting, for 'system'). */
export function useTheme(mode: ThemeMode): void {
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const isDark = mode === 'dark' || (mode === 'system' && media.matches)
      root.classList.toggle('dark', isDark)
    }

    apply()

    if (mode === 'system') {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
  }, [mode])
}
