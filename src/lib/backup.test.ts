import { describe, expect, it } from 'vitest'
import { applyBackup, backupFileName, createBackup, isBackupDue, parseBackup, snoozeUntil, type KeyValueStore } from './backup'

function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...initial }
  return { data, get: (k) => data[k], set: (k, v) => void (data[k] = v) }
}

const PATIENTS = [
  { id: 'p1', initials: 'AB', address: '1 Main St, Denver, CO', notes: 'side door', geo: { lat: 39.7, lng: -104.9 } },
  { id: 'p2', initials: 'CD', address: '2 Oak Ave, Denver, CO', geo: null },
]
const PLANS = { '2025-01-06': { date: '2025-01-06', patientIds: ['p1', 'p2'], result: null } }
const SETTINGS = { homeAddress: '5 Office Rd', avgSpeedMph: 26, onboardingSeen: true }

describe('export and import', () => {
  it('round-trips patients, day plans, and settings through a file', () => {
    const source = memoryStore({ patients: PATIENTS, dayPlans: PLANS, settings: SETTINGS, driveTimeCache: { x: 1 } })
    const text = JSON.stringify(createBackup(source, new Date('2025-01-10T15:00:00Z')))

    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.patientCount).toBe(2)
    expect(parsed.dayCount).toBe(1)

    const target = memoryStore({ patients: [{ id: 'old', initials: 'ZZ', address: 'gone' }] })
    applyBackup(parsed.backup, target)
    expect(target.data.patients).toEqual(PATIENTS)
    expect(target.data.dayPlans).toEqual(PLANS)
    expect(target.data.settings).toEqual(SETTINGS)
  })

  it('leaves caches out of the file', () => {
    const backup = createBackup(memoryStore({ patients: PATIENTS, driveTimeCache: { x: 1 }, addressCache: { y: 2 } }))
    expect(Object.keys(backup.data).sort()).toEqual(['dayPlans', 'patients', 'settings'])
  })

  it('exports an empty phone as an empty, still-valid backup', () => {
    const parsed = parseBackup(JSON.stringify(createBackup(memoryStore())))
    expect(parsed.ok && parsed.patientCount).toBe(0)
  })

  it('marks onboarding as seen when restoring onto a fresh phone', () => {
    const parsed = parseBackup(JSON.stringify(createBackup(memoryStore({ patients: [], settings: { onboardingSeen: false } }))))
    const target = memoryStore()
    if (parsed.ok) applyBackup(parsed.backup, target)
    expect((target.data.settings as { onboardingSeen: boolean }).onboardingSeen).toBe(true)
  })

  it.each([
    ['not JSON', 'hello'],
    ['some other app', JSON.stringify({ app: 'other', version: 1, data: { patients: [] } })],
    ['missing patient list', JSON.stringify({ app: 'route-rabbit', version: 1, data: {} })],
    ['damaged patient', JSON.stringify({ app: 'route-rabbit', version: 1, data: { patients: [{ id: 'p1' }] } })],
    ['damaged routes', JSON.stringify({ app: 'route-rabbit', version: 1, data: { patients: [], dayPlans: [] } })],
    ['newer format', JSON.stringify({ app: 'route-rabbit', version: 99, data: { patients: [] } })],
  ])('refuses a bad file (%s) without touching anything', (_label, text) => {
    const result = parseBackup(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('names the file by date', () => {
    expect(backupFileName(new Date(2025, 0, 6))).toBe('route-rabbit-backup-2025-01-06.json')
  })
})

describe('weekly backup reminder', () => {
  const DAY = 24 * 60 * 60 * 1000
  const now = new Date('2025-01-20T12:00:00Z').getTime()

  it('stays quiet with no patients to lose', () => {
    expect(isBackupDue({ lastBackupAt: null, snoozedUntil: null }, 0, now)).toBe(false)
  })
  it('asks when there has never been a backup', () => {
    expect(isBackupDue({ lastBackupAt: null, snoozedUntil: null }, 3, now)).toBe(true)
  })
  it('waits a week after the last backup', () => {
    expect(isBackupDue({ lastBackupAt: now - 6 * DAY, snoozedUntil: null }, 3, now)).toBe(false)
    expect(isBackupDue({ lastBackupAt: now - 7 * DAY, snoozedUntil: null }, 3, now)).toBe(true)
  })
  it('respects Later for two days', () => {
    const snoozed = snoozeUntil(now)
    expect(isBackupDue({ lastBackupAt: null, snoozedUntil: snoozed }, 3, now + DAY)).toBe(false)
    expect(isBackupDue({ lastBackupAt: null, snoozedUntil: snoozed }, 3, now + 2 * DAY + 1)).toBe(true)
  })
})
