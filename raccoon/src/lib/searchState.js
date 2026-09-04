/**
 * searchState.js — the URL <-> filters bridge (CLAUDE.md §4.3, layer 1).
 *
 * Search state lives in the query string so back, refresh, bookmark, and share
 * all work with no auth and no backend. Example:
 *   ?from=YYZ&budget=2000&nights=7&month=oct-2026&stay=mid
 */

// ── Origins ──────────────────────────────────────────────────────────────
// Toronto (YYZ) and Montreal (YUL) are selectable — both carry per-origin flight
// bands in the dataset. The remaining cities render as a single "coming soon"
// line in the picker and are not wired to search yet.
export const ORIGIN_OPTIONS = [
  { value: 'yyz', code: 'YYZ', city: 'Toronto', available: true },
  { value: 'yul', code: 'YUL', city: 'Montreal', available: true },
  { value: 'yqb', code: 'YQB', city: 'Quebec City', available: false },
  { value: 'yyc', code: 'YYC', city: 'Calgary', available: false },
  { value: 'yvr', code: 'YVR', city: 'Vancouver', available: false },
  { value: 'yow', code: 'YOW', city: 'Ottawa', available: false },
  { value: 'yhz', code: 'YHZ', city: 'Halifax', available: false },
  { value: 'ytz', code: 'YTZ', city: 'Toronto Billy Bishop', available: false },
]

export const DEFAULT_ORIGIN = 'yyz'
const ORIGIN_VALUES = new Set(ORIGIN_OPTIONS.filter((o) => o.available).map((o) => o.value))

/** Normalise a `from` param (any case) to a selectable origin value, or default. */
export function normalizeOrigin(raw) {
  const v = String(raw || '').toLowerCase()
  return ORIGIN_VALUES.has(v) ? v : DEFAULT_ORIGIN
}

// ── Months ───────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
// Three-letter display abbreviations (distinct from MONTH_KEYS, which are the
// lowercase dataset keys). Used for the narrow/mobile month picker where the
// full name clips — see SearchBar.
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * A rolling window: the current month plus the next 12 (13 entries). Values are
 * year-qualified ("oct-2026") so the same month a year out is distinct, but the
 * ranking only reads the 3-letter key (see monthKeyOf) since the dataset has no
 * year dimension. Months the dataset doesn't cover yet simply return no matches
 * — the thin/empty results state, never an error.
 */
export function buildMonthOptions(now = new Date()) {
  const opts = []
  const y = now.getFullYear()
  const m = now.getMonth()
  for (let i = 0; i <= 12; i++) {
    const d = new Date(y, m + i, 1)
    const mi = d.getMonth()
    const yr = d.getFullYear()
    opts.push({
      value: `${MONTH_KEYS[mi]}-${yr}`,
      key: MONTH_KEYS[mi],
      label: `${MONTH_NAMES[mi]} ${yr}`,
      short: `${MONTH_ABBR[mi]} ${yr}`,
      // Bare pieces for the mobile sentence (pill: "September") and the month
      // sheet's tiles (label "Sep" over sub "2026").
      name: MONTH_NAMES[mi],
      abbr: MONTH_ABBR[mi],
      year: yr,
    })
  }
  return opts
}

export const MONTH_OPTIONS = buildMonthOptions()
const MONTH_VALUES = new Set(MONTH_OPTIONS.map((o) => o.value))

// Default to October in range (the mockup's month, and one with data today).
export const DEFAULT_MONTH = (MONTH_OPTIONS.find((o) => o.key === 'oct') || MONTH_OPTIONS[0]).value

/** The 3-letter dataset key for a month value ("oct-2026" → "oct"). */
export const monthKeyOf = (value) => String(value || '').toLowerCase().slice(0, 3)

export const STAY_OPTIONS = [
  { value: 'budget', label: 'Budget' },
  { value: 'mid', label: 'Mid-range' },
  { value: 'nice', label: 'Nice' },
]
const STAYS = STAY_OPTIONS.map((s) => s.value)

// The defaults the design mockup shows: $2,000 · 7 nights · October · Mid-range,
// departing Toronto. Used to resolve any field left blank when a search is run,
// and as the fallback for invalid URL params — NOT as the landing display.
export const DEFAULT_FILTERS = {
  origin: DEFAULT_ORIGIN,
  budget: 2000,
  nights: 7,
  month: DEFAULT_MONTH,
  stay: 'mid',
}

