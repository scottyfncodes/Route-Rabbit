import { TWICE_A_MONTH, type Patient, type VisitOption } from '../types'
import { startOfWeek } from './time'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** A patient's visit options, first choice first. Older patients have exactly one, built from their single duration/frequency. */
export function visitOptionsOf(patient: Pick<Patient, 'visitDuration' | 'visitsPerWeek' | 'visitOptions'>): VisitOption[] {
  if (patient.visitOptions && patient.visitOptions.length > 0) return patient.visitOptions
  return [{ duration: patient.visitDuration, perWeek: patient.visitsPerWeek }]
}

/** The patient as the router should see them when scheduled with this option. */
export function withOption(patient: Patient, option: VisitOption): Patient {
  return { ...patient, visitDuration: option.duration, visitsPerWeek: option.perWeek }
}

export function frequencyLabel(perWeek: number | null): string {
  if (perWeek === null) return 'every available day'
  if (perWeek === TWICE_A_MONTH) return '2× a month'
  return `${perWeek}× a week`
}

export function optionLabel(option: VisitOption): string {
  return `${option.duration} min, ${frequencyLabel(option.perWeek)}`
}

export function sameOption(a: VisitOption, b: VisitOption): boolean {
  return a.duration === b.duration && a.perWeek === b.perWeek
}

/**
 * For twice-a-month patients: whether the week starting `weekStart` is one of their visit
 * weeks. Every other week, counted from the week they were added, so their first week is a
 * visit week and the rhythm never drifts.
 */
export function isVisitWeek(patient: Pick<Patient, 'createdAt'>, weekStart: string): boolean {
  const created = new Date(patient.createdAt)
  const createdDay = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`
  const anchor = new Date(`${startOfWeek(createdDay)}T00:00:00`).getTime()
  const week = new Date(`${startOfWeek(weekStart)}T00:00:00`).getTime()
  const weeks = Math.round((week - anchor) / WEEK_MS)
  return Math.abs(weeks) % 2 === 0
}
