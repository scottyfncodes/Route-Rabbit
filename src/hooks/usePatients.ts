import { useCallback, useEffect, useState } from 'react'
import { lookupAddress } from '../lib/geocode'
import { readStorage, writeStorage } from '../lib/storage'
import type { Patient, PatientStatus } from '../types'

const KEY = 'patients'

function newId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export type NewPatientInput = Omit<Patient, 'id' | 'geo' | 'status' | 'createdAt'> & { status?: PatientStatus; geo?: Patient['geo'] }

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
    lookupAddress(address).then((match) => {
      setPatients((prev) =>
        prev.map((p) =>
          p.id === id && p.address === address && !p.geoConfirmed
            ? { ...p, geo: match?.geo ?? null, matchedAddress: match?.matchedAddress ?? null, geoExact: match?.exact ?? false, geoConfirmed: false }
            : p,
        ),
      )
    })
  }, [])

  const addPatient = useCallback(
    (input: NewPatientInput): Patient => {
      const patient: Patient = {
        ...input,
        id: newId(),
        geo: input.geo ?? null,
        status: input.status ?? 'active',
        createdAt: Date.now(),
      }
      setPatients((prev) => [...prev, patient])
      // The form may already have found (and the therapist confirmed) the pin.
      if (!patient.geo) geocodeInBackground(patient.id, patient.address)
      return patient
    },
    [geocodeInBackground],
  )

  const updatePatient = useCallback(
    (id: string, changes: Partial<Omit<Patient, 'id'>>) => {
      // Re-geocode on a new address, or retry an address that couldn't be located before --
      // unless the form already brought a pin for this address.
      const existing = patients.find((p) => p.id === id)
      const formPlacedPin = changes.geo !== undefined && changes.geo !== null
      const needsGeocode =
        !formPlacedPin && changes.address !== undefined && (existing?.address !== changes.address || !existing?.geo)
      setPatients((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p
          const next = { ...p, ...changes }
          if (!formPlacedPin && changes.address && changes.address !== p.address) {
            next.geo = null
            next.matchedAddress = null
            next.geoConfirmed = false
          }
          return next
        }),
      )
      if (needsGeocode && changes.address) geocodeInBackground(id, changes.address)
    },
    [patients, geocodeInBackground],
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
