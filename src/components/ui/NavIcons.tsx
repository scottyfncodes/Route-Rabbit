interface Props {
  className?: string
}

/*
 * Bottom-nav glyphs, drawn to match RabbitWheelIcon: 24px grid, 1.8 stroke,
 * round caps, currentColor. Kept to the three tabs that need one.
 */

export function PatientsIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.2c.8-3.7 3.6-5.9 7.2-5.9s6.4 2.2 7.2 5.9" />
    </svg>
  )
}

export function WeekIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.6" y="5.2" width="16.8" height="15" rx="2.6" />
      <path d="M3.6 10h16.8M8.2 3.2v3.6M15.8 3.2v3.6" />
      <path d="M7.6 14.4h1.6M11.2 14.4h1.6M14.8 14.4h1.6" />
    </svg>
  )
}

export function SettingsIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  )
}
