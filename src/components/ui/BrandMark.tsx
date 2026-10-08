interface Props {
  className?: string
}

/**
 * Route Rabbit's app icon as an inline mark: the carrot map-pin on its brand tile.
 * Same artwork as public/app-icon.svg, flattened to solid fills so it reads cleanly
 * at header size. Used in the Home dashboard header.
 */
export function BrandMark({ className }: Props) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="112" fill="#175650" />
      {/* route leading to the pin */}
      <path
        d="M118 442 C 160 436 172 404 208 402 S 240 428 250 434"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray="0.1 24"
      />
      <circle cx="92" cy="444" r="12" fill="#ffffff" fillOpacity="0.75" />
      {/* greens */}
      <path d="M242 156 C 200 140 168 108 160 72 C 202 76 236 104 250 146 Z" fill="#3fa655" />
      <path d="M270 156 C 312 140 344 108 352 72 C 310 76 276 104 262 146 Z" fill="#3fa655" />
      <path d="M256 152 C 232 120 224 80 240 48 C 262 70 276 110 262 152 Z" fill="#5fc96d" />
      {/* carrot pin */}
      <path
        d="M256 438 C 240 398 164 290 164 222 C 164 172 204 144 256 144 C 308 144 348 172 348 222 C 348 290 272 398 256 438 Z"
        fill="#f7801f"
      />
      <g stroke="#b9500f" strokeOpacity="0.55" strokeWidth="9" strokeLinecap="round" fill="none">
        <path d="M172 262 L 200 268" />
        <path d="M340 300 L 304 308" />
        <path d="M196 344 L 222 352" />
        <path d="M340 236 L 300 240" />
      </g>
    </svg>
  )
}
