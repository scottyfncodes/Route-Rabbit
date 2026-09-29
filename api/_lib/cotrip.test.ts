import { describe, expect, it } from 'vitest'
import {
  cleanMessage,
  conditionImpact,
  conditionLabel,
  normalizeIncident,
  normalizePlannedEvent,
  normalizeRoadCondition,
  summarizeLaneImpacts,
  thinPath,
  type LatLng,
} from './cotrip.js'

// Trimmed from real COtrip responses.
const crash = {
  type: 'Feature',
  geometry: { srid: 4326, type: 'Point', coordinates: [-104.859377, 38.258236] },
  properties: {
    injuries: 0,
    type: '1 Vehicle Crash',
    routeName: 'CO-96E',
    lastUpdated: '2026-09-29T02:51:24.820Z',
    startTime: '2026-09-29T02:44:43.520Z',
    id: 'OpenTMS-Incident35456825684',
    travelerInformationMessage: 'Between Rex Road and Red Creek Springs Road at Mile Point 40. Crash expect delays. There is alternating traffic.',
    severity: 'minor',
    additionalImpacts: ['Alternating Traffic', 'Impacts both directions'],
    laneImpacts: [
      { direction: 'east', laneCount: 1, laneClosures: 'c001', closedLaneTypes: ['through lanes', 'right shoulder', 'left shoulder'] },
      { direction: 'west', laneCount: 1, laneClosures: '0', closedLaneTypes: [] },
    ],
    category: 'Crash',
    status: 'confirmed report',
  },
}

const paving = {
  type: 'Feature',
  geometry: { type: 'MultiPoint', coordinates: [[-107.86669, 37.23363], [-107.78577, 37.22975]] },
  properties: {
    clearTime: '2026-10-02T13:00:00Z',
    type: 'Paving Operations',
    laneImpacts: [{ direction: 'east', laneCount: 2, laneClosures: '2000', closedLaneTypes: ['right lane'] }],
    routeName: 'US-160E',
    schedule: [{ startTime: '2026-10-02T01:01:00.000Z', endTime: '2026-10-02T13:00:00.000Z' }],
    id: 'OpenTMS-Event35386866688',
    startTime: '2026-10-02T01:01:00Z',
    travelerInformationMessage:
      'Between CO 3 and Kirk Lane. Right lane closed due to paving operations. Full schedule below: • October 1, 7:01PM - October 2, 7:00AM Comment: email us.',
    category: 'Construction',
  },
}

describe('COtrip alert normalization', () => {
  it('turns a live crash into a compact alert', () => {
    const alert = normalizeIncident(crash)!
    expect(alert).toMatchObject({
      id: 'OpenTMS-Incident35456825684',
      source: 'incident',
      kind: 'crash',
      title: '1 Vehicle Crash',
      route: 'CO-96',
      // One lane each way, eastbound blocked, flaggers alternating: slow but not closed.
      severity: 'moderate',
      fullClosure: false,
      impact: 'Alternating one-lane traffic',
      points: [[38.2582, -104.8594]],
    })
    expect(alert.windows).toEqual([{ start: '2026-09-29T02:44:43.520Z', end: null }])
  })

  it('drops incidents CDOT has already cleared', () => {
    expect(normalizeIncident({ ...crash, properties: { ...crash.properties, status: 'event cleared' } })).toBeNull()
  })

  it('keeps planned-event schedules and trims the message', () => {
    const alert = normalizePlannedEvent(paving)!
    expect(alert.kind).toBe('construction')
    expect(alert.severity).toBe('moderate')
    expect(alert.impact).toBe('Right lane closed eastbound')
    expect(alert.route).toBe('US-160')
    expect(alert.windows).toEqual([{ start: '2026-10-02T01:01:00.000Z', end: '2026-10-02T13:00:00.000Z' }])
    expect(alert.message).toBe('Between CO 3 and Kirk Lane. Right lane closed due to paving operations.')
  })

  it('calls it a closure only when every direction is shut', () => {
    const oneWay = { ...crash, properties: { ...crash.properties, additionalImpacts: [], travelerInformationMessage: 'Crash.' } }
    expect(normalizeIncident(oneWay)).toMatchObject({ severity: 'major', fullClosure: false, impact: 'All lanes closed eastbound' })

    const bothWays = {
      ...oneWay,
      properties: {
        ...oneWay.properties,
        laneImpacts: [
          { direction: 'east', laneCount: 1, closedLaneTypes: ['through lanes'] },
          { direction: 'west', laneCount: 1, closedLaneTypes: ['through lanes'] },
        ],
      },
    }
    expect(normalizeIncident(bothWays)).toMatchObject({ severity: 'major', fullClosure: true, kind: 'crash' })
  })

  it('ignores shoulder-only lane closures', () => {
    expect(summarizeLaneImpacts([{ direction: 'north', laneCount: 2, closedLaneTypes: ['right shoulder'] }])).toEqual({
      impact: null,
      fullClosure: false,
      directionClosed: false,
    })
  })

  it('cleans CDOT messages', () => {
    expect(cleanMessage('Road work.   Full schedule below: • stuff')).toBe('Road work.')
  })
})

describe('COtrip road conditions', () => {
  it.each([
    ['3 - dry', 0, 'Dry'],
    ['4s - wet in areas', 1, 'Wet in areas'],
    ['4-5 wet, rain', 1, 'Wet, rain'],
    ['snow packed', 2, 'Snow packed'],
    ['icy spots', 2, 'Icy spots'],
  ] as const)('rates "%s"', (description, impact, label) => {
    expect(conditionImpact(description).impact).toBe(impact)
    expect(conditionLabel(description)).toBe(label)
  })

  it('flags closures', () => {
    expect(conditionImpact('closed')).toEqual({ impact: 2, closed: true })
  })

  it('takes the worst operator report and keeps the forecast text', () => {
    const line = Array.from({ length: 200 }, (_, i) => [-106 + i * 0.001, 39.6])
    const condition = normalizeRoadCondition({
      geometry: { type: 'LineString', coordinates: line },
      properties: {
        id: '444',
        name: 'I-70, between Exit 361 and Exit 405',
        routeName: 'I-70',
        currentConditions: [
          { conditionDescription: '3 - dry', sourceType: 'OPERATOR' },
          { conditionDescription: 'icy spots', sourceType: 'OPERATOR' },
          { conditionDescription: 'forecast text included', sourceType: 'NDFD', additionalData: 'Light snow.' },
        ],
      },
    })!
    expect(condition).toMatchObject({ id: '444', route: 'I-70', impact: 2, label: 'Icy spots', closed: false, forecast: 'Light snow.' })
    // ~10.6 miles of dense vertices thinned to about one every half mile.
    expect(condition.path.length).toBeLessThan(30)
    expect(condition.path[0]).toEqual([39.6, -106])
  })
})

describe('thinPath', () => {
  it('always keeps both ends', () => {
    const pts: LatLng[] = [
      [39, -105],
      [39, -105.0001],
      [39, -105.0002],
    ]
    expect(thinPath(pts)).toEqual([pts[0], pts[2]])
  })
})
