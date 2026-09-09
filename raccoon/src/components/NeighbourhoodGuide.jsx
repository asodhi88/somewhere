import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import MapBase, { BASE_MAX_ZOOM } from './MapBase'
import { currentAmbient } from '../lib/ambient'
import { LEAN, LEAN_ORDER, FRICTION_LABEL, formatReviewed } from '../lib/neighbourhoodVocab'

/**
 * NeighbourhoodModule — "you chose the city; now which part of it fits your trip."
 *
 * The map colours each area by how its nightly stay LEANS against the city's
 * accommodation estimate — below / about / above. This is a disclosed, dated
 * editorial judgment in three qualitative buckets, never a computed figure: it
 * annotates the single accommodation number the user already saw with the rough
 * shape of its spread, and never feeds the ranking or the estimate. Colour
 * encodes price lean and nothing else — no safety, vibe or nightlife signal.
 *
 * The module reads only from getNeighbourhoods(), so it moves into the routed
 * /destination/:id view later unchanged; today it is mounted in the thin
 * DestinationDetail overlay.
 *
 * Where a city carries a `districts` layer the map reads at two levels —
 * districts at low zoom, neighbourhoods past DRILL_ZOOM — so a twelve-area city
 * stays legible. The layer is optional: a city without it (Havana) renders a
 * single-level map and an area list instead.
 */

// Above this zoom the map reads as neighbourhoods; below it, as districts.
const DRILL_ZOOM = 10.6

function centroid(polygon) {
  const ring = polygon.coordinates[0]
  const n = ring.length - 1
  let x = 0
  let y = 0
  for (let i = 0; i < n; i++) {
    x += ring[i][0]
    y += ring[i][1]
  }
  return [x / n, y / n]
}

