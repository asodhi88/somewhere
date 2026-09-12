/**
 * check-polygons — the geometry gate for neighbourhood guidance data.
 *
 * Why this exists: since the framing rule follows the data, a city seeded with
 * misplaced polygons frames the wrong place *convincingly*. The failure mode is
 * invisible by eye — this is the thing that caught Miramar sitting in the sea.
 * Run it on every full-tier city before committing.
 *
 *   node scripts/check-polygons.mjs               # every full-tier city
 *   node scripts/check-polygons.mjs del dxb       # just these
 *   node scripts/check-polygons.mjs --zoom=13     # coarser water sampling
 *   node scripts/check-polygons.mjs --source=<url|path>
 *
 * Water is sampled from a Protomaps archive: by default the remote planet build
 * (range requests, no download), because newly-seeded cities are by definition
 * not in our own extract yet. Point `--source` at a local .pmtiles to work
 * offline once a city has been cut.
 *
 * Dev-only. Nothing here ships in the bundle.
 */
import { readFileSync, openSync, readSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PMTiles, FetchSource } from 'pmtiles'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'))

const DEFAULT_SOURCE = 'https://build.protomaps.com/20260910.pmtiles'

/**
 * Areas whose polygon legitimately includes open water — a waterfront district
 * cannot be drawn without some. Listed here rather than in the dataset: which
 * shapes touch the sea is a fact about the check, not about the guidance, and
 * the schema is frozen. Being on this list is an attestation that a human
 * looked at the number and accepted it.
 */
const WATERFRONT = new Set([
  'hav/habana-vieja', 'hav/centro-habana', 'hav/vedado', 'hav/miramar',
  'lax/santamonica', 'lax/venice', 'lax/westside', 'lax/south',
  'dxb/marina', 'dxb/jumeirah', 'dxb/deira',
  // Business Bay is built around the Dubai Water Canal — an inland waterway,
  // not a coast, but water all the same and central to the area's shape.
  'dxb/downtown',
  'yvr/downtown', 'yvr/westend', 'yvr/kitsilano', 'yvr/gastown',
  'yqb/vieux-port', 'yqb/haute-ville',
])

// A non-waterfront shape above this is wrong, not approximate.
const WATER_FAIL = 0.05
// Even a waterfront shape mostly in the sea is a misplaced polygon.
const WATERFRONT_FAIL = 0.4
// Sibling areas share boundaries by design; real overlap shows up well above this.
const OVERLAP_FAIL = 0.02
// A neighbourhood is not a county, and not a city block.
const MAX_SPAN_KM = 45
const MIN_SPAN_KM = 0.4
// Samples landing on tiles the source cannot serve prove nothing. Past this
// share the water result is not evidence, so say so instead of printing 0.0%.
const UNKNOWN_FAIL = 0.2

/* ---------------------------------------------------------------- geometry */

const ring0 = (poly) => poly.coordinates[0]

function pointInRing(pt, ring) {
  const [x, y] = pt
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Outer ring minus holes — GeoJSON Polygon convention. */
function pointInPolygon(pt, coords) {
  if (!pointInRing(pt, coords[0])) return false
  for (let i = 1; i < coords.length; i++) if (pointInRing(pt, coords[i])) return false
  return true
}

function bboxOf(poly) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const ring of poly.coordinates) {
    for (const [lng, lat] of ring) {
      if (lng < w) w = lng
      if (lng > e) e = lng
      if (lat < s) s = lat
      if (lat > n) n = lat
    }
  }
  return [w, s, e, n]
}

const KM_PER_DEG_LAT = 110.574
const kmPerDegLng = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180)

function spanKm(bbox) {
  const [w, s, e, n] = bbox
  return [(e - w) * kmPerDegLng((s + n) / 2), (n - s) * KM_PER_DEG_LAT]
}

/** Proper segment intersection, ignoring shared endpoints of adjacent edges. */
function segmentsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3), d4 = d(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function selfIntersections(ring) {
  const hits = []
  const n = ring.length - 1
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // first and last edges meet at the close
      if (segmentsCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) hits.push([i, j])
    }
  }
  return hits
}

