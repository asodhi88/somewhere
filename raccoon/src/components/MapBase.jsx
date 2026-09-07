import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol, PMTiles } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * MapBase — the one component that knows the base map is MapLibre GL + Protomaps
 * PMTiles. Everything else (the neighbourhood module) talks to it only through
 * `onReady(map)` and never imports maplibre or pmtiles itself, so the tile source
 * can later swap (a different PMTiles extract, a hosted vector style, whatever)
 * as a one-file change — the same seam idea as getDestinations for data.
 *
 * Base tiles (mechanism PR): a self-hosted Protomaps PMTiles extract per city,
 * served from the app's own origin (public/tiles/<id>.pmtiles), no API key and no
 * runtime third-party call. When the extract is absent — the dev state until the
 * files are dropped in — the map degrades cleanly to a styled backdrop: the
 * neighbourhood polygons, anchor and legend still render, just without streets
 * underneath. The header probe keeps that path silent (no 404 noise) rather than
 * bolting on a broken vector source.
 *
 * Attribution: OSM + Protomaps is shown by MapLibre's attribution control, but
 * ONLY once the PMTiles base actually loads (its source carries the string), so a
 * backdrop-only map makes no attribution claim it isn't backing with tiles.
 */

// One protocol registration for the whole app. maplibre keys protocols by scheme
// globally, so registering per-mount would throw on the second map.
let protocol
function ensureProtocol() {
  if (protocol) return protocol
  protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  return protocol
}

// Two palettes for the base layers, matching the app's day/night ambient. Kept
// deliberately quiet — the base is context, the coloured areas are the subject.
const PALETTES = {
  night: {
    background: '#1a1614',
    earth: '#221c18',
    water: '#141d24',
    roads: '#3a322c',
    buildings: '#2b241f',
  },
  day: {
    background: '#e7ded1',
    earth: '#efe7d9',
    water: '#c9dbe4',
    roads: '#d8ccbb',
    buildings: '#e2d7c6',
  },
}

function currentPalette() {
  const ambient =
    (typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-ambient')) ||
    'night'
  return ambient === 'day' ? PALETTES.day : PALETTES.night
}

const ATTRIBUTION =
  '© <a href="https://openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noreferrer">Protomaps</a>'

// The Protomaps basemap vector schema exposes these source-layers; we render a
// quiet subset for street context. Layer names are stable across schema versions.
function basemapLayers(pal) {
  return [
    { id: 'base-earth', type: 'fill', source: 'basemap', 'source-layer': 'earth', paint: { 'fill-color': pal.earth } },
    { id: 'base-water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': pal.water } },
    { id: 'base-buildings', type: 'fill', source: 'basemap', 'source-layer': 'buildings', minzoom: 13, paint: { 'fill-color': pal.buildings } },
    { id: 'base-roads', type: 'line', source: 'basemap', 'source-layer': 'roads', paint: { 'line-color': pal.roads, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 15, 1.6] } },
  ]
}

export default function MapBase({
  center,
  zoom = 12.5,
  fitBounds,
  pmtilesUrl,
  onReady,
  className = 'rc-nb__map',
  ariaLabel = 'Neighbourhood map',
}) {
  const containerRef = useRef(null)
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    ensureProtocol()
    const pal = currentPalette()

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const map = new maplibregl.Map({
      container: el,
      center,
      zoom,
      attributionControl: false,
      // Backdrop-only style to start; the PMTiles base is added on load if the
      // extract is present. A missing extract just leaves this backdrop.
      style: {
        version: 8,
        // A blank glyphs endpoint isn't needed — we render no label layers here.
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': pal.background } }],
      },
      // No inertia/rotate flourishes — a small reference map, not a globe toy.
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
    })
    map.touchZoomRotate.disableRotation()
    // The map lives inside a scrollable overlay, so wheel-zoom would trap the
    // page scroll over it. Drag-pan stays; zoom is via the +/- control instead.
    map.scrollZoom.disable()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    let cancelled = false

    const addBase = async () => {
      if (!pmtilesUrl) return
      try {
        const pm = new PMTiles(pmtilesUrl)
        protocol.add(pm)
        const header = await pm.getHeader() // rejects if the extract is absent
        if (cancelled || !map.getSource) return
        map.addSource('basemap', {
          type: 'vector',
          url: `pmtiles://${pmtilesUrl}`,
          attribution: ATTRIBUTION,
          minzoom: header.minZoom ?? 0,
          maxzoom: header.maxZoom ?? 15,
        })
        for (const layer of basemapLayers(pal)) map.addLayer(layer)
        // Attribution only exists once real tiles back it (acceptance: shown iff
        // the PMTiles base is used).
        map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right')
      } catch {
        // No extract for this city yet — backdrop only, silently.
      }
    }

    map.on('load', async () => {
      await addBase()
      if (cancelled) return
      if (fitBounds) {
        map.fitBounds(fitBounds, { padding: 36, animate: !reduce, duration: reduce ? 0 : 600 })
      }
      onReadyRef.current?.(map)
    })

    return () => {
      cancelled = true
      map.remove()
    }
    // Center/zoom/bounds/url are read once at mount; the module remounts (via
    // React key) when the city changes, so we intentionally don't re-init here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className={className} role="application" aria-label={ariaLabel} />
}
