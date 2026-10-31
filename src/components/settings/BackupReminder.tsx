import { useState } from 'react'
import { isBackupDue, readBackupMeta, saveBackupFile, snoozeUntil, writeBackupMeta } from '../../lib/backup'

interface Props {
  patientCount: number
}

/** The once-a-week nudge on Home. Quiet, one tap to save, and "Later" really means later. */
export function BackupReminder({ patientCount }: Props) {
  const [due, setDue] = useState(() => isBackupDue(readBackupMeta(), patientCount))
  if (!due || patientCount === 0) return null

  const handleSave = async () => {
    const saved = await saveBackupFile()
    if (saved) setDue(false)
  }

  const handleLater = () => {
    writeBackupMeta({ snoozedUntil: snoozeUntil() })
    setDue(false)
  }

  const neverBackedUp = readBackupMeta().lastBackupAt === null

  return (
    <div className="bg-surface rounded-2xl border border-line-soft px-4 py-3.5">
      <div className="text-[14.5px] font-bold text-ink">{neverBackedUp ? 'Save a backup of your patients' : 'Time for your weekly backup'}</div>
      <p className="text-[13px] text-muted leading-snug mt-0.5">
        Everything is stored only on this phone. A backup file lets you restore it if the phone is lost or reset.
      </p>
      <div className="flex items-center gap-4 mt-2.5">
        <button onClick={handleSave} className="text-[13.5px] font-bold text-white bg-primary-600 rounded-full px-4 py-2 active:bg-primary-700">
          Save backup
        </button>
        <button onClick={handleLater} className="text-[13.5px] font-semibold text-muted">
          Later
        </button>
      </div>
    </div>
  )
}
