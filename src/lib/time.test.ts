import { describe, expect, it } from 'vitest'
import { addDays, formatDays, formatDuration, formatTime, fromMinutes, startOfWeek, toMinutes, weekdayOf } from './time'

describe('time helpers', () => {
  it('round-trips HH:MM and minutes', () => {
    expect(toMinutes('08:30')).toBe(510)
    expect(fromMinutes(510)).toBe('08:30')
    expect(fromMinutes(-5)).toBe('00:00')
    expect(fromMinutes(24 * 60 + 30)).toBe('23:59')
  })

  it('formats 12-hour times and durations', () => {
    expect(formatTime('00:05')).toBe('12:05 AM')
    expect(formatTime('12:00')).toBe('12:00 PM')
    expect(formatTime('13:45')).toBe('1:45 PM')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(120)).toBe('2h')
    expect(formatDuration(95)).toBe('1h 35m')
  })

  it('handles dates across month boundaries and finds the week start', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01')
    expect(weekdayOf('2025-01-06')).toBe('Mon')
    expect(startOfWeek('2025-01-12')).toBe('2025-01-06') // Sunday belongs to the week that started Monday
    expect(startOfWeek('2025-01-06')).toBe('2025-01-06')
  })

  it('summarizes day sets compactly', () => {
    expect(formatDays([])).toBe('No days selected')
    expect(formatDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])).toBe('Mon–Fri')
    expect(formatDays(['Fri', 'Mon', 'Tue', 'Wed'])).toBe('Mon–Wed, Fri')
  })
})
