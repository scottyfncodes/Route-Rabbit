import type { PatientPriority } from '../../types'

/** Scheduling priority as a small colored dot: coral = high, amber = medium, teal = low. */
const DOT_CLASS: Record<PatientPriority, string> = {
  high: 'bg-coral-500',
  medium: 'bg-amber-600',
  low: 'bg-primary-400',
}

const PRIORITY_LABEL: Record<PatientPriority, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' }

interface Props {
  priority: PatientPriority
  className?: string
}

export function PriorityDot({ priority, className = '' }: Props) {
  return (
    <span
      role="img"
      aria-label={PRIORITY_LABEL[priority]}
      title={PRIORITY_LABEL[priority]}
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${DOT_CLASS[priority]} ${className}`}
    />
  )
}
