import { useCallback, useEffect, useState } from 'react'
import { fetchWeather } from '../lib/weather'
import type { GeoPoint, WeatherForecast } from '../types'

export function useWeather(geo: GeoPoint | null) {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!geo) {
      setForecast(null)
      return
    }
    setLoading(true)
    fetchWeather(geo).then((result) => {
      setForecast(result)
      setLoading(false)
    })
  }, [geo])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { forecast, loading, refresh }
}
