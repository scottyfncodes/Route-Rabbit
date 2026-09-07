import { useCallback, useEffect, useState } from 'react'
import { geocodeAddress } from '../lib/geocode'
import { readStorage, writeStorage } from '../lib/storage'
import type { Patient, PatientStatus } from '../types'

const KEY = 'patients'

function newId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export type NewPatientInput = Omit<Patient, 'id' | 'geo' | 'status' | 'createdAt'> & { status?: PatientStatus }

/** Fills in fields added after a patient may have already been saved to storage. */
function withDefaults(p: Partial<Patient>): Patient {
  return { visitsPerWeek: null, conflicts: [], priority: 'medium', makeupAvailable: false, ...p } as Patient
}

export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>(() => readStorage<Partial<Patient>[]>(KEY, []).map(withDefaults))

  useEffect(() => {
    writeStorage(KEY, patients)
  }, [patients])

  const geocodeInBackground = useCallback((id: string, address: string) => {
    geocodeAddress(address).then((geo) => {
      setPatients((prev) => prev.map((p) => (p.id === id && p.address === address ? { ...p, geo } : p)))
    })
  }, [])

  const addPatient = useCallback(
    (input: NewPatientInput): Patient => {
      const patient: Patient = {
        ...input,
        id: newId(),
        geo: null,
        status: input.status ?? 'active',
        createdAt: Date.now(),
      }
      setPatients((prev) => [...prev, patient])
      geocodeInBackground(patient.id, patient.address)
      return patient
    },
    [geocodeInBackground],
  )

  const updatePatient = useCallback(
    (id: string, changes: Partial<Omit<Patient, 'id'>>) => {
      setPatients((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p
          const next = { ...p, ...changes }
          if (changes.address && changes.address !== p.address) next.geo = null
          return next
        }),
      )
      if (changes.address) geocodeInBackground(id, changes.address)
    },
    [geocodeInBackground],
  )

  const removePatient = useCallback((id: string) => {
    setPatients((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const setStatus = useCallback((id: string, status: PatientStatus) => {
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
  }, [])

  const regeocodeMissing = useCallback(() => {
    patients.filter((p) => !p.geo).forEach((p) => geocodeInBackground(p.id, p.address))
  }, [patients, geocodeInBackground])

  return { patients, addPatient, updatePatient, removePatient, setStatus, regeocodeMissing }
}
