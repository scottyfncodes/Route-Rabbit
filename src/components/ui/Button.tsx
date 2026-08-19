import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
type Size = 'md' | 'lg'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white active:bg-primary-700 disabled:bg-primary-200',
  secondary: 'bg-mint-100 text-primary-800 active:bg-mint-200',
  danger: 'bg-coral-600 text-white active:bg-coral-700',
  outline: 'bg-white text-primary-700 border-2 border-primary-600 active:bg-primary-50',
  ghost: 'bg-transparent text-primary-700 active:bg-primary-50',
}

const SIZE_CLASSES: Record<Size, string> = {
  md: 'px-4 py-2.5 text-[15px] rounded-xl',
  lg: 'px-5 py-4 text-[17px] rounded-2xl',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', fullWidth, className = '', children, ...rest }: Props) {
  return (
    <button
      className={`font-semibold leading-tight transition-colors disabled:opacity-50 disabled:pointer-events-none select-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
