import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKUP_VERSION, buildBackup, parseBackup, restoreBackup, saveFile } from './backup'
import { getSaveError, readStorageText, writeStorage } from './storage'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  }
}

function quotaStorage() {
  const s = memoryStorage()
  s.setItem = () => {
    throw new DOMException('quota', 'QuotaExceededError')
  }
  return s
}

const patient = {
  id: 'p-1',
  initials: 'AB',
  address: '123 Main St, Denver, CO',
  geo: { lat: 39.7, lng: -104.9 },
  visitDuration: 45,
  availableDays: ['Mon', 'Wed'],
  windowStart: '08:00',
  windowEnd: '15:00',
  visitsPerWeek: null,
  conflicts: [{ id: 'c-1', day: 'Mon', startTime: '12:00', endTime: '13:00' }],
  status: 'active',
  priority: 'medium',
  makeupAvailable: false,
  createdAt: 1_760_000_000_000,
}
const location = { label: 'Start', address: '1 Home Rd', geo: null }
const plan = {
  date: '2026-10-26',
  dayStartTime: '08:00',
  startLocation: location,
  endLocation: { ...location, label: 'End' },
  patientIds: ['p-1'],
  cancelledPatientIds: [],
  makeupPatientIds: [],
  lunch: { enabled: true, earliest: '11:30', latest: '13:30', duration: 30 },
  currentLocationOverride: null,
  activeStopId: null,
  result: null,
}
const settings = { homeAddress: '1 Home Rd', homeGeo: null, endAddress: '', endGeo: null, avgSpeedMph: 26, onboardingSeen: true, themeMode: 'system' }
const now = new Date('2026-10-28T15:00:00Z')

function seed() {
  writeStorage('patients', [patient])
  writeStorage('dayPlans', { [plan.date]: plan })
  writeStorage('settings', settings)
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() })
  seed()
})
afterEach(() => vi.unstubAllGlobals())

const backupText = () => JSON.stringify(buildBackup(now))

describe('export', () => {
  it('is a versioned file holding every patient, day plan and setting', () => {
    const b = buildBackup(now)
    expect(b).toMatchObject({ app: 'route-rabbit', version: BACKUP_VERSION, exportedAt: now.toISOString() })
    expect(b.data).toEqual({ patients: [patient], dayPlans: { [plan.date]: plan }, settings })
  })
})

describe('import validation', () => {
  it('accepts a good file and counts what it holds', () => {
    expect(parseBackup(backupText())).toMatchObject({ ok: true, summary: { patients: 1, dayPlans: 1 } })
  })

  it('rejects a wrong version or another app', () => {
    const b = JSON.parse(backupText())
    expect(parseBackup(JSON.stringify({ ...b, version: 2 }))).toMatchObject({ ok: false })
    expect(parseBackup(JSON.stringify({ ...b, app: 'crew' }))).toMatchObject({ ok: false })
  })

  it('rejects malformed JSON and files with no data', () => {
    expect(parseBackup('{not json')).toEqual({ ok: false, error: "That file isn't valid JSON." })
    expect(parseBackup(JSON.stringify({ app: 'route-rabbit', version: 1, exportedAt: now.toISOString() }))).toMatchObject({ ok: false })
  })

  it('rejects a partly damaged file instead of applying the good half', () => {
    const b = JSON.parse(backupText())
    b.data.patients.push({ ...patient, id: 'p-2', availableDays: ['Funday'] })
    expect(parseBackup(JSON.stringify(b))).toEqual({ ok: false, error: 'Patient 2 in the backup is damaged.' })
    const p = JSON.parse(backupText())
    p.data.dayPlans['2026-10-27'] = { ...plan, date: '2026-10-27', patientIds: 'p-1' }
    expect(parseBackup(JSON.stringify(p))).toEqual({ ok: false, error: 'The plan for 2026-10-27 in the backup is damaged.' })
    const s = JSON.parse(backupText())
    s.data.settings.avgSpeedMph = 'fast'
    expect(parseBackup(JSON.stringify(s))).toMatchObject({ ok: false })
    const u = JSON.parse(backupText())
    u.data.geocodeCache = {}
    expect(parseBackup(JSON.stringify(u))).toMatchObject({ ok: false })
  })

  it('accepts patients saved before the newer optional fields existed', () => {
    const b = JSON.parse(backupText())
    const { visitsPerWeek: _a, conflicts: _b, priority: _c, makeupAvailable: _d, ...older } = patient
    b.data.patients = [older]
    expect(parseBackup(JSON.stringify(b)).ok).toBe(true)
  })
})

describe('round trip', () => {
  it('restores exactly what was backed up, verified from storage', () => {
    const text = backupText()
    writeStorage('patients', [])
    writeStorage('dayPlans', {})
    const parsed = parseBackup(text)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(restoreBackup(parsed.data)).toEqual({ ok: true })
    expect(JSON.parse(readStorageText('patients') ?? 'null')).toEqual([patient])
    expect(buildBackup(now)).toEqual(JSON.parse(text))
  })

  it('changes nothing when the device cannot hold the restore', () => {
    const parsed = parseBackup(backupText())
    if (!parsed.ok) throw new Error(parsed.error)
    const before = readStorageText('patients')
    const storage = memoryStorage()
    storage.setItem('routeRabbit:patients', before as string)
    let writes = 0
    const realSet = storage.setItem
    storage.setItem = (k, v) => {
      // The first key lands, the second hits the quota: the first must be rolled back.
      if (++writes === 2) throw new DOMException('quota', 'QuotaExceededError')
      realSet(k, v)
    }
    vi.stubGlobal('window', { localStorage: storage })
    expect(restoreBackup({ ...parsed.data, patients: [] })).toMatchObject({ ok: false })
    expect(storage.getItem('routeRabbit:patients')).toBe(before)
  })
})

describe('save failures are visible', () => {
  it('reports a full device instead of swallowing it, and clears once a save works', () => {
    vi.stubGlobal('window', { localStorage: quotaStorage() })
    expect(writeStorage('patients', [patient])).toBe(false)
    expect(getSaveError()).toMatch(/out of storage space/)
    vi.stubGlobal('window', { localStorage: memoryStorage() })
    expect(writeStorage('patients', [patient])).toBe(true)
    expect(getSaveError()).toBeNull()
  })

  it('does not alarm over a cache that could not be written', () => {
    vi.stubGlobal('window', { localStorage: quotaStorage() })
    expect(writeStorage('geocodeCache', {})).toBe(false)
    expect(getSaveError()).toBeNull()
  })
})

describe('saveFile', () => {
  it('uses the share sheet where it takes files, and reports a cancel as nothing saved', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => {} })
    await expect(saveFile('b.json', '{}')).resolves.toBe('shared')
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: async () => {
        throw new DOMException('cancelled', 'AbortError')
      },
    })
    await expect(saveFile('b.json', '{}')).resolves.toBe('cancelled')
  })
})
