export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type PatientStatus = 'active' | 'inactive'

/** Administrative scheduling preference the PT sets explicitly -- not a clinical severity score. */
export type PatientPriority = 'high' | 'medium' | 'low'

export interface GeoPoint {
  lat: number
  lng: number
}

/** A recurring blocked window on a specific weekday -- e.g. "Tue 12:00-1:00, lunch pickup". */
export interface PatientConflict {
  id: string
  day: Weekday
  startTime: string // "HH:MM" 24h
  endTime: string // "HH:MM" 24h
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
  /** How many of their available days actually need a visit each week. null = every available day. */
  visitsPerWeek: number | null
  conflicts: PatientConflict[]
  notes?: string
  status: PatientStatus
  /** Scheduling priority for deciding who to call first when a make-up slot opens up. */
  priority: PatientPriority
  /** Whether this patient can currently fill an opening from someone else's cancellation -- independent of their regular visit schedule. */
  makeupAvailable: boolean
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
  makeupPatientIds: string[] // added today to fill a cancellation, even if today isn't one of their regular available days
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
  weatherNote: string | null
}

export interface RouteConflict {
  patientId?: string
  message: string
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppSettings {
  /** Default start location for new days -- editable on the Home dashboard. */
  homeAddress: string
  homeGeo: GeoPoint | null
  /** Default end location for new days. Empty = same as start. */
  endAddress: string
  endGeo: GeoPoint | null
  avgSpeedMph: number
  onboardingSeen: boolean
  themeMode: ThemeMode
}

export type WeatherImpact = 0 | 1 | 2 // 0 none, 1 caution (slower driving), 2 severe (much slower)

export interface DayWeather {
  date: string // YYYY-MM-DD
  tempMaxF: number
  tempMinF: number
  icon: string
  label: string
  impact: WeatherImpact
}

export interface CurrentWeather {
  tempF: number
  icon: string
  label: string
  impact: WeatherImpact
}

export interface WeatherForecast {
  fetchedAt: number
  current: CurrentWeather
  daily: Record<string, DayWeather>
}
