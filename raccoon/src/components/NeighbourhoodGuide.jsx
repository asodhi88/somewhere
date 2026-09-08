import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import MapBase from './MapBase'
import { moneyRange } from '../lib/format'
import { currentAmbient } from '../lib/ambient'
import { LEAN, LEAN_ORDER, FRICTION_LABEL, formatReviewed } from '../lib/neighbourhoodVocab'

/**
 * Neighbourhood guidance — "you chose the city; now which part of it fits your
 * trip." (design: Neighborhood Guidance v2)
 *
 * The map colours each area by how its nightly stay LEANS against the city's
 * accommodation estimate — below / about / above. This is a disclosed, dated
 * editorial judgment in three qualitative buckets, never a computed figure: it
 * annotates the single accommodation number the user already saw with the rough
 * shape of its spread, and never feeds the ranking or the estimate. Colour
 * encodes price lean and nothing else — no safety, vibe or nightlife signal.
 *
 * v2 shape: the map expands INLINE inside the result card (and can go full
 * screen), with a two-level read — districts at low zoom, neighbourhoods once
 * you pass DRILL_ZOOM — so a twelve-area city stays legible.
 *
 * Tier decides what renders (honest coverage, not uniform coverage):
 *   full    → the chip + inline expansion (map, legend filters, panel).
 *   minimal → a designed editorial band owning the absence ("one core"), always
 *             visible, at full module weight — never a greyed-out empty state.
 *   none / no entry → nothing; the rest of the card is untouched.
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

/**
 * The MapLibre layer work for one map instance. Two of these can be alive at
 * once (inline + full screen); they share selection and filter state through
 * props, and each drives its own camera from the `camera` token.
 */
