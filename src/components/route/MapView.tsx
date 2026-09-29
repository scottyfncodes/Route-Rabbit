import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { divIcon, type LatLngBoundsExpression, type LatLngTuple } from 'leaflet'
import { KIND_ICON } from '../../lib/roadAlerts'
import type { RoadAlert, RoadCondition, Stop } from '../../types'

interface Props {
  stops: Stop[]
  /** CDOT alerts along the route, drawn as small pins. */
  alerts?: RoadAlert[]
  /** Slick/closed road segments along the route, drawn as colored lines under the route. */
  conditions?: RoadCondition[]
}

const SEVERITY_RING: Record<RoadAlert['severity'], string> = { major: '#c94f3a', moderate: '#b6790a', minor: '#5c6966' }

function alertIcon(alert: RoadAlert) {
  return divIcon({
    className: '',
    html: `<div style="background:white;width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid ${SEVERITY_RING[alert.severity]};box-shadow:0 1px 3px rgba(0,0,0,0.3)">${KIND_ICON[alert.kind]}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

const KIND_STYLE: Record<Stop['kind'], { bg: string; text: string }> = {
  start: { bg: '#175650', text: '🏠' },
  end: { bg: '#175650', text: '🏁' },
  visit: { bg: '#26827a', text: '' },
  lunch: { bg: '#c94f3a', text: '🍴' },
  open: { bg: '#b6790a', text: '☕' },
}

function makeIcon(stop: Stop, sequenceNumber: number | null) {
  const style = KIND_STYLE[stop.kind]
  const content = stop.kind === 'visit' ? String(sequenceNumber) : style.text
  return divIcon({
    className: '',
    html: `<div style="background:${style.bg};color:white;width:34px;height:34px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35)">${content}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

export function MapView({ stops, alerts = [], conditions = [] }: Props) {
  const located = stops.filter((s) => s.geo)
  if (located.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-line-soft px-4 py-8 text-center text-[14px] text-muted">
        Map will appear once locations are found.
      </div>
    )
  }

  const points: LatLngTuple[] = located.map((s) => [s.geo!.lat, s.geo!.lng])
  const bounds: LatLngBoundsExpression = points

  let visitCount = 0

  return (
    <div className="rounded-2xl overflow-hidden border border-line-soft" style={{ height: 260 }}>
      {/* Leaflet only reads `bounds` on mount -- re-key so a rebuilt route is re-framed. */}
      <MapContainer key={points.join(';')} bounds={bounds} boundsOptions={{ padding: [28, 28] }} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {conditions.map((c) => (
          <Polyline key={c.id} positions={c.path} pathOptions={{ color: c.closed || c.impact === 2 ? '#c94f3a' : '#b6790a', weight: 6, opacity: 0.55 }}>
            <Tooltip sticky>
              {c.closed ? 'Closed' : c.label} · {c.route}
            </Tooltip>
          </Polyline>
        ))}
        <Polyline positions={points} pathOptions={{ color: '#26827a', weight: 3, opacity: 0.7, dashArray: '6 6' }} />
        {located.map((stop) => {
          const seq = stop.kind === 'visit' ? ++visitCount : null
          return (
            <Marker key={stop.id} position={[stop.geo!.lat, stop.geo!.lng]} icon={makeIcon(stop, seq)}>
              <Tooltip direction="top" offset={[0, -16]}>
                {stop.label}
              </Tooltip>
            </Marker>
          )
        })}
        {alerts.map((alert) => (
          <Marker key={alert.id} position={alert.points[0]} icon={alertIcon(alert)} zIndexOffset={-100}>
            <Tooltip direction="top" offset={[0, -12]}>
              {alert.title}
              {alert.route ? ` · ${alert.route}` : ''}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