// The blank composer state: what the search bar shows on a fresh visit and after
// the "somewhere" brand is clicked (Home.resetToHome). Every field is empty so
// the floating labels rest as the field names — "budget / nights / when / stay" —
// exactly as the Trip Search Bar handoff designed the default state. Origin is
// fixed to YYZ (v1) rather than blank. Blanks are resolved to DEFAULT_FILTERS when
// a search is actually run (SearchBar.submit / MobileSearch seed).
export const BLANK_FILTERS = {
  origin: DEFAULT_ORIGIN,
  budget: null,
  nights: '',
  month: '',
  stay: '',
}

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

// Accept an exact value ("oct-2026"), a bare legacy key ("oct") from an older
// shared link, or nothing — and always land on a valid in-range option.
function normalizeMonth(raw) {
  if (raw && MONTH_VALUES.has(raw)) return raw
  if (raw) {
    const match = MONTH_OPTIONS.find((o) => o.key === monthKeyOf(raw))
    if (match) return match.value
  }
  return DEFAULT_MONTH
}

const SEARCH_KEYS = ['budget', 'nights', 'month', 'stay']

/** True when the URL carries an explicit search (a shared/bookmarked link). */
export function hasSearchParams(search) {
  const p = new URLSearchParams(search || '')
  return SEARCH_KEYS.some((k) => p.has(k))
}

/** Parse a query string into a validated filters object (with defaults). */
export function filtersFromSearch(search) {
  const p = new URLSearchParams(search || '')

  const rawBudget = p.get('budget')
  const budget =
    rawBudget == null || rawBudget === ''
      ? DEFAULT_FILTERS.budget
      : clampInt(rawBudget, 0, 100000, DEFAULT_FILTERS.budget)

  const stay = STAYS.includes(p.get('stay')) ? p.get('stay') : DEFAULT_FILTERS.stay

  const nights = p.has('nights')
    ? clampInt(p.get('nights'), 1, 30, DEFAULT_FILTERS.nights)
    : DEFAULT_FILTERS.nights

  return {
    origin: normalizeOrigin(p.get('from')),
    budget,
    nights,
    month: normalizeMonth(p.get('month')),
    stay,
  }
}

/** Serialise filters back into a query string, origin included. */
export function searchFromFilters(filters) {
  const p = new URLSearchParams()
  p.set('from', (filters.origin || DEFAULT_ORIGIN).toUpperCase())
  if (filters.budget != null) p.set('budget', String(filters.budget))
  p.set('nights', String(filters.nights))
  p.set('month', filters.month)
  p.set('stay', filters.stay)
  return '?' + p.toString()
}

// ── Remembered search (CLAUDE.md §4.3, layer 2) ────────────────────────────
// localStorage backs the mobile helper copy's promise — "we remember what you
// pick". The URL (layer 1) already restores a shared/bookmarked search; this
// covers the returning user who lands on a bare "/", prefilling their last picks
// into the composer (it does NOT auto-run the search — results still wait for an
// explicit "Show me where"). Wrapped in try/catch: private-mode and blocked
// storage must degrade to "no memory", never throw.
const PREFS_KEY = 'somewhere:last-search'

/** Persist the five search values. Called on every explicit search. */
export function storeFilters(filters) {
  try {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        origin: filters.origin,
        budget: filters.budget,
        nights: filters.nights,
        month: filters.month,
        stay: filters.stay,
      }),
    )
  } catch {
    /* storage unavailable — the search still works, just isn't remembered */
  }
}

/**
 * Read back the remembered search, re-validated through the same normalisers as
 * the URL path so a stale/out-of-window value (e.g. last year's month) lands on
 * a valid option. Returns null when nothing is stored or storage is unreadable.
 */
export function loadStoredFilters() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return {
      origin: normalizeOrigin(p.origin),
      budget:
        p.budget == null
          ? DEFAULT_FILTERS.budget
          : clampInt(p.budget, 0, 100000, DEFAULT_FILTERS.budget),
      nights: clampInt(p.nights, 1, 30, DEFAULT_FILTERS.nights),
      month: normalizeMonth(p.month),
      stay: STAYS.includes(p.stay) ? p.stay : DEFAULT_FILTERS.stay,
    }
  } catch {
    return null
  }
}
