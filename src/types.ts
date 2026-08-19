export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type PatientStatus = 'active' | 'inactive'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface Patient {
  id: string
  initials: string
  address: string
  geo: GeoPoint | null
  visitDuration: number // minutes
  availableDays: Weekday[]
  windowStart: string // "HH:MM" 24h
  windowEnd: string // "HH:MM" 24h
  notes?: string
  status: PatientStatus
  createdAt: number
}

export interface NamedLocation {
  label: string
  address: string
  geo: GeoPoint | null
}

export interface LunchPreference {
  enabled: boolean
  earliest: string // "HH:MM"
  latest: string // "HH:MM"
  duration: number // minutes
}

/** The therapist's plan for one calendar day, before/after optimization. */
export interface DayPlan {
  date: string // YYYY-MM-DD
  dayStartTime: string // "HH:MM"
  startLocation: NamedLocation
  endLocation: NamedLocation
  patientIds: string[] // selected for the day, unordered "wishlist"
  cancelledPatientIds: string[] // cancelled for today only, kept for history/undo
  lunch: LunchPreference
  currentLocationOverride: NamedLocation | null
  activeStopId: string | null
  result: BuiltRoute | null
}

export type StopKind = 'start' | 'visit' | 'lunch' | 'open' | 'end'

export interface Stop {
  id: string
  kind: StopKind
  patientId?: string
  label: string
  arrive: string // "HH:MM"
  depart: string // "HH:MM"
  driveMinutesFromPrev: number
  driveMilesFromPrev: number
  geo: GeoPoint | null
  address?: string
}

export interface BuiltRoute {
  builtAt: number
  stops: Stop[]
  totalTherapyMinutes: number
  totalDriveMinutes: number
  totalMiles: number
  openMinutes: number
  visitCount: number
  efficiency: number // 0-100
  conflicts: RouteConflict[]
  googleMapsUrl: string | null
}

export interface RouteConflict {
  patientId?: string
  message: string
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppSettings {
  homeAddress: string
  homeGeo: GeoPoint | null
  avgSpeedMph: number
  onboardingSeen: boolean
  themeMode: ThemeMode
}
