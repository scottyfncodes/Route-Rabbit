import { useMemo } from 'react'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import { divIcon, type Marker as LeafletMarker } from 'leaflet'
import type { GeoPoint } from '../../types'

interface Props {
  geo: GeoPoint
  onMove: (geo: GeoPoint) => void
}

// A plain teardrop pin in the app's teal, drawn inline so it doesn't depend on Leaflet's image assets.
const PIN_ICON = divIcon({
  className: '',
  html: `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 1C7.3 1 1 7.1 1 14.7 1 25 15 39 15 39s14-14 14-24.3C29 7.1 22.7 1 15 1z" fill="#175650" stroke="white" stroke-width="2"/><circle cx="15" cy="14.5" r="5" fill="white"/></svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 39],
})

/** A small map with one draggable pin, for nudging a patient's location onto the right house. */
export function PinPicker({ geo, onMove }: Props) {
  const eventHandlers = useMemo(
    () => ({
      dragend(e: { target: LeafletMarker }) {
        const { lat, lng } = e.target.getLatLng()
        onMove({ lat, lng })
      },
    }),
    [onMove],
  )

  return (
    <div className="rounded-2xl overflow-hidden border border-line-soft" style={{ height: 220 }}>
      <MapContainer center={[geo.lat, geo.lng]} zoom={17} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[geo.lat, geo.lng]} icon={PIN_ICON} draggable eventHandlers={eventHandlers} />
      </MapContainer>
    </div>
  )
}
