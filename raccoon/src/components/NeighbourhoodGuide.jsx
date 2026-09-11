import { useCallback, useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import MapBase, { BASE_MAX_ZOOM } from './MapBase'
import { currentAmbient } from '../lib/ambient'
import { LEAN, LEAN_ORDER, FRICTION_LABEL, formatReviewed } from '../lib/neighbourhoodVocab'
import {
  DRILL_ZOOM,
  FIT_PADDING,
  boundsOf,
  centroid,
  fitFor,
} from '../lib/neighbourhoodGeometry'

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

  // Frame the city by what it actually draws — see fitFor().
  const fit = useMemo(() => fitFor(city), [city])

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
  //
  // Every fill fades as you zoom in. Far out the fill IS the information — the
  // shape of the lean across the city. Close in the basemap has real detail
  // (streets, blocks, parks) and a wash over it hides exactly what the reader
  // zoomed in to see, so the boundary hands over to its stroke.
  const paint = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('z-fill')) return
    const h = hoverRef.current
    const isId = (id) => ['==', ['get', 'id'], id]

    // The zoom curve must be the OUTERMOST expression and there may be only one
    // of them, so the per-feature `case` goes inside each stop — not a `case`
    // choosing between two curves, which the style spec rejects outright.
    const fade = (far, close) => ['interpolate', ['linear'], ['zoom'], 11, far, 14, close]
    const pick = (id, hit, miss) => [
      ['case', isId(id), hit[0], miss[0]],
      ['case', isId(id), hit[1], miss[1]],
    ]

    // [far, close] opacity pairs.
    const F = night
      ? { base: [0.3, 0.1], selected: [0.36, 0.15], hover: [0.52, 0.22], dim: [0.12, 0.05] }
      : { base: [0.22, 0.06], selected: [0.28, 0.1], hover: [0.44, 0.16], dim: [0.09, 0.03] }

    for (const p of ['d', 'z']) {
      if (!map.getLayer(`${p}-fill`)) continue

      let fill
      if (h && h.layer === p) fill = fade(...pick(h.id, F.hover, F.dim))
      else if (h) fill = fade(F.dim[0], F.dim[1])
      else if (p === 'z' && selectedId) fill = fade(...pick(selectedId, F.selected, F.base))
      else fill = fade(F.base[0], F.base[1])
      map.setPaintProperty(`${p}-fill`, 'fill-opacity', fill)

      // The stroke thickens with zoom to carry the state the fill gives up.
      let width
      if (h && h.layer === p) width = fade(...pick(h.id, [2.6, 3.2], [1, 1]))
      else if (p === 'z' && selectedId) width = fade(...pick(selectedId, [2.8, 4], [1.2, 1.2]))
      else width = 1.4
      map.setPaintProperty(`${p}-line`, 'line-width', width)
      map.setPaintProperty(
        `${p}-line`,
        'line-opacity',
        p === 'z' && selectedId ? ['case', isId(selectedId), 1, 0.55] : 0.75,
      )
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
      map.fitBounds(fit.bounds, {
        padding: FIT_PADDING,
        maxZoom: fit.maxZoom,
        duration: reduce ? 0 : 700,
      })
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
        fitBounds={fit.bounds}
        fitMaxZoom={fit.maxZoom}
        fitPadding={FIT_PADDING}
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

function LegendChips({ off, onToggle, variant = 'rail' }) {
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

/**
 * The map module in one of two layouts:
 *   inline  — inside a result tile: a bar (filters, full-screen, collapse) over
 *             map + panel. The reader's first step.
 *   overlay — inside the detail overlay: rail (filters + area list) / map /
 *             panel. Only reached by an explicit full-screen click.
 * Both are driven by a `state` from useNeighbourhoodState, so the two agree.
 */
export default function NeighbourhoodModule({
  city,
  cityName,
  state,
  variant = 'overlay',
  onFullscreen,
  onCollapse,
}) {
  const {
    selectedId, off, camera, activeLeans, selected, hasDistricts,
    selectArea, focusArea, drillDistrict, clearSelection, toggleLean,
  } = state
  const reviewed = formatReviewed(city.reviewedOn)
  const inline = variant === 'inline'

  const areaList = (
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
  )

  return (
    <section className={`rc-nb rc-nb--${variant}`} aria-label="Where to stay">
      {inline && (
        <div className="rc-nb__bar">
          <span className="rc-nb__bar-title">Where to stay</span>
          <LegendChips off={off} onToggle={toggleLean} variant="bar" />
          <button type="button" className="rc-nb__barbtn" onClick={onFullscreen}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
            Full screen
          </button>
          <button type="button" className="rc-nb__barbtn" onClick={onCollapse}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
            Collapse
          </button>
        </div>
      )}

      <div className="rc-nb__body">
        {/* Inline keeps the filters in the bar and drops the area list — the
            tile is a preview, and the list is what full screen adds. */}
        {!inline && (
          <aside className="rc-nb__rail">
            <div className="rc-nb__rail-group">
              <span className="rc-nb__rail-label">Filter by price lean</span>
              <LegendChips off={off} onToggle={toggleLean} variant="rail" />
            </div>
            <div className="rc-nb__rail-group">
              <span className="rc-nb__rail-label">Neighbourhoods</span>
              {areaList}
            </div>
          </aside>
        )}

        <NeighbourhoodMap
          city={city}
          activeLeans={activeLeans}
          selectedId={selectedId}
          camera={camera}
          onSelectArea={selectArea}
          onDrillDistrict={drillDistrict}
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