function boundsOf(items) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const it of items) {
    for (const ring of it.polygon.coordinates) {
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

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/* ------------------------------------------------------------------ map --- */

function NeighbourhoodMap({
  city,
  activeLeans,
  selectedId,
  camera,
  onSelectArea,
  onDrillDistrict,
  initialZoom,
}) {
  const mapRef = useRef(null)
  const labelsRef = useRef([])
  const hoverRef = useRef(null)
  const readyRef = useRef(false)

  const { areas, districts = [], anchor } = city
  const night = currentAmbient() === 'night'

  const cityCenter = useMemo(
    () => (anchor ? [anchor.lng, anchor.lat] : centroid(areas[0].polygon)),
    [anchor, areas],
  )

  const featureCollections = useMemo(() => {
    const feat = (kind, list) => ({
      type: 'FeatureCollection',
      features: list.map((it) => ({
        type: 'Feature',
        id: it.id,
        properties: { kind, id: it.id, name: it.name, lean: it.lean, color: LEAN[it.lean].color },
        geometry: it.polygon,
      })),
    })
    return { districts: feat('district', districts), zones: feat('zone', areas) }
  }, [areas, districts])

  // Repaint hover/selection emphasis: the hovered shape lifts and everything
  // else drops back, so one area reads at a time.
  const paint = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('z-fill')) return
    const h = hoverRef.current
    for (const p of ['d', 'z']) {
      if (!map.getLayer(`${p}-fill`)) continue
      const base = night ? 0.3 : 0.22
      let fill = base
      if (h && h.layer === p) {
        fill = ['case', ['==', ['id'], h.id], night ? 0.52 : 0.44, night ? 0.12 : 0.09]
      } else if (h) {
        fill = night ? 0.1 : 0.08
      }
      map.setPaintProperty(`${p}-fill`, 'fill-opacity', fill)
      map.setPaintProperty(
        `${p}-line`,
        'line-width',
        h && h.layer === p ? ['case', ['==', ['id'], h.id], 2.6, 1] : 1.4,
      )
    }
    if (selectedId) {
      map.setPaintProperty('z-line', 'line-width', ['case', ['==', ['get', 'id'], selectedId], 2.8, 1.2])
    }
  }, [night, selectedId])

  // Labels are markers, not a symbol layer, so they need no glyph endpoint (the
  // extract carries no fonts). Districts show below the drill zoom,
  // neighbourhoods above it, and both follow the active lean filter.
  const placeLabels = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const hasDistricts = districts.length > 0
    const level = !hasDistricts || map.getZoom() >= DRILL_ZOOM ? 'zones' : 'districts'
    for (const l of labelsRef.current) {
      const on = l.level === level && activeLeans.includes(l.lean)
      l.el.style.display = on ? 'block' : 'none'
      l.el.dataset.dark = night ? '1' : '0'
      l.el.style.color = night ? '#f2ece1' : LEAN[l.lean].ink
    }
  }, [activeLeans, night, districts.length])

  const handleReady = useCallback(
    (map) => {
      mapRef.current = map
      readyRef.current = true
      const hasDistricts = districts.length > 0

      map.addSource('zones', { type: 'geojson', data: featureCollections.zones, promoteId: 'id' })
      // Without a district layer the neighbourhoods are the only level, so they
      // must not be hidden below the drill zoom.
      map.addLayer({ id: 'z-fill', type: 'fill', source: 'zones', minzoom: hasDistricts ? DRILL_ZOOM : 0, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } })
      map.addLayer({ id: 'z-line', type: 'line', source: 'zones', minzoom: hasDistricts ? DRILL_ZOOM : 0, paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.75 } })

      if (hasDistricts) {
        map.addSource('districts', { type: 'geojson', data: featureCollections.districts, promoteId: 'id' })
        map.addLayer({ id: 'd-fill', type: 'fill', source: 'districts', maxzoom: DRILL_ZOOM, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } }, 'z-fill')
        map.addLayer({ id: 'd-line', type: 'line', source: 'districts', maxzoom: DRILL_ZOOM, paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.7 } }, 'z-fill')
      }

      // Hover readout: name + lean band, the same two facts the legend encodes.
      const tip = document.createElement('div')
      tip.className = 'rc-nb__tip'
      map.getContainer().appendChild(tip)

      for (const p of hasDistricts ? ['d', 'z'] : ['z']) {
        map.on('mousemove', `${p}-fill`, (e) => {
          const f = e.features?.[0]
          if (!f) return
          map.getCanvas().style.cursor = 'pointer'
          hoverRef.current = { layer: p, id: f.id }
          const lean = LEAN[f.properties.lean]
          tip.style.display = 'block'
          tip.style.left = `${e.point.x}px`
          tip.style.top = `${e.point.y}px`
          tip.innerHTML = ''
          const name = document.createElement('span')
          name.className = 'rc-nb__tip-name'
          name.textContent = f.properties.name
          const band = document.createElement('span')
          band.className = 'rc-nb__tip-band'
          band.style.color = lean.ink
          band.textContent = ` · ${lean.label}`
          tip.append(name, band)
          paint()
        })
        map.on('mouseleave', `${p}-fill`, () => {
          map.getCanvas().style.cursor = ''
          hoverRef.current = null
          tip.style.display = 'none'
          paint()
        })
        map.on('click', `${p}-fill`, (e) => {
          const f = e.features?.[0]
          if (!f) return
          if (p === 'd') onDrillDistrict(f.properties.id)
          else onSelectArea(f.properties.id)
        })
      }

      // A single reference pin at the city's centre of gravity. Visually distinct
      // from the translucent fills; not a route or a stop, and never filtered out.
      if (anchor) {
        const el = document.createElement('div')
        el.className = 'rc-nb__anchor'
        const label = document.createElement('span')
        label.className = 'rc-nb__anchor-label'
        label.textContent = anchor.name ?? ''
        const pin = document.createElement('span')
        pin.className = 'rc-nb__anchor-pin'
        pin.innerHTML =
          '<svg width="22" height="28" viewBox="0 0 22 28" fill="none" aria-hidden="true"><path d="M11 27C11 27 20 17.6 20 10.6C20 5.3 15.97 1 11 1C6.03 1 2 5.3 2 10.6C2 17.6 11 27 11 27Z" fill="currentColor" stroke="#ffffff" stroke-width="1.6"/><circle cx="11" cy="10.6" r="3.4" fill="#ffffff"/></svg>'
        el.append(label, pin)
        new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([anchor.lng, anchor.lat]).addTo(map)
      }

      const mk = (list, level) => {
        for (const it of list) {
          const el = document.createElement('div')
          el.className = 'rc-nb__label'
          el.textContent = it.name
          new maplibregl.Marker({ element: el }).setLngLat(centroid(it.polygon)).addTo(map)
          labelsRef.current.push({ el, level, lean: it.lean })
        }
      }
      mk(districts, 'districts')
      mk(areas, 'zones')

      const onZoom = () => placeLabels()
      map.on('zoom', onZoom)
      map.on('moveend', onZoom)

      placeLabels()
      paint()
    },
    [featureCollections, districts, areas, anchor, onDrillDistrict, onSelectArea, paint, placeLabels],
  )

  // Lean filter → hide non-matching neighbourhoods (districts stay: they are the
  // overview, and a district can hold areas from more than one band).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !map.getLayer('z-fill')) return
    const filter = ['match', ['get', 'lean'], activeLeans.length ? activeLeans : ['__none__'], true, false]
    map.setFilter('z-fill', filter)
    map.setFilter('z-line', filter)
    placeLabels()
  }, [activeLeans, placeLabels])

  useEffect(() => {
    paint()
  }, [paint])

  // Camera moves are token-driven, so a click on the map (which shouldn't move
  // the view) is distinguishable from a click in a list (which should).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !camera) return
    const reduce = prefersReducedMotion()
    if (camera.kind === 'area') {
      const area = areas.find((a) => a.id === camera.id)
      if (area) {
        map.flyTo({ center: centroid(area.polygon), zoom: Math.min(12.2, BASE_MAX_ZOOM), duration: reduce ? 0 : 800 })
      }
    } else if (camera.kind === 'district') {
      const members = areas.filter((a) => a.district === camera.id)
      if (members.length) {
        const cam = map.cameraForBounds(boundsOf(members), { padding: 60 })
        // A wide district can fit below DRILL_ZOOM, which would leave the
        // neighbourhood layers switched off — clamp past the threshold.
        const z = Math.min(12.6, Math.max(cam?.zoom ?? DRILL_ZOOM, DRILL_ZOOM + 0.15))
        map.easeTo({ center: cam?.center ?? map.getCenter(), zoom: z, duration: reduce ? 0 : 900 })
      }
    } else if (camera.kind === 'reset') {
      map.easeTo({ center: cityCenter, zoom: initialZoom, duration: reduce ? 0 : 700 })
    }
    // Only the token drives a move; the data deps are read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  const zoomBy = (d) => {
    const map = mapRef.current
    if (map) map.easeTo({ zoom: map.getZoom() + d, duration: 260 })
  }

  return (
    <div className="rc-nb__canvas">
      <MapBase
        center={cityCenter}
        zoom={initialZoom}
        onReady={handleReady}
        scrollZoom
      />
      <div className="rc-nb__mapctl">
        <button type="button" className="rc-nb__mapbtn" aria-label="Zoom in" onClick={() => zoomBy(1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" className="rc-nb__mapbtn" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- panel --- */

function LegendChips({ off, onToggle }) {
  return (
    <div className="rc-nb__legend">
      {LEAN_ORDER.map((k) => {
        const on = !off[k]
        return (
          <button
            key={k}
            type="button"
            className={`rc-nb__legend-chip${on ? ' is-on' : ''}`}
            aria-pressed={on}
            style={on ? { '--nb-lean': LEAN[k].color, '--nb-ink': LEAN[k].ink } : undefined}
            onClick={() => onToggle(k)}
          >
            <span className="rc-nb__legend-dot" style={{ background: LEAN[k].color }} aria-hidden="true" />
            {LEAN[k].label}
          </button>
        )
      })}
    </div>
  )
}

function AreaDetail({ area, onClear, canClear }) {
  const lean = LEAN[area.lean]
  return (
    <div className="rc-nb__detail" key={area.id}>
      {canClear && (
        <button type="button" className="rc-nb__back" onClick={onClear}>
          ← all districts
        </button>
      )}
      <div className="rc-nb__detail-head">
        <span className="rc-nb__area-name">{area.name}</span>
        <span className="rc-nb__lean-tag" style={{ color: lean.ink }}>{lean.label}</span>
      </div>
      <p className="rc-nb__character">{area.character}</p>
      {area.summary && <p className="rc-nb__summary">{area.summary}</p>}

      <div className="rc-nb__field">
        <span className="rc-nb__field-label">Getting to the centre</span>
        <span className="rc-nb__field-value">{FRICTION_LABEL[area.friction]}</span>
      </div>

      <div className="rc-nb__field">
        <span className="rc-nb__field-label rc-nb__field-label--stay">Stay here if</span>
        {area.stayIf.map((t, i) => (
          <span key={i} className="rc-nb__fit">
            <span className="rc-nb__fit-mark rc-nb__fit-mark--stay" aria-hidden="true">+</span>
            {t}
          </span>
        ))}
      </div>
      <div className="rc-nb__field">
        <span className="rc-nb__field-label rc-nb__field-label--skip">Skip it if</span>
        {area.skipIf.map((t, i) => (
          <span key={i} className="rc-nb__fit">
            <span className="rc-nb__fit-mark rc-nb__fit-mark--skip" aria-hidden="true">–</span>
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

function Overview({ city, cityName, onDrill, onSelect }) {
  const districts = city.districts ?? []
  const hasDistricts = districts.length > 0
  return (
    <div className="rc-nb__overview">
      <span className="rc-nb__overview-eyebrow">
        {cityName} · {hasDistricts ? `${districts.length} districts` : `${city.areas.length} areas`}
      </span>
      <p className="rc-nb__overview-text">
        {hasDistricts
          ? 'Pick a district to zoom into its neighbourhoods, or click any area to see how its stays lean against your estimate and who it suits.'
          : 'Click any area to see how its stays lean against your estimate and who it suits.'}
      </p>
      <div className="rc-nb__districts">
        {(hasDistricts ? districts : city.areas).map((d) => (
          <button
            key={d.id}
            type="button"
            className="rc-nb__district"
            onClick={() => (hasDistricts ? onDrill(d.id) : onSelect(d.id))}
          >
            <span className="rc-nb__district-dot" style={{ background: LEAN[d.lean].color }} aria-hidden="true" />
            <span className="rc-nb__district-name">{d.name}</span>
            {hasDistricts && (
              <span className="rc-nb__district-count tnum">
                {city.areas.filter((a) => a.district === d.id).length}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- module --- */

export default function NeighbourhoodModule({ city, cityName }) {
  const [selectedId, setSelectedId] = useState(null)
  const [off, setOff] = useState({})
  const [camera, setCamera] = useState(null)
  const nonce = useRef(0)

  const activeLeans = useMemo(() => LEAN_ORDER.filter((k) => !off[k]), [off])
  const selected = city.areas.find((a) => a.id === selectedId) || null
  const reviewed = formatReviewed(city.reviewedOn)
  const hasDistricts = (city.districts?.length ?? 0) > 0

  const move = useCallback((kind, id) => {
    nonce.current += 1
    setCamera({ kind, id, n: nonce.current })
  }, [])

  const selectArea = useCallback((areaId) => setSelectedId(areaId), [])
  const focusArea = useCallback(
    (areaId) => {
      setSelectedId(areaId)
      move('area', areaId)
    },
    [move],
  )
  const drillDistrict = useCallback(
    (districtId) => {
      const first = city.areas.find((a) => a.district === districtId)
      setSelectedId(first ? first.id : null)
      move('district', districtId)
    },
    [city.areas, move],
  )
  const clearSelection = useCallback(() => {
    setSelectedId(null)
    move('reset')
  }, [move])

  const toggleLean = useCallback((k) => setOff((p) => ({ ...p, [k]: !p[k] })), [])

  return (
    <section className="rc-nb" aria-label="Where to stay">
      <div className="rc-nb__body">
        <aside className="rc-nb__rail">
          <div className="rc-nb__rail-group">
            <span className="rc-nb__rail-label">Filter by price lean</span>
            <LegendChips off={off} onToggle={toggleLean} />
          </div>
          <div className="rc-nb__rail-group">
            <span className="rc-nb__rail-label">Neighbourhoods</span>
            <div className="rc-nb__zones">
              {city.areas
                .filter((a) => activeLeans.includes(a.lean))
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`rc-nb__zone${a.id === selectedId ? ' is-active' : ''}`}
                    style={{ '--nb-lean': LEAN[a.lean].color }}
                    onClick={() => focusArea(a.id)}
                  >
                    <span className="rc-nb__zone-dot" aria-hidden="true" />
                    <span className="rc-nb__zone-name">{a.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </aside>

        <NeighbourhoodMap
          city={city}
          activeLeans={activeLeans}
          selectedId={selectedId}
          camera={camera}
          onSelectArea={selectArea}
          onDrillDistrict={drillDistrict}
          initialZoom={hasDistricts ? 9.5 : 11.6}
        />

        <div className="rc-nb__panel">
          {selected ? (
            <AreaDetail area={selected} onClear={clearSelection} canClear={hasDistricts} />
          ) : (
            <Overview city={city} cityName={cityName} onDrill={drillDistrict} onSelect={focusArea} />
          )}
        </div>
      </div>

      <p className="rc-nb__disclosure">
        Our read of how stays in each area compare to this city&rsquo;s estimate — a
        judgment, not a calculation.{reviewed ? ` Reviewed ${reviewed}.` : ''}
      </p>
    </section>
  )
}
