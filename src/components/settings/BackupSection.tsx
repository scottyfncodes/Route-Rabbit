import { useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { applyBackup, parseBackup, readBackupMeta, saveBackupFile, writeBackupMeta, type BackupFile } from '../../lib/backup'

interface Pending {
  backup: BackupFile
  patientCount: number
  dayCount: number
}

function formatSavedAt(ms: number | string): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return 'an unknown date'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Save everything to a file, or bring it back from one. */
export function BackupSection() {
  const [meta, setMeta] = useState(readBackupMeta)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveBackupFile()
    } finally {
      setMeta(readBackupMeta())
      setSaving(false)
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    const result = parseBackup(await file.text())
    if (fileInput.current) fileInput.current.value = ''
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPending({ backup: result.backup, patientCount: result.patientCount, dayCount: result.dayCount })
  }

  const handleRestore = () => {
    if (!pending) return
    applyBackup(pending.backup)
    // The restored file is now the latest copy, so the weekly reminder starts over.
    writeBackupMeta({ lastBackupAt: Date.now(), snoozedUntil: null })
    window.location.reload()
  }

  return (
    <section>
      <h2 className="text-[13px] font-bold text-label uppercase tracking-wide mb-2">Backup</h2>
      <div className="bg-surface rounded-2xl border border-line-soft px-4 py-4 space-y-3">
        <p className="text-[13.5px] text-ink leading-relaxed">
          Your patients and routes are saved only on this phone. Save a backup file each week so a lost or reset phone doesn't
          mean starting over.
        </p>
        <p className="text-[12.5px] text-muted">
          {meta.lastBackupAt ? `Last backup: ${formatSavedAt(meta.lastBackupAt)}` : 'No backup saved yet.'}
        </p>

        {pending ? (
          <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl px-4 py-3.5 space-y-3">
            <p className="text-[13.5px] text-warning leading-snug">
              This backup from {formatSavedAt(pending.backup.exportedAt)} has {pending.patientCount} patient
              {pending.patientCount === 1 ? '' : 's'} and {pending.dayCount} planned day{pending.dayCount === 1 ? '' : 's'}. Restoring
              replaces everything on this phone now.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" fullWidth onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button fullWidth onClick={handleRestore}>
                Restore
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Button fullWidth onClick={handleSave} disabled={saving}>
              Save backup file
            </Button>
            <Button variant="outline" fullWidth onClick={() => fileInput.current?.click()}>
              Restore from a file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        )}

        {error && <p className="text-[13px] text-danger font-medium">{error}</p>}
        <p className="text-[12px] text-subtle leading-snug">
          The file holds patient initials, addresses, and notes. Keep it somewhere private, like Files on this phone or a
          computer you trust.
        </p>
      </div>
    </section>
  )
}
