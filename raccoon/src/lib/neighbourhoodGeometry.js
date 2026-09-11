/**
 * Geometry for the neighbourhood map: the zoom thresholds, and how a city's
 * opening view is framed.
 *
 * Pure module (no React, no maplibre), so the framing rule can be tested
 * directly. That matters because the rule has to hold for every city the
 * content pass adds, not just the seeds — a per-city zoom constant would be
 * one more thing to hand-tune 130 times, and to get wrong.
 */

// Above this zoom the map reads as neighbourhoods; below it, as districts.
export const DRILL_ZOOM = 10.6

// How far the opening view may zoom in when a city's shapes are tightly
// clustered. Without a cap, a compact city — or one seeded with a single area —
// would open at street level instead of showing the shape of the city.
export const FIT_MAX_ZOOM = 12.4

// Padding, in px, between the framed shapes and the map's edges.
export const FIT_PADDING = 36

/** Rough centre of a GeoJSON polygon — the mean of its outer ring. */
export function centroid(polygon) {
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

/** [[w, s], [e, n]] enclosing every ring of every item that carries a polygon. */
export function boundsOf(items) {
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

/**
 * How to frame a city on open: the bounds of everything it draws, and the
 * furthest in that framing may zoom.
 *
 * Districts are included in the bounds because they can reach past their member
 * areas. A city is framed by its own shapes rather than by its anchor, which
 * used to leave whole areas off-screen whenever the anchor sat at one end of the
 * city (Havana, anchored at Parque Central in the east, did exactly that).
 *
 * @param {Object} city - a full-tier entry from getNeighbourhoods()
 * @returns {{ bounds: number[][], maxZoom: number }}
 */
export function fitFor(city) {
  const areas = city.areas ?? []
  const districts = city.districts ?? []
  return {
    bounds: boundsOf([...districts, ...areas]),
    // A district-layered city has to open at its district level, so its framing
    // never crosses the drill threshold however tight its areas are.
    maxZoom: districts.length ? DRILL_ZOOM - 0.2 : FIT_MAX_ZOOM,
  }
}
