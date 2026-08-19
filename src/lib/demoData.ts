import type { Patient, Weekday } from '../types'

const WEEKDAYS_MF: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

let seq = 0
function id(): string {
  seq += 1
  return `demo-${Date.now()}-${seq}`
}

/**
 * Fictional demo patients with fictional addresses, tuned to demonstrate a
 * normal route, a tight/likely-conflicting window, and a full day's worth of
 * material for exercising cancellation + rebuild.
 */
export function buildDemoPatients(): Patient[] {
  const now = Date.now()
  const make = (p: Omit<Patient, 'geo' | 'status' | 'createdAt' | 'id'>): Patient => ({
    ...p,
    id: id(),
    geo: null,
    status: 'active',
    createdAt: now,
  })

  return [
    make({
      initials: 'AB',
      address: '100 Maple Street, Springfield, IL',
      visitDuration: 45,
      availableDays: WEEKDAYS_MF,
      windowStart: '08:00',
      windowEnd: '12:00',
      notes: 'Enter through side door',
    }),
    make({
      initials: 'JS',
      address: '250 Oak Avenue, Springfield, IL',
      visitDuration: 60,
      availableDays: ['Mon', 'Wed', 'Fri'],
      windowStart: '08:30',
      windowEnd: '10:30',
      notes: 'Must finish before 10:30am pickup',
    }),
    make({
      initials: 'MK',
      address: '780 Birchwood Lane, Springfield, IL',
      visitDuration: 45,
      availableDays: WEEKDAYS_MF,
      windowStart: '09:00',
      windowEnd: '16:00',
    }),
    make({
      initials: 'TR',
      address: '15 Willow Court, Springfield, IL',
      visitDuration: 30,
      availableDays: WEEKDAYS_MF,
      windowStart: '13:00',
      windowEnd: '17:00',
    }),
    make({
      initials: 'LM',
      address: '920 Chestnut Blvd, Springfield, IL',
      visitDuration: 60,
      availableDays: ['Tue', 'Thu'],
      windowStart: '10:00',
      windowEnd: '15:00',
      notes: 'Parent prefers afternoon if possible',
    }),
    make({
      initials: 'CD',
      address: '45 Pinecrest Drive, Springfield, IL',
      visitDuration: 45,
      availableDays: WEEKDAYS_MF,
      windowStart: '14:30',
      windowEnd: '16:30',
    }),
  ]
}
