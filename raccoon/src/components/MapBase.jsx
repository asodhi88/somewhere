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
//
// The filename carries the Protomaps build date it was cut from, and each
// re-cut is uploaded under a NEW name rather than overwriting the old one:
// Blob serves these with a month-long max-age, so overwriting in place would
// leave CDN edges handing out a stale extract, and a city seeded in this repo
// would render over blank tiles for no visible reason. Changing this constant
// is therefore how a re-cut ships. See tiles/README.md.
export const PMTILES_URL =
  'https://yftlayj7jhygl1oe.public.blob.vercel-storage.com/somewhere-z14-20260910.pmtiles'

// The extract is cut at z14; the map must not invite detail past it.
export const BASE_MAX_ZOOM = 14

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
    landuse: '#1a2530',
    water: '#0e1720',
    roads: '#2b3742',
    roadsMajor: '#36444f',
    buildings: '#1e2a35',
    label: '#6f7d8a',
    labelPlace: '#8492a0',
    labelHalo: '#101821',
  },
  day: {
    background: '#f2ece1',
    earth: '#f6f1e7',
    landcover: '#eceadb',
    landuse: '#ece7d6',
    water: '#dfe8ea',
    roads: '#e0d6c6',
    roadsMajor: '#d6c9b4',
    buildings: '#e6ddcd',
    label: '#a1968a',
    labelPlace: '#8c8175',
    labelHalo: '#f2ece1',
  },
}

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noreferrer">Protomaps</a>'

// The Protomaps basemap schema exposes these source-layers, with these zoom
// ranges (verified against the extract's metadata — landcover really does stop
// at z7, which is why landuse carries the close-in texture). A quiet subset is
// enough for street context.
function basemapLayers(pal) {
  return [
    { id: 'base-earth', type: 'fill', source: 'basemap', 'source-layer': 'earth', paint: { 'fill-color': pal.earth } },
    { id: 'base-landcover', type: 'fill', source: 'basemap', 'source-layer': 'landcover', maxzoom: 8, paint: { 'fill-color': pal.landcover, 'fill-opacity': 0.6 } },
    { id: 'base-landuse', type: 'fill', source: 'basemap', 'source-layer': 'landuse', minzoom: 8, paint: { 'fill-color': pal.landuse, 'fill-opacity': 0.7 } },
    { id: 'base-water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': pal.water } },
    { id: 'base-buildings', type: 'fill', source: 'basemap', 'source-layer': 'buildings', minzoom: 13, paint: { 'fill-color': pal.buildings, 'fill-opacity': 0.55 } },
    // Two road passes so the close-in view has a hierarchy rather than a mesh
    // of identical hairlines: minor streets stay thin, through-routes carry.
    {
      id: 'base-roads-minor',
      type: 'line',
      source: 'basemap',
      'source-layer': 'roads',
      filter: ['!', ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]]],
      paint: {
        'line-color': pal.roads,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.25, 14, 1.2],
      },
    },
    {
      id: 'base-roads-major',
      type: 'line',
      source: 'basemap',
      'source-layer': 'roads',
      filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]],
      paint: {
        'line-color': pal.roadsMajor,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 2.6],
      },
    },

    // Labels are deliberately subordinate: low-contrast ink, small sizes, and a
    // halo only strong enough to survive the road lines. The price-lean polygons
    // are the subject; these are here so the reader can orient, not read a
    // street atlas. They sit below the module's layers, which are added after.
    {
      id: 'base-label-place',
      type: 'symbol',
      source: 'basemap',
      'source-layer': 'places',
      minzoom: 11,
      // Local granularity only. Country/region/city labels would duplicate — and
      // fight with — the module's own district and area markers.
      filter: [
        'all',
        ['has', 'name'],
        ['in', ['get', 'kind'], ['literal', ['neighbourhood', 'suburb', 'quarter', 'locality', 'village', 'town']]],
      ],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 14, 12],
        'text-max-width': 7,
        'text-padding': 6,
      },
      paint: {
        'text-color': pal.labelPlace,
        'text-halo-color': pal.labelHalo,
        'text-halo-width': 1.1,
        'text-opacity': 0.85,
      },
    },
    {
      id: 'base-label-road',
      type: 'symbol',
      source: 'basemap',
      'source-layer': 'roads',
      // Only at the deepest zoom, and only the roads worth naming — labelling
      // every residential street turns the grid into noise.
      minzoom: 13.5,
      filter: [
        'all',
        ['has', 'name'],
        ['in', ['get', 'kind'], ['literal', ['highway', 'major_road', 'medium_road']]],
      ],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'symbol-placement': 'line',
        'symbol-spacing': 300,
        'text-max-angle': 30,
        'text-padding': 4,
      },
      paint: {
        'text-color': pal.label,
        'text-halo-color': pal.labelHalo,
        'text-halo-width': 1.2,
        'text-opacity': 0.8,
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
  fitMaxZoom,
  fitPadding = 36,
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

    // Framing from bounds is set at construction rather than fitted after load,
    // so the map never paints one view and then jumps to another.
    const camera = fitBounds
      ? { bounds: fitBounds, fitBoundsOptions: { padding: fitPadding, maxZoom: fitMaxZoom } }
      : { center, zoom }

    const map = new maplibregl.Map({
      container: el,
      ...camera,
      minZoom,
      maxZoom,
      attributionControl: false,
      style: {
        version: 8,
        // Self-hosted, same reasoning as the tiles: a hosted glyph CDN would be
        // exactly the runtime third-party call the PMTiles extract exists to
        // avoid. Relative URL, served from public/fonts/ off our own origin.
        // Only the Latin ranges of one stack are vendored (see tiles/README.md).
        glyphs: '/fonts/{fontstack}/{range}.pbf',
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
