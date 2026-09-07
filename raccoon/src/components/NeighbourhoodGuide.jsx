import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import MapBase from './MapBase'

/**
 * NeighbourhoodGuide — "you chose the city; now which part of it fits your trip."
 *
 * The map colours each area by how its nightly stay LEANS against this city's
 * accommodation estimate — below / about / above. This is a disclosed editorial
 * judgment, three qualitative buckets, never a computed figure: it annotates the
 * single accommodation number the user already saw with the rough shape of its
 * spread, and never feeds the ranking or the estimate. Colour encodes price lean
 * and nothing else — no safety, vibe, nightlife or quiet signal anywhere.
 *
 * Tier decides what renders (honest coverage, not uniform coverage):
 *   full    → the map module: base + three-band legend + clickable areas + panel.
 *   minimal → a designed editorial callout owning the absence ("one core — you
 *             don't need to juggle neighbourhoods here"), full module weight.
 *   none / no entry → nothing; the rest of the detail view is untouched.
 */

// Colour = price lean only. A money scale, not a good/bad scale: below is cool
// (affordable), about is neutral, above is warm — and deliberately NOT pure red,
// so nothing reads as "danger". These are the only three colours on the map.
const LEAN = {
  below: { label: 'Below your estimate', color: '#5BA890' },
  near: { label: 'About your estimate', color: '#C8A96E' },
  above: { label: 'Above your estimate', color: '#E0794F' },
}
const LEGEND_ORDER = ['below', 'near', 'above']

// friction → one of three coarse bands. Never a precise duration: the traveller
// is deciding *whether they'll be commuting*, not budgeting to the minute, and a
// "15 min walk" is a falsifiable claim that goes stale silently beside a
// deliberately qualitative price band.
const FRICTION_LABEL = {
  walkable: 'Walkable to the centre',
  'short-ride': 'A short ride to the centre',
  'taxi-reliant': "You'll rely on taxis to reach the centre",
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// "2026-09" → "September 2026" for the disclosure line.
function formatReviewed(reviewedOn) {
  if (!reviewedOn) return null
  const [y, m] = reviewedOn.split('-')
  const name = MONTHS[Number(m) - 1]
  return name ? `${name} ${y}` : null
}

function areasBounds(areas) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const a of areas) {
    for (const ring of a.polygon.coordinates) {
      for (const [lng, lat] of ring) {
        if (lng < w) w = lng
        if (lng > e) e = lng
        if (lat < s) s = lat
        if (lat > n) n = lat
      }
    }
  }
  return [[w, s], [e, n]]
}

export default function NeighbourhoodGuide({ city }) {
  if (!city || city.tier === 'none') return null
  if (city.tier === 'minimal') return <MinimalCallout note={city.note} />
  return <FullModule city={city} />
}

function MinimalCallout({ note }) {
  return (
    <section className="rc-nb rc-nb--minimal" aria-label="Where to stay">
      <div className="rc-nb__callout">
        <span className="rc-nb__callout-mark" aria-hidden="true">
          {/* A single centred pin — the visual claim is "one core", not "no data". */}
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path
              d="M12 2c-3.9 0-7 3-7 6.9 0 4.6 5.5 10.4 6.4 11.3a.9.9 0 0 0 1.2 0C13.5 19.3 19 13.5 19 8.9 19 5 15.9 2 12 2Z"
              fill="var(--ac)"
            />
            <circle cx="12" cy="9" r="2.6" fill="var(--bg)" />
          </svg>
        </span>
        <div className="rc-nb__callout-body">
          <h3 className="rc-nb__callout-title">One core, and that's the honest answer</h3>
          <p className="rc-nb__callout-text">{note}</p>
        </div>
      </div>
    </section>
  )
}

