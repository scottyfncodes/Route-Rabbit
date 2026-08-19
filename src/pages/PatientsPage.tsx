import { useState } from 'react'
import { PatientCard } from '../components/patients/PatientCard'
import { PatientForm, type PatientFormValues } from '../components/patients/PatientForm'
import type { usePatients } from '../hooks/usePatients'
import type { Patient } from '../types'

interface Props {
  patientsApi: ReturnType<typeof usePatients>
}

const byInitials = (a: Patient, b: Patient) => a.initials.localeCompare(b.initials)

export function PatientsPage({ patientsApi }: Props) {
  const { patients, addPatient, updatePatient, removePatient, setStatus } = patientsApi
  const [editing, setEditing] = useState<Patient | 'new' | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const active = patients.filter((p) => p.status === 'active').sort(byInitials)
  const archived = patients.filter((p) => p.status === 'inactive').sort(byInitials)

  const handleSave = (values: PatientFormValues) => {
    if (editing && editing !== 'new') {
      updatePatient(editing.id, values)
    } else {
      addPatient(values)
    }
    setEditing(null)
  }

  const handleDelete = () => {
    if (editing && editing !== 'new') removePatient(editing.id)
    setEditing(null)
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-extrabold text-ink">Patients</h1>
          <p className="text-[13px] text-muted">{patients.length} in your list · initials only</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="w-12 h-12 rounded-full bg-primary-600 text-white text-[26px] font-bold flex items-center justify-center leading-none shadow-sm active:bg-primary-700"
          aria-label="Add patient"
        >
          +
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2.5">
        {patients.length === 0 && (
          <div className="bg-surface rounded-2xl border border-line-soft px-5 py-8 text-center mt-4">
            <p className="text-[16px] font-semibold text-ink mb-1">No patients yet</p>
            <p className="text-[14px] text-muted mb-4">Add a patient with just their initials, address, and visit window.</p>
            <button onClick={() => setEditing('new')} className="text-accent font-bold text-[15px]">
              + Add your first patient
            </button>
          </div>
        )}

        {active.map((p) => (
          <PatientCard
            key={p.id}
            patient={p}
            onEdit={() => setEditing(p)}
            onToggleStatus={() => {
              setStatus(p.id, 'inactive')
              setArchiveOpen(true)
            }}
          />
        ))}

        {active.length === 0 && archived.length > 0 && (
          <p className="text-[14px] text-muted text-center py-6">All patients are archived.</p>
        )}

        {archived.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setArchiveOpen((v) => !v)}
              className="w-full flex items-center justify-between px-1 py-2 text-left"
            >
              <span className="text-[13px] font-bold text-label uppercase tracking-wide">🗄️ Archive ({archived.length})</span>
              <span className={`text-[14px] text-faint transition-transform ${archiveOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {archiveOpen && (
              <div className="space-y-2.5 mt-1">
                {archived.map((p) => (
                  <PatientCard
                    key={p.id}
                    patient={p}
                    onEdit={() => setEditing(p)}
                    onToggleStatus={() => setStatus(p.id, 'active')}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <PatientForm
          patient={editing === 'new' ? undefined : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onDelete={editing !== 'new' ? handleDelete : undefined}
        />
      )}
    </div>
  )
}
