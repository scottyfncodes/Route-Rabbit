import { useEffect, useRef, useState } from 'react'
import { geocodeAddress } from '../../lib/geocode'
import type { NamedLocation } from '../../types'

interface Props {
  label: string
  value: NamedLocation
  onChange: (loc: NamedLocation) => void
  placeholder?: string
}

export function LocationInput({ label, value, onChange, placeholder }: Props) {
  const [text, setText] = useState(value.address)
  const [locating, setLocating] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => setText(value.address), [value.address])

  const handleChange = (address: string) => {
    setText(address)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      if (!address.trim()) {
        onChange({ ...value, address, geo: null })
        return
      }
      setLocating(true)
      const geo = await geocodeAddress(address)
      setLocating(false)
      onChange({ ...value, address, geo })
    }, 600)
  }

  return (
    <div>
      <label className="block text-[13px] font-bold text-[#4a5a57] mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full text-[16px] bg-white rounded-2xl border border-black/10 px-4 py-3.5 pr-10 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        {locating && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-[#7a8582]">…</span>
        )}
      </div>
    </div>
  )
}
