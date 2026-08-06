/**
 * getDestinations — the single data-access seam for the app.
 *
 * Per CLAUDE.md §7: components MUST NOT import the destination JSON directly.
 * Every read of destination data goes through this one module so that swapping
 * the v1 static JSON for Supabase (or a live source) later is a one-file change.
 *
 * The matching logic itself lives in ./ranking.js (pure functions, no data
 * import). This file is only responsible for loading the records and handing
 * them to the pipeline — that separation is what keeps the swap a one-file job.
 *
 * @param {Object} [filters] - Search filters:
 *   budget          {number}  total trip budget ceiling, CAD (optional)
 *   nights          {number}  number of nights (default 7)
 *   month           {string}  'jan' | 'mar' | 'jun' | 'oct' | 'dec'
 *   vibe            {string}  'beach'|'city'|'hike'|'food'|'cheap'|'anywhere'
 *   stay            {string}  'budget' | 'mid' | 'nice' (default 'mid')
 *   maxFlightHours  {number}  max flight time in hours (optional)
 *   limit           {number}  max results returned (default 12)
 *   maxPerRegion    {number}  per-region cap for diversification (default 2)
 * @returns {Array} Ranked, diversified list of destination result objects.
 */
import destinations from '../data/destinations.json' with { type: 'json' }
import { searchDestinations } from './ranking.js'

export function getDestinations(filters = {}) {
  return searchDestinations(destinations, filters).ranked
}

/**
 * Richer variant of the same query, still routed through this seam so no other
 * module has to read the raw data. Returns the normalised filters, every scored
 * survivor (pre-diversification, useful for a detail/debug view), and the ranked
 * product output.
 *
 * @param {Object} [filters] - same shape as getDestinations
 * @returns {{ filters: Object, all: Array, ranked: Array }}
 */
export function searchWithDetails(filters = {}) {
  return searchDestinations(destinations, filters)
}

/**
 * The set of 3-letter month keys the dataset can actually price and describe
 * from a given origin (a destination counts a month only if it has both a flight
 * band from that origin and a climate normal for it). The UI uses this to tell
 * "no data for this month yet" apart from "your filters were too tight" — routed
 * through the seam so no component reads the raw JSON directly (§7).
 */
export function getAvailableMonths(origin = 'yyz') {
  const months = new Set()
  for (const d of destinations) {
    const bands = d.flights?.[origin]?.bands || {}
    for (const m of Object.keys(d.climate || {})) {
      if (bands[m]) months.add(m)
    }
  }
  return months
}

export default getDestinations
