import { describe, expect, it } from 'vitest'
import { findMakeupCandidates, type FindMakeupCandidatesInput } from './makeup'
import type { Patient } from '../types'

let seq = 0
function patient(overrides: Partial<Patient> = {}): Patient {
  seq += 1
  return {
    id: `m${seq}`,
    initials: `M${seq}`,
    address: `${seq} Oak Ave`,
    geo: { lat: 40, lng: -75 + seq / 100 },
    visitDuration: 45,
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    windowStart: '08:00',
    windowEnd: '17:00',
    visitsPerWeek: null,
    conflicts: [],
    status: 'active',
    priority: 'medium',
    makeupAvailable: true,
    createdAt: 0,
    ...overrides,
  }
}

function find(allPatients: Patient[], overrides: Partial<FindMakeupCandidatesInput> = {}) {
  return findMakeupCandidates({
    cancelledPatientId: 'cancelled',
    weekday: 'Mon',
    slotStart: '10:00',
    slotEnd: '10:45',
    allPatients,
    scheduledPatientIdsToday: [],
    prevStopGeo: { lat: 40, lng: -75 },
    nextStopGeo: { lat: 40, lng: -74.9 },
    avgSpeedMph: 30,
    ...overrides,
  }).map((c) => c.patient.id)
}

describe('findMakeupCandidates', () => {
  it('only offers active, make-up-available, located patients not already on the route', () => {
    const ok = patient()
    const inactive = patient({ status: 'inactive' })
    const notMakeup = patient({ makeupAvailable: false })
    const unlocated = patient({ geo: null })
    const scheduled = patient()
    expect(find([ok, inactive, notMakeup, unlocated, scheduled], { scheduledPatientIdsToday: [scheduled.id] })).toEqual([ok.id])
  })

  it('excludes patients whose window, blocked time, or visit length does not fit the opening', () => {
    const outsideWindow = patient({ windowStart: '13:00' })
    const blocked = patient({ conflicts: [{ id: 'c', day: 'Mon', startTime: '10:30', endTime: '11:00' }] })
    const tooLong = patient({ visitDuration: 60 })
    const shorter = patient({ visitDuration: 30 })
    expect(find([outsideWindow, blocked, tooLong, shorter])).toEqual([shorter.id])
  })

  it('ignores blocked times on other weekdays', () => {
    const blockedTuesday = patient({ conflicts: [{ id: 'c', day: 'Tue', startTime: '10:00', endTime: '11:00' }] })
    expect(find([blockedTuesday])).toEqual([blockedTuesday.id])
  })

  it('ranks by priority first, then by added drive time', () => {
    const lowNear = patient({ priority: 'low', geo: { lat: 40, lng: -74.95 } })
    const highFar = patient({ priority: 'high', geo: { lat: 40.3, lng: -75 } })
    const medFar = patient({ priority: 'medium', geo: { lat: 40.3, lng: -75 } })
    const medNear = patient({ priority: 'medium', geo: { lat: 40, lng: -74.95 } })
    expect(find([lowNear, medFar, highFar, medNear])).toEqual([highFar.id, medNear.id, medFar.id, lowNear.id])
  })
})
