import { useCallback, useEffect, useState } from 'react'
import { fetchWeather } from '../lib/weather'
import type { GeoPoint, WeatherForecast } from '../types'

interface Loaded {
  geoKey: string
  request: number
  forecast: WeatherForecast | null
}

const keyOf = (geo: GeoPoint) => `${geo.lat},${geo.lng}`

export function useWeather(geo: GeoPoint | null) {
  // Bumped by refresh(); any value above 0 skips the short-lived cache.
  const [request, setRequest] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!geo) return
    let cancelled = false
    fetchWeather(geo, { force: request > 0 }).then((forecast) => {
      // Drop responses for a location/request that has since been superseded.
      if (!cancelled) setLoaded({ geoKey: keyOf(geo), request, forecast })
    })
    return () => {
      cancelled = true
    }
  }, [geo, request])

  const geoKey = geo ? keyOf(geo) : null
  const matches = loaded !== null && loaded.geoKey === geoKey
  const forecast = matches ? loaded.forecast : null
  const loading = geoKey !== null && !(matches && loaded.request === request)
  const refresh = useCallback(() => setRequest((n) => n + 1), [])

  return { forecast, loading, refresh }
}
