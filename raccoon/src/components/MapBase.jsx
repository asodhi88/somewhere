import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol, PMTiles } from 'pmtiles'
import { currentAmbient } from '../lib/ambient'
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * MapBase — the one component that knows the base map is MapLibre GL + Protomaps
 * PMTiles. Everything else (the neighbourhood module) talks to it only through
 * `onReady(map)` and never imports maplibre or pmtiles itself, so the tile source
 * can later swap (a different PMTiles extract, a hosted vector style, whatever)
 * as a one-file change — the same seam idea as getDestinations for data.
 *
 * Base tiles: a self-hosted Protomaps PMTiles extract per city, served from the
 * app's own origin (public/tiles/<id>.pmtiles), no API key and no runtime
 * third-party call. When the extract is absent — the dev state until the files
 * are dropped in — the map degrades cleanly to a styled backdrop: the district
 * and neighbourhood shapes, anchor and labels still render, just without streets
 * underneath. The header probe keeps that path silent (no 404 noise) rather than
 * bolting on a broken vector source.
 *
 * Attribution: OSM + Protomaps is shown by MapLibre's attribution control, but
 * ONLY once the PMTiles base actually loads (its source carries the string), so a
 * backdrop-only map makes no attribution claim it isn't backing with tiles.
 *
 * Zoom controls are deliberately NOT added here — the neighbourhood module draws
 * its own buttons over the canvas (design: Neighborhood Guidance v2) and drives
 * them through the map handed to `onReady`.
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
    background: '#101821',
    earth: '#16202a',
    water: '#0e1720',
    roads: '#2b3742',
    buildings: '#1b2630',
  },
  day: {
    background: '#f2ece1',
    earth: '#f6f1e7',
    water: '#dfe8ea',
    roads: '#e2d9cb',
    buildings: '#ebe3d6',
  },
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
  minZoom = 8,
  maxZoom = 14,
  fitBounds,
  pmtilesUrl,
  onReady,
  scrollZoom = false,
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
    const pal = PALETTES[currentAmbient()]

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const map = new maplibregl.Map({
      container: el,
      center,
      zoom,
      minZoom,
      maxZoom,
      attributionControl: false,
      // Backdrop-only style to start; the PMTiles base is added on load if the
      // extract is present. A missing extract just leaves this backdrop.
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': pal.background } }],
      },
      // No rotate/pitch flourishes — a reference map, not a globe toy.
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
    })
    map.touchZoomRotate.disableRotation()
    // Inline, the map sits in the scrolling page, so wheel-zoom would trap the
    // scroll over it; the module's own +/- buttons zoom instead. Full screen has
    // no page scroll to steal, so the wheel is enabled there.
    if (!scrollZoom) map.scrollZoom.disable()

    let cancelled = false

    const addBase = async () => {
      if (!pmtilesUrl) return
      try {
        const pm = new PMTiles(pmtilesUrl)
        protocol.add(pm)
        const header = await pm.getHeader() // rejects if the extract is absent
        if (cancelled) return
        map.addSource('basemap', {
          type: 'vector',
          url: `pmtiles://${pmtilesUrl}`,
          attribution: ATTRIBUTION,
          minzoom: header.minZoom ?? 0,
          maxzoom: header.maxZoom ?? 15,
        })
        for (const layer of basemapLayers(pal)) map.addLayer(layer)
        // Attribution only exists once real tiles back it.
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
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

    // The container is not a fixed box: it appears when a card expands, and its
    // width changes with the viewport and the full-screen layout. Without this
    // the GL canvas keeps whatever size it had at creation.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el)

    return () => {
      cancelled = true
      ro.disconnect()
      map.remove()
    }
    // Read once at mount; callers remount (via React key) when the city changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className={className} role="application" aria-label={ariaLabel} />
}
