import type { CurrentWeather, DayWeather, GeoPoint, WeatherForecast, WeatherImpact } from '../types'
import { readStorage, writeStorage } from './storage'

const CACHE_KEY = 'weatherCache'
const CACHE_TTL_MS = 20 * 60 * 1000 // 20 minutes -- weather doesn't need to be second-fresh

interface CodeInfo {
  icon: string
  label: string
  impact: WeatherImpact
}

/** WMO weather codes, as used by Open-Meteo's free forecast API. */
const CODE_MAP: Record<number, CodeInfo> = {
  0: { icon: '☀️', label: 'Clear', impact: 0 },
  1: { icon: '🌤️', label: 'Mostly clear', impact: 0 },
  2: { icon: '⛅', label: 'Partly cloudy', impact: 0 },
  3: { icon: '☁️', label: 'Overcast', impact: 0 },
  45: { icon: '🌫️', label: 'Fog', impact: 1 },
  48: { icon: '🌫️', label: 'Freezing fog', impact: 1 },
  51: { icon: '🌦️', label: 'Light drizzle', impact: 1 },
  53: { icon: '🌦️', label: 'Drizzle', impact: 1 },
  55: { icon: '🌦️', label: 'Heavy drizzle', impact: 1 },
  56: { icon: '🌧️', label: 'Freezing drizzle', impact: 2 },
  57: { icon: '🌧️', label: 'Freezing drizzle', impact: 2 },
  61: { icon: '🌧️', label: 'Light rain', impact: 1 },
  63: { icon: '🌧️', label: 'Rain', impact: 2 },
  65: { icon: '🌧️', label: 'Heavy rain', impact: 2 },
  66: { icon: '🌧️', label: 'Freezing rain', impact: 2 },
  67: { icon: '🌧️', label: 'Freezing rain', impact: 2 },
  71: { icon: '❄️', label: 'Light snow', impact: 1 },
  73: { icon: '❄️', label: 'Snow', impact: 2 },
  75: { icon: '❄️', label: 'Heavy snow', impact: 2 },
  77: { icon: '❄️', label: 'Snow grains', impact: 1 },
  80: { icon: '🌦️', label: 'Rain showers', impact: 1 },
  81: { icon: '🌧️', label: 'Rain showers', impact: 2 },
  82: { icon: '🌧️', label: 'Violent showers', impact: 2 },
  85: { icon: '🌨️', label: 'Snow showers', impact: 2 },
  86: { icon: '🌨️', label: 'Heavy snow showers', impact: 2 },
  95: { icon: '⛈️', label: 'Thunderstorm', impact: 2 },
  96: { icon: '⛈️', label: 'Thunderstorm w/ hail', impact: 2 },
  99: { icon: '⛈️', label: 'Thunderstorm w/ hail', impact: 2 },
}

function codeInfo(code: number): CodeInfo {
  return CODE_MAP[code] ?? { icon: '🌡️', label: 'Unknown', impact: 0 }
}

function cacheKeyFor(geo: GeoPoint): string {
  return `${geo.lat.toFixed(2)},${geo.lng.toFixed(2)}`
}

/** Human-readable heads-up for a route built on a day with reduced-visibility/wet-road conditions. */
export function weatherAdvisory(impact: WeatherImpact, label: string): string | null {
  if (impact === 2) return `${label} in the forecast -- drive times increased for slower, wetter roads.`
  if (impact === 1) return `${label} in the forecast -- drive times increased slightly.`
  return null
}

export function speedMultiplierFor(impact: WeatherImpact): number {
  if (impact === 2) return 0.82
  if (impact === 1) return 0.92
  return 1
}

/**
 * Current conditions plus an ~8-day daily outlook (keyed by date) from Open-Meteo --
 * a free, no-API-key weather service. Results are cached in localStorage for a
 * short while so the dashboard and route builder don't refetch on every render.
 */
export async function fetchWeather(geo: GeoPoint): Promise<WeatherForecast | null> {
  const key = cacheKeyFor(geo)
  const cache = readStorage<Record<string, WeatherForecast>>(CACHE_KEY, {})
  const cached = cache[key]
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached

  try {
    const params = new URLSearchParams({
      latitude: String(geo.lat),
      longitude: String(geo.lng),
      current: 'temperature_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      temperature_unit: 'fahrenheit',
      timezone: 'auto',
      forecast_days: '8',
    })
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
    if (!res.ok) return cached ?? null
    const data = await res.json()

    const currentInfo = codeInfo(data.current.weather_code)
    const current: CurrentWeather = {
      tempF: Math.round(data.current.temperature_2m),
      icon: currentInfo.icon,
      label: currentInfo.label,
      impact: currentInfo.impact,
    }

    const daily: Record<string, DayWeather> = {}
    const dates: string[] = data.daily.time
    dates.forEach((date, i) => {
      const info = codeInfo(data.daily.weather_code[i])
      daily[date] = {
        date,
        tempMaxF: Math.round(data.daily.temperature_2m_max[i]),
        tempMinF: Math.round(data.daily.temperature_2m_min[i]),
        icon: info.icon,
        label: info.label,
        impact: info.impact,
      }
    })

    const forecast: WeatherForecast = { fetchedAt: Date.now(), current, daily }
    const updatedCache = readStorage<Record<string, WeatherForecast>>(CACHE_KEY, {})
    updatedCache[key] = forecast
    writeStorage(CACHE_KEY, updatedCache)
    return forecast
  } catch {
    return cached ?? null
  }
}