function NeighbourhoodMap({
  city,
  activeLeans,
  selectedId,
  camera,
  onSelectArea,
  onDrillDistrict,
  initialZoom,
  scrollZoom,
  overlay,
}) {
  const mapRef = useRef(null)
  const labelsRef = useRef([])
  const hoverRef = useRef(null)
  const tipRef = useRef(null)
  const readyRef = useRef(false)

  const { areas, districts = [], anchor } = city
  const ambient = currentAmbient()
  const night = ambient === 'night'

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

  // Repaint hover/selection emphasis. Ported from the design: the hovered shape
  // lifts and everything else drops back, so one area reads at a time.
  const paint = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('z-fill')) return
    const h = hoverRef.current
    for (const p of ['d', 'z']) {
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

  // Labels live as markers, not a symbol layer, so they need no glyph endpoint
  // (the PMTiles extract carries no fonts). Districts show below the drill zoom,
  // neighbourhoods above it, and both follow the active lean filter.
  const placeLabels = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const level = map.getZoom() >= DRILL_ZOOM ? 'zones' : 'districts'
    for (const l of labelsRef.current) {
      const on = l.level === level && activeLeans.includes(l.lean)
      l.el.style.display = on ? 'block' : 'none'
      l.el.dataset.dark = night ? '1' : '0'
      l.el.style.color = night ? '#f2ece1' : LEAN[l.lean].ink
    }
  }, [activeLeans, night])

  const handleReady = useCallback(
    (map) => {
      mapRef.current = map
      readyRef.current = true

      map.addSource('districts', { type: 'geojson', data: featureCollections.districts, promoteId: 'id' })
      map.addSource('zones', { type: 'geojson', data: featureCollections.zones, promoteId: 'id' })

      map.addLayer({ id: 'd-fill', type: 'fill', source: 'districts', maxzoom: DRILL_ZOOM, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } })
      map.addLayer({ id: 'd-line', type: 'line', source: 'districts', maxzoom: DRILL_ZOOM, paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.7 } })
      map.addLayer({ id: 'z-fill', type: 'fill', source: 'zones', minzoom: DRILL_ZOOM, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } })
      map.addLayer({ id: 'z-line', type: 'line', source: 'zones', minzoom: DRILL_ZOOM, paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.75 } })

      // Hover tooltip: name + lean band, the same two facts the legend encodes.
      const tip = document.createElement('div')
      tip.className = 'rc-nb__tip'
      map.getContainer().appendChild(tip)
      tipRef.current = tip

      for (const p of ['d', 'z']) {
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

      // Name labels for both levels.
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

  // Lean filter → hide non-matching neighbourhoods (districts always read as the
  // overview, so they stay).
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

  // Camera moves are token-driven so a click on the map (which shouldn't move the
  // view) is distinguishable from a click in a list (which should).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !camera) return
    const reduce = prefersReducedMotion()
    if (camera.kind === 'area') {
      const area = areas.find((a) => a.id === camera.id)
      if (area) {
        map.flyTo({ center: centroid(area.polygon), zoom: 12.2, duration: reduce ? 0 : 800 })
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

  return (
    <div className="rc-nb__canvas">
      <MapBase
        center={cityCenter}
        zoom={initialZoom}
        minZoom={8}
        maxZoom={14}
        pmtilesUrl={`/tiles/${city.cityId}.pmtiles`}
        onReady={handleReady}
        scrollZoom={scrollZoom}
      />
      <div className="rc-nb__mapctl">
        {overlay}
        <button type="button" className="rc-nb__mapbtn" aria-label="Zoom in" onClick={() => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + 1, duration: 260 })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" className="rc-nb__mapbtn" aria-label="Zoom out" onClick={() => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() - 1, duration: 260 })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- panel --- */

function LegendChips({ off, onToggle, variant }) {
  return (
    <div className={`rc-nb__legend rc-nb__legend--${variant}`}>
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

function AreaDetail({ area, onClear }) {
  const lean = LEAN[area.lean]
  return (
    <div className="rc-nb__detail" key={area.id}>
      <button type="button" className="rc-nb__back" onClick={onClear}>
        ← all districts
      </button>
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

function DistrictOverview({ city, cityName, onDrill }) {
  const districts = city.districts ?? []
  return (
    <div className="rc-nb__overview">
      <span className="rc-nb__overview-eyebrow">
        {cityName} · {districts.length ? `${districts.length} districts` : `${city.areas.length} areas`}
      </span>
      <p className="rc-nb__overview-text">
        {districts.length
          ? 'Pick a district to zoom into its neighbourhoods, or click any area to see how its stays lean against your estimate and who it suits.'
          : 'Click any area to see how its stays lean against your estimate and who it suits.'}
      </p>
      <div className="rc-nb__districts">
        {(districts.length ? districts : city.areas).map((d) => (
          <button key={d.id} type="button" className="rc-nb__district" onClick={() => onDrill(d.id)}>
            <span className="rc-nb__district-dot" style={{ background: LEAN[d.lean].color }} aria-hidden="true" />
            <span className="rc-nb__district-name">{d.name}</span>
            {districts.length > 0 && (
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

/* ------------------------------------------------------------ expansion --- */

/**
 * The inline expansion inside the result card, plus the full-screen view it can
 * promote to. Owns selection, lean filters and camera intent; both map instances
 * read the same state so the two views never disagree.
 */
export default function NeighbourhoodExpansion({ city, result, id, onCollapse }) {
  const [selectedId, setSelectedId] = useState(null)
  const [off, setOff] = useState({})
  const [fsOpen, setFsOpen] = useState(false)
  const [camera, setCamera] = useState(null)
  const nonce = useRef(0)

  const activeLeans = useMemo(() => LEAN_ORDER.filter((k) => !off[k]), [off])
  const selected = city.areas.find((a) => a.id === selectedId) || null
  const reviewed = formatReviewed(city.reviewedOn)

  const move = useCallback((kind, id) => {
    nonce.current += 1
    setCamera({ kind, id, n: nonce.current })
  }, [])

  const selectArea = useCallback((areaId) => setSelectedId(areaId), [])
  const focusArea = useCallback((areaId) => {
    setSelectedId(areaId)
    move('area', areaId)
  }, [move])
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

  // Escape leaves full screen (the inline expansion stays put).
  useEffect(() => {
    if (!fsOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setFsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [fsOpen])

  const panel = selected ? (
    <AreaDetail area={selected} onClear={clearSelection} />
  ) : (
    <DistrictOverview city={city} cityName={result.city} onDrill={drillDistrict} />
  )

  const disclosure = (
    <p className="rc-nb__disclosure">
      Our read of how stays in each area compare to this city&rsquo;s estimate — a
      judgment, not a calculation.{reviewed ? ` Reviewed ${reviewed}.` : ''}
    </p>
  )

  return (
    <div className="rc-nb" id={id}>
      <div className="rc-nb__bar">
        <span className="rc-nb__bar-title">Where to stay</span>
        <LegendChips off={off} onToggle={toggleLean} variant="bar" />
        <button type="button" className="rc-nb__collapse" onClick={onCollapse}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
          Collapse
        </button>
      </div>

      <div className="rc-nb__body">
        <NeighbourhoodMap
          city={city}
          activeLeans={activeLeans}
          selectedId={selectedId}
          camera={camera}
          onSelectArea={selectArea}
          onDrillDistrict={drillDistrict}
          initialZoom={9.5}
          scrollZoom={false}
          overlay={
            <button type="button" className="rc-nb__mapbtn" aria-label="Full screen" onClick={() => setFsOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
            </button>
          }
        />
        <div className="rc-nb__side">{panel}</div>
      </div>

      {disclosure}

      {fsOpen && (
        <div className="rc-nb__fs" role="dialog" aria-modal="true" aria-label={`${result.city} neighbourhoods`}>
          <div className="rc-nb__fs-inner">
            <aside className="rc-nb__rail">
              <div className="rc-nb__rail-head">
                <span className="rc-nb__rail-city">{result.city}</span>
                <span className="rc-nb__rail-sub">{result.country}</span>
                {result.cost && (
                  <>
                    <span className="rc-nb__rail-cost tnum">
                      {moneyRange(result.cost.low, result.cost.high)}
                    </span>
                    <span className="rc-nb__rail-note">whole-trip range</span>
                  </>
                )}
              </div>

              <div className="rc-nb__rail-group">
                <span className="rc-nb__rail-label">Filter by price lean</span>
                <LegendChips off={off} onToggle={toggleLean} variant="rail" />
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
              initialZoom={10.1}
              scrollZoom
              overlay={
                <button type="button" className="rc-nb__mapbtn" aria-label="Close full screen" onClick={() => setFsOpen(false)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              }
            />

            <div className="rc-nb__fs-panel">
              {selected ? (
                <AreaDetail area={selected} onClear={clearSelection} />
              ) : (
                <div className="rc-nb__overview">
                  <span className="rc-nb__overview-eyebrow">Nothing selected</span>
                  <p className="rc-nb__overview-text">
                    Hover an area to see its name and how its stays lean against your
                    estimate. Click to pin the details here — how you&rsquo;ll reach the
                    centre, and who it suits.
                  </p>
                </div>
              )}
              {disclosure}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
