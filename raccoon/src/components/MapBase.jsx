import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol, PMTiles } from 'pmtiles'
import { currentAmbient } from '../lib/ambient'
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * MapBase — the one component that knows the base map is MapLibre GL + Protomaps
 * PMTiles. Everything else (the neighbourhood module) talks to it only through
 * `onReady(map)` and never imports maplibre or pmtiles itself, so the tile source
 * can later swap (a bigger extract, a full-planet file, a hosted provider) as a
 * one-URL change — the same seam idea as getDestinations for data.
 *
 * Base tiles: ONE self-hosted multi-region extract covering every seed city, not
 * a file per city — so there is no filename resolution by city id here. The
 * region source is committed at tiles/cities.geojson; adding a city means adding
 * a polygon, re-cutting and re-uploading. The extract itself is build output and
 * is gitignored. No API key, no runtime third-party call.
 *
 * Attribution: © OpenStreetMap is an ODbL obligation, so it is rendered as soon
 * as the source is declared and is never conditional on load success.
 */

// The single multi-region extract. Chosen to scale to 150-200 cities, where
// per-city files would not.
export const PMTILES_URL =
  'https://yftlayj7jhygl1oe.public.blob.vercel-storage.com/somewhere.pmtiles'

// The extract is cut at z13; the map must not invite detail past it.
export const BASE_MAX_ZOOM = 13

// One protocol registration for the whole app. maplibre keys protocols by scheme
// globally, so registering per-mount would throw on the second map.
let protocol
function ensureProtocol() {
  if (protocol) return protocol
  protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  return protocol
}

// One shared PMTiles instance: every map reads the same file, so they share its
// header/directory cache instead of re-fetching per mount.
let archive
function ensureArchive() {
  if (!archive) {
    archive = new PMTiles(PMTILES_URL)
    ensureProtocol().add(archive)
  }
  return archive
}

// Two palettes for the base layers, matching the app's day/night ambient. Kept
// deliberately quiet — the base is context, the coloured areas are the subject.
const PALETTES = {
  night: {
    background: '#101821',
    earth: '#16202a',
    landcover: '#182430',
    water: '#0e1720',
    roads: '#2b3742',
    buildings: '#1b2630',
  },
  day: {
    background: '#f2ece1',
    earth: '#f6f1e7',
    landcover: '#eceadb',
    water: '#dfe8ea',
    roads: '#e2d9cb',
    buildings: '#ebe3d6',
  },
}

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noreferrer">Protomaps</a>'

// The Protomaps basemap schema exposes these source-layers (verified against the
// extract's metadata). A quiet subset is enough for street context.
function basemapLayers(pal) {
  return [
    { id: 'base-earth', type: 'fill', source: 'basemap', 'source-layer': 'earth', paint: { 'fill-color': pal.earth } },
    { id: 'base-landcover', type: 'fill', source: 'basemap', 'source-layer': 'landcover', paint: { 'fill-color': pal.landcover, 'fill-opacity': 0.6 } },
    { id: 'base-water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': pal.water } },
    { id: 'base-buildings', type: 'fill', source: 'basemap', 'source-layer': 'buildings', minzoom: 12, paint: { 'fill-color': pal.buildings } },
    {
      id: 'base-roads',
      type: 'line',
      source: 'basemap',
      'source-layer': 'roads',
      paint: {
        'line-color': pal.roads,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 13, 1.6],
      },
    },
  ]
}

export default function MapBase({
  center,
  zoom = 12,
  minZoom = 8,
  maxZoom = BASE_MAX_ZOOM,
  fitBounds,
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
    ensureArchive()
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
      style: {
        version: 8,
        sources: {
          basemap: {
            type: 'vector',
            url: `pmtiles://${PMTILES_URL}`,
            attribution: ATTRIBUTION,
            minzoom: 0,
            maxzoom: BASE_MAX_ZOOM,
          },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': pal.background } },
          ...basemapLayers(pal),
        ],
      },
      // No rotate/pitch flourishes — a reference map, not a globe toy.
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
    })
    map.touchZoomRotate.disableRotation()
    // In the page, wheel-zoom would trap the scroll over the map; the module's
    // own +/- buttons zoom instead. The overlay has no page scroll to steal.
    if (!scrollZoom) map.scrollZoom.disable()

    // ODbL: the credit is an obligation, so it is passed as customAttribution
    // rather than left to the source's own string — that way it renders even if
    // tiles are slow or fail, instead of silently disappearing with them.
    map.addControl(
      new maplibregl.AttributionControl({ compact: false, customAttribution: ATTRIBUTION }),
      'bottom-right',
    )

    let cancelled = false
    map.on('load', () => {
      if (cancelled) return
      if (fitBounds) {
        map.fitBounds(fitBounds, { padding: 36, animate: !reduce, duration: reduce ? 0 : 600 })
      }
      onReadyRef.current?.(map)
    })

    // The container is not a fixed box: it appears with the overlay and changes
    // with the viewport. Without this the GL canvas keeps its creation-time size.
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
