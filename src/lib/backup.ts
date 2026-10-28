import { DATA_KEYS, readStorageText, writeStorageText } from './storage'
import { WEEKDAYS } from '../types'

/**
 * Backup and restore of everything the therapist has entered: the patient
 * list, every saved day plan, and settings. The geocode and weather caches are
 * left out; they refill themselves.
 *
 * A backup holds patient initials and home addresses, so the UI warns before
 * writing one.
 */

export const BACKUP_APP = 'route-rabbit'
export const BACKUP_VERSION = 1
const LAST_BACKUP_KEY = 'routeRabbit:lastBackupAt'

export interface BackupData {
  patients: unknown[]
  dayPlans: Record<string, unknown>
  settings: Record<string, unknown>
}

export interface BackupFile {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  exportedAt: string
  data: BackupData
}

export interface BackupSummary {
  exportedAt: string
  patients: number
  dayPlans: number
}

function readJson(key: string): unknown {
  const text = readStorageText(key)
  if (text == null) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Everything on this device, as it is stored. */
export function buildBackup(now: Date): BackupFile {
  const patients = readJson('patients')
  const dayPlans = readJson('dayPlans')
  const settings = readJson('settings')
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      patients: Array.isArray(patients) ? patients : [],
      dayPlans: isObject(dayPlans) ? dayPlans : {},
      settings: isObject(settings) ? settings : {},
    },
  }
}

export function backupFilename(now: Date): string {
  return `route-rabbit-backup-${now.toISOString().slice(0, 10)}.json`
}

export function summarize(data: BackupData, exportedAt: string): BackupSummary {
  return { exportedAt, patients: data.patients.length, dayPlans: Object.keys(data.dayPlans).length }
}

// ---------------------------------------------------------------- validation

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isStrList = (v: unknown) => Array.isArray(v) && v.every(isStr)
const isGeo = (v: unknown) => isObject(v) && isNum(v.lat) && isNum(v.lng)
const isGeoOrNull = (v: unknown) => v === null || isGeo(v)
const isLocation = (v: unknown) => isObject(v) && isStr(v.label) && isStr(v.address) && isGeoOrNull(v.geo)
const isWeekday = (v: unknown) => (WEEKDAYS as unknown[]).includes(v)
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v)
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function validPatient(p: unknown): boolean {
  return (
    isObject(p) &&
    isStr(p.id) &&
    isStr(p.initials) &&
    isStr(p.address) &&
    isGeoOrNull(p.geo) &&
    isNum(p.visitDuration) &&
    Array.isArray(p.availableDays) &&
    p.availableDays.every(isWeekday) &&
    isStr(p.windowStart) &&
    isStr(p.windowEnd) &&
    (p.status === 'active' || p.status === 'inactive') &&
    isNum(p.createdAt) &&
    // Fields added after launch: older saved patients may not have them yet.
    optional(p.visitsPerWeek, (v) => v === null || isNum(v)) &&
    optional(
      p.conflicts,
      (v) =>
        Array.isArray(v) &&
        v.every((c) => isObject(c) && isStr(c.id) && isWeekday(c.day) && isStr(c.startTime) && isStr(c.endTime)),
    ) &&
    optional(p.priority, (v) => v === 'high' || v === 'medium' || v === 'low') &&
    optional(p.makeupAvailable, isBool) &&
    optional(p.notes, isStr)
  )
}

function validPlan(date: string, p: unknown): boolean {
  return (
    DATE_KEY.test(date) &&
    isObject(p) &&
    p.date === date &&
    isStr(p.dayStartTime) &&
    isLocation(p.startLocation) &&
    isLocation(p.endLocation) &&
    isStrList(p.patientIds) &&
    isStrList(p.cancelledPatientIds) &&
    optional(p.makeupPatientIds, isStrList) &&
    isObject(p.lunch) &&
    isBool(p.lunch.enabled) &&
    isStr(p.lunch.earliest) &&
    isStr(p.lunch.latest) &&
    isNum(p.lunch.duration) &&
    (p.currentLocationOverride === null || p.currentLocationOverride === undefined || isLocation(p.currentLocationOverride)) &&
    (p.activeStopId === null || p.activeStopId === undefined || isStr(p.activeStopId)) &&
    (p.result === null || p.result === undefined || (isObject(p.result) && Array.isArray(p.result.stops)))
  )
}