function FullModule({ city }) {
  const { anchor, areas, reviewedOn } = city
  const [selectedId, setSelectedId] = useState(areas[0]?.id ?? null)
  const mapRef = useRef(null)
  const prevSelected = useRef(null)

  const bounds = useMemo(() => areasBounds(areas), [areas])
  const selected = areas.find((a) => a.id === selectedId) || null
  const reviewed = formatReviewed(reviewedOn)

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: areas.map((a) => ({
        type: 'Feature',
        id: a.id,
        properties: { id: a.id, name: a.name, lean: a.lean },
        geometry: a.polygon,
      })),
    }),
    [areas],
  )

  const anchorName = anchor?.name
  const pmtilesUrl = `/tiles/${city.cityId}.pmtiles`

  const handleReady = useCallback(
    (map) => {
      mapRef.current = map

      map.addSource('areas', { type: 'geojson', data: geojson, promoteId: 'id' })

      const leanMatch = [
        'match', ['get', 'lean'],
        'below', LEAN.below.color,
        'near', LEAN.near.color,
        'above', LEAN.above.color,
        LEAN.near.color,
      ]

      map.addLayer({
        id: 'area-fill',
        type: 'fill',
        source: 'areas',
        paint: {
          'fill-color': leanMatch,
          'fill-opacity': [
            'case', ['boolean', ['feature-state', 'selected'], false], 0.62, 0.4,
          ],
        },
      })
      map.addLayer({
        id: 'area-outline',
        type: 'line',
        source: 'areas',
        paint: {
          'line-color': leanMatch,
          'line-width': [
            'case', ['boolean', ['feature-state', 'selected'], false], 3, 1.4,
          ],
        },
      })

      // Anchor: one distinct marker for the city's centre of gravity. A labelled
      // pin, visually unlike the area fills — a reference point, not a transit
      // layer (no routes, stops or lines).
      if (anchor) {
        const el = document.createElement('div')
        el.className = 'rc-nb__anchor'
        el.innerHTML =
          '<span class="rc-nb__anchor-dot" aria-hidden="true"></span>' +
          `<span class="rc-nb__anchor-label">${anchorName ?? ''}</span>`
        new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([anchor.lng, anchor.lat])
          .addTo(map)
      }

      map.on('click', 'area-fill', (e) => {
        const f = e.features?.[0]
        if (f) setSelectedId(f.properties.id)
      })
      map.on('mouseenter', 'area-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'area-fill', () => {
        map.getCanvas().style.cursor = ''
      })
    },
    [geojson, anchor, anchorName],
  )

  // Mirror the React selection into the map's feature-state so the fill/outline
  // highlight tracks the panel.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource || !map.getSource('areas')) return
    if (prevSelected.current && prevSelected.current !== selectedId) {
      map.setFeatureState({ source: 'areas', id: prevSelected.current }, { selected: false })
    }
    if (selectedId) {
      map.setFeatureState({ source: 'areas', id: selectedId }, { selected: true })
    }
    prevSelected.current = selectedId
  }, [selectedId])

  return (
    <section className="rc-nb" aria-label="Where to stay">
      <div className="rc-nb__grid">
        <div className="rc-nb__mapwrap">
          <MapBase
            center={[anchor.lng, anchor.lat]}
            fitBounds={bounds}
            pmtilesUrl={pmtilesUrl}
            onReady={handleReady}
          />
          <div className="rc-nb__legend" aria-hidden="true">
            {LEGEND_ORDER.map((k) => (
              <span key={k} className="rc-nb__legend-item">
                <span className="rc-nb__legend-swatch" style={{ background: LEAN[k].color }} />
                {LEAN[k].label.replace(' your estimate', '')}
              </span>
            ))}
          </div>
        </div>

        <AreaPanel selected={selected} areas={areas} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <p className="rc-nb__disclosure">
        Our read of how stays in each area compare to this city&rsquo;s estimate — a
        judgment, not a calculation.{reviewed ? ` Reviewed ${reviewed}.` : ''}
      </p>
    </section>
  )
}

function AreaPanel({ selected, areas, selectedId, onSelect }) {
  return (
    <div className="rc-nb__panel">
      {/* A compact area switcher doubles the map click as a keyboard-reachable
          control — the map itself isn't a focus target. */}
      <div className="rc-nb__tabs" role="tablist" aria-label="Areas">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === selectedId}
            className={`rc-nb__tab${a.id === selectedId ? ' is-active' : ''}`}
            style={{ '--nb-lean': LEAN[a.lean].color }}
            onClick={() => onSelect(a.id)}
          >
            {a.name}
          </button>
        ))}
      </div>

      {selected && (
        <div className="rc-nb__detail" key={selected.id}>
          <div className="rc-nb__detail-head">
            <h3 className="rc-nb__area-name">{selected.name}</h3>
            <span
              className="rc-nb__lean-chip"
              style={{ '--nb-lean': LEAN[selected.lean].color }}
            >
              {LEAN[selected.lean].label}
            </span>
          </div>

          <p className="rc-nb__friction">
            <span className="rc-nb__friction-icon" aria-hidden="true">◍</span>
            {FRICTION_LABEL[selected.friction]}
          </p>

          <p className="rc-nb__character">{selected.character}</p>

          <div className="rc-nb__fit">
            <div className="rc-nb__fit-col">
              <h4 className="rc-nb__fit-title rc-nb__fit-title--stay">Stay here if</h4>
              <ul className="rc-nb__fit-list">
                {selected.stayIf.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="rc-nb__fit-col">
              <h4 className="rc-nb__fit-title rc-nb__fit-title--skip">Look elsewhere if</h4>
              <ul className="rc-nb__fit-list">
                {selected.skipIf.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
