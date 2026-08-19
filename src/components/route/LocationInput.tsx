import { useEffect, useState } from 'react'
import { geocodeAddress } from '../../lib/geocode'
import type { NamedLocation } from '../../types'

interface Props {
  label: string
  value: NamedLocation
  onChange: (loc: NamedLocation) => void
  placeholder?: string
}

/**
 * Free-typing address field. Geocoding only runs when the address is explicitly
 * committed (Save tap or Enter), not on every keystroke/typing pause -- so
 * anything downstream that reacts to the resolved location (like weather) only
 * updates once, on the address the user actually meant to enter.
 */
export function LocationInput({ label, value, onChange, placeholder }: Props) {
  const [text, setText] = useState(value.address)
  const [locating, setLocating] = useState(false)

  useEffect(() => setText(value.address), [value.address])

  const dirty = text !== value.address

  const commit = async () => {
    if (!dirty || locating) return
    if (!text.trim()) {
      onChange({ ...value, address: text, geo: null })
      return
    }
    setLocating(true)
    const geo = await geocodeAddress(text)
    setLocating(false)
    onChange({ ...value, address: text, geo })
  }

  return (
    <div>
      <label className="block text-[13px] font-bold text-label mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
              commit()
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 text-[16px] bg-surface rounded-2xl border border-line px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        {(dirty || locating) && (
          <button
            onClick={commit}
            disabled={locating}
            className="shrink-0 px-4 rounded-2xl bg-primary-600 text-white font-bold text-[14px] disabled:opacity-60"
          >
            {locating ? '…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}