/** ~`target` points spread over the polygon's interior. */
function samplePoints(poly, target = 260) {
  const [w, s, e, n] = bboxOf(poly)
  const aspect = ((e - w) * kmPerDegLng((s + n) / 2)) / ((n - s) * KM_PER_DEG_LAT || 1e-9)
  const cols = Math.max(6, Math.round(Math.sqrt(target * Math.max(aspect, 0.05))))
  const rows = Math.max(6, Math.round(target / cols))
  const pts = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // offset off the grid lines so points never land on a shared boundary
      const x = w + ((c + 0.5) / cols) * (e - w)
      const y = s + ((r + 0.5) / rows) * (n - s)
      if (pointInPolygon([x, y], poly.coordinates)) pts.push([x, y])
    }
  }
  return pts
}

/* -------------------------------------------------------------- tile access */

const lngToTileX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z)
const latToTileY = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/**
 * Local .pmtiles reader. pmtiles' own FileSource wraps a browser File object,
 * so handing it a Node path yields an archive that answers nothing — which
 * surfaced as every polygon reading 0.0% water. A silent all-clear is the worst
 * possible failure for this script, hence both this and UNKNOWN_FAIL below.
 */
class NodeFileSource {
  constructor(file) {
    this.file = file
    this.fd = openSync(file, 'r')
  }
  getKey() {
    return this.file
  }
  async getBytes(offset, length) {
    const buf = Buffer.alloc(length)
    readSync(this.fd, buf, 0, length, offset)
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
  }
}

function openArchive(source) {
  const src = /^https?:\/\//.test(source)
    ? new FetchSource(source)
    : new NodeFileSource(path.resolve(ROOT, source))
  return new PMTiles(src)
}

/** Water polygons of one tile, in lng/lat. `null` means the tile is missing. */
async function waterRings(archive, z, x, y, cache) {
  const key = `${z}/${x}/${y}`
  if (cache.has(key)) return cache.get(key)
  let rings = null
  try {
    const res = await archive.getZxy(z, x, y)
    if (res?.data) {
      rings = []
      const layer = new VectorTile(new PbfReader(new Uint8Array(res.data))).layers.water
      if (layer) {
        for (let i = 0; i < layer.length; i++) {
          const gj = layer.feature(i).toGeoJSON(x, y, z)
          if (gj.geometry.type === 'Polygon') rings.push(gj.geometry.coordinates)
          else if (gj.geometry.type === 'MultiPolygon') rings.push(...gj.geometry.coordinates)
        }
      }
    }
  } catch {
    rings = null
  }
  cache.set(key, rings)
  return rings
}

async function waterFraction(archive, poly, zoom, cache) {
  const pts = samplePoints(poly)
  let wet = 0
  let unknown = 0
  for (const pt of pts) {
    const rings = await waterRings(archive, zoom, lngToTileX(pt[0], zoom), latToTileY(pt[1], zoom), cache)
    if (rings === null) { unknown++; continue }
    if (rings.some((coords) => pointInPolygon(pt, coords))) wet++
  }
  const known = pts.length - unknown
  return { samples: pts.length, wet, unknown, fraction: known ? wet / known : 0 }
}

/* ---------------------------------------------------------------- reporting */

const pct = (f) => `${(f * 100).toFixed(1)}%`

