import { useState } from 'react'
import { PatientCard } from '../components/patients/PatientCard'
import { PatientForm, type PatientFormValues } from '../components/patients/PatientForm'
import type { usePatients } from '../hooks/usePatients'
import type { Patient } from '../types'

interface Props {
  patientsApi: ReturnType<typeof usePatients>
}

export function PatientsPage({ patientsApi }: Props) {
  const { patients, addPatient, updatePatient, removePatient, setStatus } = patientsApi
  const [editing, setEditing] = useState<Patient | 'new' | null>(null)

  const sorted = [...patients].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return a.initials.localeCompare(b.initials)
  })

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
          <h1 className="text-[24px] font-extrabold text-[#132825]">Patients</h1>
          <p className="text-[13px] text-[#5c6966]">{patients.length} in your list · initials only</p>
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
        {sorted.length === 0 && (
          <div className="bg-white rounded-2xl border border-black/5 px-5 py-8 text-center mt-4">
            <p className="text-[16px] font-semibold text-[#132825] mb-1">No patients yet</p>
            <p className="text-[14px] text-[#5c6966] mb-4">Add a patient with just their initials, address, and visit window.</p>
            <button onClick={() => setEditing('new')} className="text-primary-700 font-bold text-[15px]">
              + Add your first patient
            </button>
          </div>
        )}
        {sorted.map((p) => (
          <PatientCard
            key={p.id}
            patient={p}
            onEdit={() => setEditing(p)}
            onToggleStatus={() => setStatus(p.id, p.status === 'active' ? 'inactive' : 'active')}
          />
        ))}
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
