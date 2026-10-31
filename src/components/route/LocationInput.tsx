import { useState } from 'react'
import { lookupAddress } from '../../lib/geocode'
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
  const [syncedAddress, setSyncedAddress] = useState(value.address)
  const [locating, setLocating] = useState(false)
  // What the map service matched on the last save, so a wrong match is visible right away.
  const [matched, setMatched] = useState<{ text: string; exact: boolean } | 'none' | null>(null)

  // Pick up address changes made elsewhere (e.g. switching days) without an effect round-trip.
  if (value.address !== syncedAddress) {
    setSyncedAddress(value.address)
    setText(value.address)
  }

  const dirty = text !== value.address

  const commit = async () => {
    if (!dirty || locating) return
    if (!text.trim()) {
      onChange({ ...value, address: text, geo: null })
      return
    }
    setLocating(true)
    const match = await lookupAddress(text)
    setLocating(false)
    setMatched(match ? { text: match.matchedAddress, exact: match.exact } : 'none')
    onChange({ ...value, address: text, geo: match?.geo ?? null })
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
      {matched === 'none' && (
        <p className="text-[12.5px] text-warning mt-1.5 leading-snug">Couldn't find that address. Include the city and state.</p>
      )}
      {matched && matched !== 'none' && !dirty && (
        <p className="text-[12.5px] text-muted mt-1.5 leading-snug">
          Found: <span className="text-ink">{matched.text}</span>
          {!matched.exact && <span className="text-warning"> (approximate, check it)</span>}
        </p>
      )}
    </div>
  )
}
