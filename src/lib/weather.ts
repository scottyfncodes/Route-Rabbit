import type { CurrentWeather, DayWeather, GeoPoint, WeatherForecast, WeatherImpact } from '../types'
import { readStorage, writeStorage } from './storage'

const CACHE_KEY = 'weatherCache'
const CACHE_TTL_MS = 20 * 60 * 1000 // 20 minutes -- weather doesn't need to be second-fresh

interface CodeInfo {
  label: string
  impact: WeatherImpact
}

/** WMO weather codes, as used by Open-Meteo's free forecast API. */
const CODE_MAP: Record<number, CodeInfo> = {
  0: { label: 'Clear', impact: 0 },
  1: { label: 'Mostly clear', impact: 0 },
  2: { label: 'Partly cloudy', impact: 0 },
  3: { label: 'Overcast', impact: 0 },
  45: { label: 'Fog', impact: 1 },
  48: { label: 'Freezing fog', impact: 1 },
  51: { label: 'Light drizzle', impact: 1 },
  53: { label: 'Drizzle', impact: 1 },
  55: { label: 'Heavy drizzle', impact: 1 },
  56: { label: 'Freezing drizzle', impact: 2 },
  57: { label: 'Freezing drizzle', impact: 2 },
  61: { label: 'Light rain', impact: 1 },
  63: { label: 'Rain', impact: 2 },
  65: { label: 'Heavy rain', impact: 2 },
  66: { label: 'Freezing rain', impact: 2 },
  67: { label: 'Freezing rain', impact: 2 },
  71: { label: 'Light snow', impact: 1 },
  73: { label: 'Snow', impact: 2 },
  75: { label: 'Heavy snow', impact: 2 },
  77: { label: 'Snow grains', impact: 1 },
  80: { label: 'Rain showers', impact: 1 },
  81: { label: 'Rain showers', impact: 2 },
  82: { label: 'Violent showers', impact: 2 },
  85: { label: 'Snow showers', impact: 2 },
  86: { label: 'Heavy snow showers', impact: 2 },
  95: { label: 'Thunderstorm', impact: 2 },
  96: { label: 'Thunderstorm w/ hail', impact: 2 },
  99: { label: 'Thunderstorm w/ hail', impact: 2 },
}

function codeInfo(code: number): CodeInfo {
  return CODE_MAP[code] ?? { label: 'Unknown', impact: 0 }
}

/** One-word condition for tight spots (forecast strip, week list), derived from the full label. */
export function shortCondition(label: string): string {
  if (/thunder/i.test(label)) return 'Storm'
  if (/snow/i.test(label)) return 'Snow'
  if (/rain|drizzle|shower/i.test(label)) return 'Rain'
  if (/fog/i.test(label)) return 'Fog'
  if (/overcast|cloudy/i.test(label)) return 'Cloudy'
  if (/clear/i.test(label)) return 'Clear'
  return ''
}

function cacheKeyFor(geo: GeoPoint): string {
  return `${geo.lat.toFixed(2)},${geo.lng.toFixed(2)}`
}

/** Human-readable heads-up for a route built on a day with reduced-visibility/wet-road conditions. */
export function weatherAdvisory(impact: WeatherImpact, label: string): string | null {
  if (impact === 2) return `${label} in the forecast: drive times increased for slower, wetter roads.`
  if (impact === 1) return `${label} in the forecast: drive times increased slightly.`
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
export async function fetchWeather(geo: GeoPoint, options: { force?: boolean } = {}): Promise<WeatherForecast | null> {
  const key = cacheKeyFor(geo)
  const cache = readStorage<Record<string, WeatherForecast>>(CACHE_KEY, {})
  const cached = cache[key]
  if (!options.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached

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
