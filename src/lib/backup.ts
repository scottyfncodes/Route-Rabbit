// Backup to a file and restore from one. Everything Route Rabbit knows lives in this
// phone's browser storage, so a lost or reset phone means a lost caseload unless there's
// a copy. No cloud: the file goes wherever the therapist saves it.

import { readStorage, writeStorage } from './storage'

/** What gets saved. Caches (addresses, drive times, weather) are left out; they rebuild themselves. */
export const BACKUP_KEYS = ['patients', 'dayPlans', 'settings'] as const
type BackupKey = (typeof BACKUP_KEYS)[number]

const APP_ID = 'route-rabbit'
const FORMAT_VERSION = 1
const META_KEY = 'backupMeta'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SNOOZE_MS = 2 * 24 * 60 * 60 * 1000

export interface BackupFile {
  app: typeof APP_ID
  version: number
  exportedAt: string
  data: {
    patients: unknown[]
    dayPlans: Record<string, unknown>
    settings: Record<string, unknown>
  }
}

/** Storage access, injectable so tests don't need a browser. */
export interface KeyValueStore {
  get: (key: BackupKey) => unknown
  set: (key: BackupKey, value: unknown) => void
}

export const browserStore: KeyValueStore = {
  get: (key) => readStorage<unknown>(key, undefined),
  set: (key, value) => writeStorage(key, value),
}

export function createBackup(store: KeyValueStore = browserStore, now = new Date()): BackupFile {
  const patients = store.get('patients')
  const dayPlans = store.get('dayPlans')
  const settings = store.get('settings')
  return {
    app: APP_ID,
    version: FORMAT_VERSION,
    exportedAt: now.toISOString(),
    data: {
      patients: Array.isArray(patients) ? patients : [],
      dayPlans: isPlainObject(dayPlans) ? dayPlans : {},
      settings: isPlainObject(settings) ? settings : {},
    },
  }
}

export function backupFileName(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `route-rabbit-backup-${y}-${m}-${d}.json`
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export type ParseResult = { ok: true; backup: BackupFile; patientCount: number; dayCount: number } | { ok: false; error: string }

/**
 * Reads a backup file's text and checks it really is one, before anything on the phone
 * is touched. A wrong or damaged file is refused with a plain reason.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "This file isn't a Route Rabbit backup (it couldn't be read)." }
  }
  if (!isPlainObject(raw) || raw.app !== APP_ID || !isPlainObject(raw.data)) {
    return { ok: false, error: "This file isn't a Route Rabbit backup." }
  }
  if (typeof raw.version !== 'number' || raw.version > FORMAT_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Route Rabbit. Reload the app and try again.' }
  }

  const { patients, dayPlans, settings } = raw.data
  if (!Array.isArray(patients)) return { ok: false, error: 'This backup is missing its patient list.' }
  const badPatient = patients.find(
    (p) => !isPlainObject(p) || typeof p.id !== 'string' || typeof p.initials !== 'string' || typeof p.address !== 'string',
  )
  if (badPatient !== undefined) return { ok: false, error: 'This backup has a damaged patient entry, so nothing was changed.' }
  if (dayPlans !== undefined && !isPlainObject(dayPlans)) return { ok: false, error: 'This backup has damaged route data.' }
  if (settings !== undefined && !isPlainObject(settings)) return { ok: false, error: 'This backup has damaged settings.' }

  const backup: BackupFile = {
    app: APP_ID,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    data: { patients, dayPlans: dayPlans ?? {}, settings: settings ?? {} },
  }
  return { ok: true, backup, patientCount: patients.length, dayCount: Object.keys(backup.data.dayPlans).length }
}

/** Replaces what's on the phone with the backup's contents. */
export function applyBackup(backup: BackupFile, store: KeyValueStore = browserStore): void {
  store.set('patients', backup.data.patients)
  store.set('dayPlans', backup.data.dayPlans)
  // The privacy notice was already seen on whatever phone made the backup.
  store.set('settings', { ...backup.data.settings, onboardingSeen: true })
}

export interface BackupMeta {
  lastBackupAt: number | null
  snoozedUntil: number | null
}

export function readBackupMeta(): BackupMeta {
  return { lastBackupAt: null, snoozedUntil: null, ...readStorage<Partial<BackupMeta>>(META_KEY, {}) }
}

export function writeBackupMeta(changes: Partial<BackupMeta>): BackupMeta {
  const next = { ...readBackupMeta(), ...changes }
  writeStorage(META_KEY, next)
  return next
}

/**
 * A gentle weekly nudge: due once there are patients to lose and it's been a week since
 * the last backup (or there's never been one), unless "Later" was tapped in the last two days.
 */
export function isBackupDue(meta: BackupMeta, patientCount: number, now = Date.now()): boolean {
  if (patientCount === 0) return false
  if (meta.snoozedUntil && now < meta.snoozedUntil) return false
  return meta.lastBackupAt === null || now - meta.lastBackupAt >= WEEK_MS
}

export function snoozeUntil(now = Date.now()): number {
  return now + SNOOZE_MS
}

/**
 * Hands the backup file to the phone. On phones that support it this opens the share
 * sheet (Save to Files, AirDrop, email to yourself); otherwise it downloads the file.
 * Returns false if the therapist backed out of the share sheet.
 */
export async function saveBackupFile(backup: BackupFile = createBackup()): Promise<boolean> {
  const name = backupFileName()
  const json = JSON.stringify(backup, null, 2)
  const file = new File([json], name, { type: 'application/json' })

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Route Rabbit backup' })
      writeBackupMeta({ lastBackupAt: Date.now(), snoozedUntil: null })
      return true
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false
      // Share sheet failed for another reason; fall through to a plain download.
    }
  }

  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  writeBackupMeta({ lastBackupAt: Date.now(), snoozedUntil: null })
  return true
}
