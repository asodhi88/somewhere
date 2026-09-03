/**
 * links.js — the outbound-URL seam (flight-handoff-task.md §1), in the same
 * spirit as getDestinations(filters). No component builds a Skyscanner URL
 * inline; every one is constructed here so the target, param shape, and
 * partner id all live in one place.
 *
 * Month resolution note: `searchState.js` already stores the selected month
 * year-qualified ("oct-2026", the current-month-plus-12 rolling window built
 * in buildMonthOptions) and re-snaps stale/legacy values into that window on
 * every read. So in normal app use, resolveSearchMonth below just parses the
 * year that's already there. The bare-key rollover and 12-month clamp paths
 * exist as a defensive fallback — this module is a seam, so it shouldn't
 * assume every caller upstream stayed within that window.
 */

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// Skyscanner flight search supports calendar months up to this far ahead.
const MAX_MONTHS_AHEAD = 12

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

const monthsBetween = (from, to) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())

const formatYearMonth = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** "YYYY-MM" → the same month one calendar month later, as "YYYY-MM". */
function nextYearMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(y, m - 1 + 1, 1)
  return formatYearMonth(d)
}

/**
 * Resolve a search-state month value ("oct-2026" or a bare "oct") to the
 * next future "YYYY-MM" occurrence, clamped to Skyscanner's 12-month-ahead
 * window. Returns null for an unrecognized month key, or when resolution
 * lands beyond the window (never emits a month in the past).
 */
export function resolveSearchMonth(monthValue, now = new Date()) {
  if (!monthValue) return null
  const raw = String(monthValue).toLowerCase()
  const match = raw.match(/^([a-z]{3})(?:-(\d{4}))?$/)
  if (!match) return null

  const [, key, yearStr] = match
  const monthIndex = MONTH_KEYS.indexOf(key)
  if (monthIndex === -1) return null

  const today = startOfMonth(now)
  let candidate = yearStr ? new Date(Number(yearStr), monthIndex, 1) : null

  // No year, or a year that's already in the past: resolve to the next
  // future occurrence of that month key.
  if (!candidate || candidate < today) {
    candidate = new Date(today.getFullYear(), monthIndex, 1)
    if (candidate < today) candidate = new Date(today.getFullYear() + 1, monthIndex, 1)
  }

  const diff = monthsBetween(today, candidate)
  if (diff < 0 || diff > MAX_MONTHS_AHEAD) return null

  return formatYearMonth(candidate)
}

const BASE_URL = 'https://skyscanner.net/g/referrals/v1/flights/calendar-month-view/'

/**
 * Build the Skyscanner calendar-month-view deep link for a result card, or
 * null when required inputs are missing / the month can't be resolved. A
 * null return means the caller should not render the link.
 */
export function buildFlightSearchUrl({ originIata, destinationIata, month, nights }) {
  if (!originIata || !destinationIata) return null

  const oym = resolveSearchMonth(month)
  if (!oym) return null

  const iym = Number(nights) > 21 ? nextYearMonth(oym) : oym

  const params = new URLSearchParams({
    origin: String(originIata).toUpperCase(),
    destination: String(destinationIata).toUpperCase(),
    oym,
    iym,
    rtn: '1',
    currency: 'CAD',
    market: 'CA',
    locale: 'en-CA',
  })

  const partnerId = import.meta.env.VITE_SKYSCANNER_PARTNER_ID
  if (partnerId) params.set('mediaPartnerId', partnerId)

  return `${BASE_URL}?${params.toString()}`
}