function validSettings(s: Record<string, unknown>): boolean {
  return (
    optional(s.homeAddress, isStr) &&
    optional(s.homeGeo, isGeoOrNull) &&
    optional(s.endAddress, isStr) &&
    optional(s.endGeo, isGeoOrNull) &&
    optional(s.avgSpeedMph, isNum) &&
    optional(s.onboardingSeen, isBool) &&
    optional(s.themeMode, (v) => v === 'light' || v === 'dark' || v === 'system')
  )
}

export type ParsedBackup = { ok: true; data: BackupData; summary: BackupSummary } | { ok: false; error: string }

/**
 * Check a backup file completely before anything is written. One damaged
 * patient or day rejects the whole file, so a restore never applies half a
 * backup.
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't valid JSON." }
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) return { ok: false, error: "That file isn't a Route Rabbit backup." }
  if (raw.version !== BACKUP_VERSION) {
    return {
      ok: false,
      error: `This backup is format ${String(raw.version)}, and this version of Route Rabbit reads format ${BACKUP_VERSION}.`,
    }
  }
  if (!isStr(raw.exportedAt) || Number.isNaN(Date.parse(raw.exportedAt))) {
    return { ok: false, error: "The backup's date is damaged." }
  }
  const data = raw.data
  if (!isObject(data)) return { ok: false, error: 'The backup has no data in it.' }
  const unknown = Object.keys(data).find((k) => !(DATA_KEYS as readonly string[]).includes(k))
  if (unknown) return { ok: false, error: `The backup has a section this version doesn't know ("${unknown}").` }
  if (!Array.isArray(data.patients)) return { ok: false, error: "The backup's patient list is damaged." }
  const badPatient = data.patients.findIndex((p) => !validPatient(p))
  if (badPatient >= 0) return { ok: false, error: `Patient ${badPatient + 1} in the backup is damaged.` }
  if (!isObject(data.dayPlans)) return { ok: false, error: "The backup's day plans are damaged." }
  const badDay = Object.entries(data.dayPlans).find(([date, plan]) => !validPlan(date, plan))
  if (badDay) return { ok: false, error: `The plan for ${badDay[0]} in the backup is damaged.` }
  if (!isObject(data.settings) || !validSettings(data.settings)) return { ok: false, error: "The backup's settings are damaged." }

  const clean: BackupData = { patients: data.patients, dayPlans: data.dayPlans, settings: data.settings }
  return { ok: true, data: clean, summary: summarize(clean, raw.exportedAt) }
}

// ------------------------------------------------------------------- restore

export type RestoreResult = { ok: true } | { ok: false; error: string }

const RESTORE_FAILED = "The backup couldn't be saved on this device, so nothing was changed."

/**
 * Replace the patient list, day plans and settings with a checked backup.
 * Every key is written, then read back and compared. If any write fails or
 * reads back differently, the previous contents are put back.
 */
export function restoreBackup(data: BackupData): RestoreResult {
  const next: Record<string, string> = {
    patients: JSON.stringify(data.patients),
    dayPlans: JSON.stringify(data.dayPlans),
    settings: JSON.stringify(data.settings),
  }
  const previous = Object.fromEntries(DATA_KEYS.map((k) => [k, readStorageText(k)]))
  try {
    for (const key of DATA_KEYS) writeStorageText(key, next[key])
    if (DATA_KEYS.some((key) => readStorageText(key) !== next[key])) throw new Error('read-back mismatch')
    return { ok: true }
  } catch {
    try {
      for (const key of DATA_KEYS) writeStorageText(key, previous[key])
    } catch {
      // Putting it back failed too. Nothing more can be done from here.
    }
    return { ok: false, error: RESTORE_FAILED }
  }
}

// --------------------------------------------------------------- last backup

export function readLastBackupAt(): string | null {
  try {
    return window.localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

export function markBackedUp(at: Date): void {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, at.toISOString())
  } catch {
    // Only the reminder is lost; the backup file itself was already handed over.
  }
}

// --------------------------------------------------------------- file output

export type SaveFileResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hand the file over. An iPhone Home Screen app opens a blob link in a viewer
 * with no obvious way out, so where the share sheet accepts files it is used
 * instead (Save to Files, AirDrop, Mail). A cancelled share sheet comes back
 * as 'cancelled' so the caller never claims a file was saved. Other failures
 * throw.
 */
export async function saveFile(filename: string, text: string): Promise<SaveFileResult> {
  const file = new File([text], filename, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (err) {
      if ((err as { name?: unknown } | null)?.name === 'AbortError') return 'cancelled'
      throw err
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking straight away can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
