import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import {
  backupFilename,
  buildBackup,
  markBackedUp,
  parseBackup,
  readLastBackupAt,
  restoreBackup,
  saveFile,
  summarize,
  type ParsedBackup,
} from '../../lib/backup'
import { isStoragePersisted } from '../../lib/storage'

const DAY_MS = 24 * 60 * 60 * 1000
/** With patients on the device and no backup for this long, the section nudges. */
const NUDGE_DAYS = 30
const PRIVACY_WARNING = 'This file contains patient addresses. Store it somewhere private.'

type Mode = { kind: 'idle' } | { kind: 'confirm-export' } | { kind: 'confirm-restore'; parsed: Extract<ParsedBackup, { ok: true }> }

interface Props {
  restoreNotice: string | null
  onRestored: (notice: string) => void
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function BackupSection({ restoreNotice, onRestored }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    restoreNotice ? { tone: 'ok', text: restoreNotice } : null,
  )
  const [lastBackupAt, setLastBackupAt] = useState(readLastBackupAt)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  // Read once per visit to Settings; a day's drift while the screen is open doesn't matter here.
  const [openedAt] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    void isStoragePersisted().then((p) => live && setPersisted(p))
    return () => {
      live = false
    }
  }, [lastBackupAt])

  const current = summarize(buildBackup(new Date()).data, '')
  const daysSince = lastBackupAt ? Math.floor((openedAt - Date.parse(lastBackupAt)) / DAY_MS) : null
  const stale = current.patients > 0 && (daysSince === null || daysSince >= NUDGE_DAYS)

  const createBackup = async () => {
    setMode({ kind: 'idle' })
    const at = new Date()
    let result
    try {
      result = await saveFile(backupFilename(at), JSON.stringify(buildBackup(at), null, 2))
    } catch {
      setMessage({ tone: 'error', text: "The backup file couldn't be created. Nothing was saved." })
      return
    }
    if (result === 'cancelled') {
      setMessage({ tone: 'error', text: 'Cancelled. No backup file was saved.' })
      return
    }
    markBackedUp(at)
    setLastBackupAt(at.toISOString())
    setMessage({ tone: 'ok', text: `Backup file created. ${PRIVACY_WARNING}` })
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      setMessage({ tone: 'error', text: "That file couldn't be read." })
      return
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
    const parsed = parseBackup(text)
    if (!parsed.ok) {
      setMode({ kind: 'idle' })
      setMessage({ tone: 'error', text: `${parsed.error} Nothing was changed.` })
      return
    }
    setMessage(null)
    setMode({ kind: 'confirm-restore', parsed })
  }

  const confirmRestore = (parsed: Extract<ParsedBackup, { ok: true }>) => {
    const result = restoreBackup(parsed.data)
    setMode({ kind: 'idle' })
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error })
      return
    }
    const { patients, dayPlans } = parsed.summary
    onRestored(`Restored ${plural(patients, 'patient', 'patients')} and ${plural(dayPlans, 'day plan', 'day plans')}.`)
  }

  return (
    <section>
      <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Backup</h2>
      <div className="bg-surface rounded-2xl border border-line-soft px-4 py-4 space-y-3">
        <p className={`text-[13.5px] ${stale ? 'text-warning font-medium' : 'text-muted'}`}>
          {daysSince === null
            ? `Never backed up${current.patients > 0 ? `. ${plural(current.patients, 'patient is', 'patients are')} stored only on this device` : ''}.`
            : `Last backed up ${daysSince < 1 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`}${stale ? '. Time for a fresh one' : ''}.`}
        </p>

        {mode.kind === 'confirm-export' ? (
          <div className="space-y-2">
            <p className="text-[13.5px] text-danger font-medium">{PRIVACY_WARNING}</p>
            <div className="flex gap-2">
              <Button variant="ghost" fullWidth onClick={() => setMode({ kind: 'idle' })}>
                Cancel
              </Button>
              <Button variant="primary" fullWidth onClick={() => void createBackup()}>
                Create file
              </Button>
            </div>
          </div>
        ) : mode.kind === 'confirm-restore' ? (
          <div className="space-y-2">
            <p className="text-[13.5px] text-ink">
              The backup from {new Date(mode.parsed.summary.exportedAt).toLocaleDateString()} has{' '}
              {plural(mode.parsed.summary.patients, 'patient', 'patients')} and{' '}
              {plural(mode.parsed.summary.dayPlans, 'day plan', 'day plans')}.
            </p>
            <p className="text-[13.5px] text-danger font-medium">
              Restoring replaces the {plural(current.patients, 'patient', 'patients')},{' '}
              {plural(current.dayPlans, 'day plan', 'day plans')} and settings on this device.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" fullWidth onClick={() => setMode({ kind: 'idle' })}>
                Cancel
              </Button>
              <Button variant="danger" fullWidth onClick={() => confirmRestore(mode.parsed)}>
                Replace my data
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                setMessage(null)
                setMode({ kind: 'confirm-export' })
              }}
            >
              Back up data
            </Button>
            <Button variant="outline" fullWidth onClick={() => fileInput.current?.click()}>
              Restore from a backup
            </Button>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />

        {message && (
          <p role="status" className={`text-[13.5px] font-medium ${message.tone === 'ok' ? 'text-accent' : 'text-danger'}`}>
            {message.text}
          </p>
        )}

        <p className="text-[12.5px] text-muted">
          A backup is one file with your patients, day plans and settings. Restoring it on any device puts them back.
        </p>
        {persisted !== null && (
          <p className="text-[12.5px] text-muted">
            {persisted
              ? 'This device will keep your data.'
              : 'Safari may clear this data after 7 days without a visit. Add to Home Screen and keep a backup.'}
          </p>
        )}
      </div>
    </section>
  )
}