async function main() {
  const argv = process.argv.slice(2)
  const flag = (name, dflt) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : dflt
  }
  const zoom = Number(flag('zoom', '14'))
  const source = flag('source', DEFAULT_SOURCE)
  const only = argv.filter((a) => !a.startsWith('--'))

  const hoods = read('src/data/neighbourhoods.json')
  const regions = read('tiles/cities.geojson').geometry.coordinates

  const cities = Object.entries(hoods)
    .filter(([id, c]) => c.tier === 'full' && (!only.length || only.includes(id)))
  if (!cities.length) {
    console.error(only.length ? `No full-tier city matched: ${only.join(', ')}` : 'No full-tier cities.')
    process.exit(1)
  }

  console.log(`source ${source}`)
  console.log(`water sampled at z${zoom}\n`)

  const archive = openArchive(source)
  const cache = new Map()
  const problems = []

  for (const [cityId, city] of cities) {
    console.log(`-- ${cityId} · ${city.areas.length} areas${city.districts ? ` · ${city.districts.length} districts` : ''}`)
    const fail = (msg) => problems.push(`${cityId}: ${msg}`)

    // Which tile region covers this city? Matched by anchor, so cities.geojson
    // needs no per-city ids to stay in step with the dataset.
    const anchor = [city.anchor.lng, city.anchor.lat]
    const region = regions.find((poly) => pointInPolygon(anchor, poly))
    if (!region) fail(`anchor ${anchor.join(',')} is outside every tiles/cities.geojson region`)

    const shapes = [
      ...(city.districts ?? []).map((d) => ({ ...d, kind: 'district' })),
      ...city.areas.map((a) => ({ ...a, kind: 'area' })),
    ]

    for (const shape of shapes) {
      const poly = shape.polygon
      const notes = []
      const ring = ring0(poly)

      const first = ring[0], last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) fail(`${shape.id}: ring is not closed`)
      if (ring.length - 1 < 3) fail(`${shape.id}: ring has fewer than 3 distinct points`)

      const xs = selfIntersections(ring)
      if (xs.length) {
        fail(`${shape.id}: ring self-intersects at edge pairs ${xs.slice(0, 4).map((p) => p.join('x')).join(', ')}`)
      }

      const bbox = bboxOf(poly)
      const [kw, kh] = spanKm(bbox)
      if (kw > MAX_SPAN_KM || kh > MAX_SPAN_KM) {
        fail(`${shape.id}: spans ${kw.toFixed(1)}x${kh.toFixed(1)} km — too large to be one ${shape.kind}`)
      }
      if (kw < MIN_SPAN_KM || kh < MIN_SPAN_KM) {
        fail(`${shape.id}: spans ${kw.toFixed(1)}x${kh.toFixed(1)} km — too small to be one ${shape.kind}`)
      }

      if (region && !ring.every((pt) => pointInPolygon(pt, region))) {
        fail(`${shape.id}: extends outside the tile region — it would render over blank tiles`)
      }

      const key = `${cityId}/${shape.id}`
      const w = await waterFraction(archive, poly, zoom, cache)
      const limit = WATERFRONT.has(key) ? WATERFRONT_FAIL : WATER_FAIL
      const wet = w.fraction > limit
      if (wet) {
        fail(`${shape.id}: ${pct(w.fraction)} water${WATERFRONT.has(key) ? ' (waterfront, but mostly sea)' : ' — not declared waterfront'}`)
      }
      const unknownShare = w.samples ? w.unknown / w.samples : 1
      if (unknownShare > UNKNOWN_FAIL) {
        fail(`${shape.id}: ${pct(unknownShare)} of samples hit tiles the source cannot serve — the water result is not evidence`)
      } else if (w.unknown) {
        notes.push(`${w.unknown} samples over missing tiles`)
      }

      const badge = wet ? 'FAIL' : WATERFRONT.has(key) ? 'eyeball' : 'ok'
      console.log(
        `   ${wet ? 'x' : '·'} ${shape.id.padEnd(16)} ${pct(w.fraction).padStart(6)} water  ` +
        `${kw.toFixed(1).padStart(5)}x${kh.toFixed(1).padEnd(5)} km  ${badge}` +
        (notes.length ? `  (${notes.join('; ')})` : '')
      )
    }

    // overlap between siblings, at each level
    for (const level of ['district', 'area']) {
      const sibs = shapes.filter((s) => s.kind === level)
      for (let i = 0; i < sibs.length; i++) {
        for (let j = i + 1; j < sibs.length; j++) {
          const a = sibs[i], b = sibs[j]
          const pts = samplePoints(a.polygon, 200)
          if (!pts.length) continue
          const inside = pts.filter((p) => pointInPolygon(p, b.polygon.coordinates)).length
          const frac = inside / pts.length
          if (frac > OVERLAP_FAIL) fail(`${a.id} overlaps ${b.id} by ${pct(frac)} of ${a.id}`)
        }
      }
    }

    // A district is a generalized shape drawn BELOW drill zoom, not a geometric
    // parent of its areas — in the LA seed, `pasadena` sits entirely outside the
    // `valley` district it belongs to. So the only thing to assert here is that
    // the label resolves; checking containment would fail every district-layered
    // city for violating a rule the schema never made.
    for (const area of city.areas) {
      if (!area.district) continue
      if (!(city.districts ?? []).some((x) => x.id === area.district)) {
        fail(`${area.id}: declares unknown district "${area.district}"`)
      }
    }
    console.log()
  }

  if (problems.length) {
    console.error(`FAILED — ${problems.length} problem${problems.length > 1 ? 's' : ''}:`)
    for (const p of problems) console.error(`  • ${p}`)
    process.exit(1)
  }
  console.log('All checks passed.')
}

main().catch((err) => { console.error(err); process.exit(1) })
