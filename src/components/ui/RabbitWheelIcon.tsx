interface Props {
  className?: string
}

/** Route Rabbit's mark: bunny ears peeking over a steering wheel. Used as the Home tab icon. */
export function RabbitWheelIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="8.7" cy="4.6" rx="1.7" ry="4.3" transform="rotate(-18 8.7 4.6)" fill="currentColor" />
      <ellipse cx="15.3" cy="4.6" rx="1.7" ry="4.3" transform="rotate(18 15.3 4.6)" fill="currentColor" />
      <circle cx="12" cy="14.5" r="7" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="14.5" r="1.9" fill="currentColor" />
      <path
        d="M12 7.5V14.5M12 14.5 5.94 18M12 14.5l6.12 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
