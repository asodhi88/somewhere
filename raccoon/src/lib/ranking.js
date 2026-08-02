/**
 * ranking.js — the pure matching logic for Raccoon.
 *
 * This module holds the hard-filter → score → diversify pipeline described in
 * CLAUDE.md §6.1, plus the total-cost model from §3. It deliberately imports NO
 * data: every function takes the destination records (or a single record) as an
 * argument. That keeps the logic unit-testable and, more importantly, keeps the
 * data source swappable — the §7 seam (getDestinations.js) is the only place
 * that reads the JSON, and swapping it for Supabase later must not touch any of
 * the ranking code below.
 *
 * Cost model (CLAUDE.md §3):
 *   total = flight_band + (nightly_stay_rate × nights) + (daily_ground_spend × days)
 *
 * Every dollar figure in the dataset is a [low, high] range, so every derived
 * total is a range too (CLAUDE.md §4.2 — ranges, never false precision).
 */

// Months present in the v1 dataset. A search for any other month yields no
// results (no price band / climate normal to work from).
export const MONTHS = ['jan', 'mar', 'jun', 'oct', 'dec']

export const MONTH_NAMES = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April',
  may: 'May', jun: 'June', jul: 'July', aug: 'August',
  sep: 'September', oct: 'October', nov: 'November', dec: 'December',
}

export const STAY_TIERS = ['budget', 'mid', 'nice']

// Base scoring weights. Order/priority follows CLAUDE.md §6.1. Sum to 1.
// The nonstop weight is *conditional*: it only applies to the degree the user
// has constrained flight time (see flightSensitivity / effectiveWeights). If
// they haven't, rewarding short flights would bias the grid toward nearby
// destinations they never asked to prioritise.
//
// TEMPORARY — visa scoring is DISABLED (weight 0). visa_ca hard-codes a Canadian
// passport, which is wrong for any other traveller, so we stop letting it move
// the ranking until passport-aware requirement data is wired in from the Sherpa
// Requirements API. Visa's original 0.10 is redistributed proportionally across
// headroom / weather / nonstop — equivalently: drop visa and renormalise the
// other three (base sum 0.90) to sum to 1, hence `base / 0.9`. This is a disable,
// not a removal: visa_ca, visaScore(), and the scoring code path all stay intact;
// parts.visa is still computed, just multiplied by a 0 weight. To re-enable,
// restore the base weights: headroom 0.40, weather 0.35, nonstop 0.15, visa 0.10.
export const WEIGHTS = {
  headroom: 0.40 / 0.9, // 0.40 base + visa's redistributed share ≈ 0.4444
  weather: 0.35 / 0.9, // 0.35 base + visa's redistributed share ≈ 0.3889
  nonstop: 0.15 / 0.9, // 0.15 base + visa's redistributed share ≈ 0.1667
  visa: 0, // DISABLED (was 0.10) — see note above; visaScore() still runs, weighted 0
}

// Flight-sensitivity ramp (hours). At/under FULL the user clearly wants a short
// flight → nonstop bonus at full weight. At/over NONE the cap admits ~every
// trip reachable from YYZ (longest is ~20h), so it isn't a real constraint →
// nonstop bonus removed. Linear in between.
const FLIGHT_FULL_H = 8
const FLIGHT_NONE_H = 15

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/**
 * How much the user cares about flight length, 0..1, inferred from the
 * max-flight cap. Unset → 0 (don't reward short flights the user never asked
 * to optimise for). A tight cap → 1. A loose/high cap → fades to 0.
 */
export function flightSensitivity(maxFlightHours) {
  if (maxFlightHours == null) return 0
  return clamp((FLIGHT_NONE_H - maxFlightHours) / (FLIGHT_NONE_H - FLIGHT_FULL_H), 0, 1)
}

/**
 * Effective weights for a given search. The nonstop weight is scaled by flight
 * sensitivity; the weight it gives up is redistributed across headroom/weather/
 * visa in proportion to their base weights — so their relative importance is
 * unchanged and the four weights still sum to 1 (scores stay on a 0..100 scale).
 */
export function effectiveWeights(filters) {
  const nonstop = WEIGHTS.nonstop * flightSensitivity(filters.maxFlightHours)
  const freed = WEIGHTS.nonstop - nonstop
  const otherBase = WEIGHTS.headroom + WEIGHTS.weather + WEIGHTS.visa
  const scale = (w) => w + freed * (w / otherBase)
  return {
    headroom: scale(WEIGHTS.headroom),
    weather: scale(WEIGHTS.weather),
    nonstop,
    visa: scale(WEIGHTS.visa),
  }
}

/**
 * Normalise a raw filters object (which may arrive as URL strings) into typed,
 * defaulted values. Called once at the top of the pipeline.
 */
export function normalizeFilters(filters = {}) {
  const num = (v) => (v == null || v === '' ? null : Number(v))
  const stay = String(filters.stay || 'mid').toLowerCase()
  return {
    budget: num(filters.budget),
    nights: num(filters.nights) ?? 7,
    // Accept "october" or "oct"; the dataset keys are the 3-letter form.
    month: filters.month ? String(filters.month).toLowerCase().slice(0, 3) : null,
    vibe: filters.vibe ? String(filters.vibe).toLowerCase() : null,
    stay: STAY_TIERS.includes(stay) ? stay : 'mid',
    // maxFlightHours is the canonical name; accept maxFlight as an alias.
    maxFlightHours: num(filters.maxFlightHours ?? filters.maxFlight),
    limit: num(filters.limit) ?? 12,
    maxPerRegion: num(filters.maxPerRegion) ?? 2,
  }
}

/**
 * Estimate the all-in trip cost range for one destination.
 * Returns null if the destination lacks pricing for the requested month/tier.
 *
 * Ground days are treated as equal to nights (a 7-night trip ≈ 7 days of
 * on-the-ground spend). This also reproduces the CLAUDE.md §6.1 example where
 * Tokyo passes a $2,000 / 7-night budget at the "budget" stay tier.
 */
export function estimateCost(dest, { month, nights, stay }) {
  const flight = dest?.flight?.bands?.[month]
  const stayRate = dest?.stay?.[stay]
  const ground = dest?.ground_daily
  if (!flight || !stayRate || !ground) return null

  const days = nights
  const stayLow = stayRate[0] * nights
  const stayHigh = stayRate[1] * nights
  const groundLow = ground[0] * days
  const groundHigh = ground[1] * days

  const low = flight[0] + stayLow + groundLow
  const high = flight[1] + stayHigh + groundHigh

  return {
    low,
    high,
    mid: Math.round((low + high) / 2),
    breakdown: {
      flight: { low: flight[0], high: flight[1] },
      stay: { low: stayLow, high: stayHigh, nights, nightly: stayRate },
      ground: { low: groundLow, high: groundHigh, days, daily: ground },
    },
  }
}

// ── Scoring components (each returns 0..1) ──────────────────────────────────

/** How comfortably the (typical) cost fits the budget. No budget → 0. */
export function headroomScore(cost, budget) {
  if (!budget || !cost) return 0
  return clamp((budget - cost.mid) / budget, 0, 1)
}

/**
 * Weather quality for the month, from the climate normal.
 * Comfort model: ideal daytime high ≈ 24°C, fewer rain days is better.
 * Temperature is weighted above rain (0.65 / 0.35).
 */
export function weatherScore(climate) {
  if (!climate) return 0
  const temp = clamp(1 - Math.abs(climate.high_c - 24) / 16, 0, 1)
  const rain = clamp(1 - climate.rain_days / 20, 0, 1)
  return 0.65 * temp + 0.35 * rain
}

/** Visa-free bonus on a Canadian passport. ESTA counts as mild friction. */
export function visaScore(visa) {
  if (!visa) return 0
  if (visa.startsWith('visa_free')) return visa === 'visa_free_esta' ? 0.5 : 1
  return 0 // evisa / visa_required
}

/** Whether a destination matches the requested vibe. */
export function matchesVibe(dest, vibe) {
  if (!vibe || vibe === 'anywhere' || vibe === 'any') return true
  // "anywhere-cheap" in the brief maps to the "cheap" vibe tag in the data.
  const want = vibe === 'anywhere-cheap' ? 'cheap' : vibe
  return Array.isArray(dest.vibes) && dest.vibes.includes(want)
}

// How far over budget a destination may be and still surface, as a fraction of
// the budget. Over-budget survivors are tagged and ranked below every in-budget
// result; anything beyond this tolerance is dropped entirely.
export const OVER_BUDGET_TOLERANCE = 0.15

/**
 * Budget standing for a cost estimate. "Over" is measured on the LOW end of the
 * range — the cheapest realistic version of the trip — which is the same line
 * the (now soft) budget boundary uses.
 *
 * @returns {{ overBudget: boolean, overBy: number }} overBy is dollars over
 *   budget (0 when in budget).
 */
export function budgetStatus(cost, budget) {
  if (!budget || !cost) return { overBudget: false, overBy: 0 }
  const overBy = Math.round(cost.low - budget)
  return { overBudget: overBy > 0, overBy: Math.max(0, overBy) }
}

/**
 * Hard filters (CLAUDE.md §6.1 step 1). A destination must clear ALL of these
 * before it is scored. `cost` is the pre-computed estimate for the search.
 *
 * Budget is the one exception to "hard": it is a SOFT signal. A destination
 * survives as long as its cheapest realistic cost is within OVER_BUDGET_TOLERANCE
 * over budget. Over-budget survivors are tagged and sorted last (see
 * searchDestinations); only destinations beyond the tolerance are cut here.
 */
export function passesHardFilters(dest, filters, cost) {
  const { budget, month, vibe, maxFlightHours } = filters

  // Month availability — need both a price band and a climate normal.
  if (!dest?.flight?.bands?.[month] || !dest?.climate?.[month]) return false

  // Budget — soft: keep anything up to OVER_BUDGET_TOLERANCE over the low end.
  if (budget != null) {
    if (!cost) return false
    if (cost.low > budget * (1 + OVER_BUDGET_TOLERANCE)) return false
  }

  // Vibe match.
  if (!matchesVibe(dest, vibe)) return false

  // Max flight time, if set.
  if (maxFlightHours != null && dest.flight.hours > maxFlightHours) return false

  return true
}

/**
 * Score a destination. Returns:
 *   merit  — the pure quality score in [0, 1] (headroom/weather/nonstop/visa)
 *   score  — merit with the budget demotion baked in (see below)
 *   parts  — the individual merit components
 *   status — budget standing (overBudget / overBy)
 *
 * The budget demotion is folded into `score` itself, not just applied at sort
 * time, so it survives any downstream re-sort:
 *   • in budget  → score = merit                     (>= 0)
 *   • over budget → score = -(overBy / budget)        (< 0)
 * The over-budget penalty scales with how far over (a place $40 over lands just
 * below 0; one $285 over sits far lower). Since every over-budget score is < 0
 * and every in-budget score is >= 0, any in-budget result always outscores any
 * over-budget one.
 */
export function scoreDestination(dest, filters, cost) {
  const w = effectiveWeights(filters)
  const parts = {
    headroom: headroomScore(cost, filters.budget),
    weather: weatherScore(dest.climate[filters.month]),
    nonstop: dest.flight.nonstop ? 1 : 0,
    visa: visaScore(dest.visa_ca),
  }
  const merit =
    w.headroom * parts.headroom +
    w.weather * parts.weather +
    w.nonstop * parts.nonstop +
    w.visa * parts.visa

  const status = budgetStatus(cost, filters.budget)
  const score = status.overBudget ? -(status.overBy / filters.budget) : merit

  return { score, merit, parts, status }
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** One-line human reason this destination matched (CLAUDE.md §6.2). */
export function matchReason(dest, filters, cost, parts) {
  const clim = dest.climate[filters.month]
  const monthName = MONTH_NAMES[filters.month] || filters.month
  const bits = []

  // Budget framing (only when a budget was supplied).
  if (filters.budget && cost) {
    const overBy = Math.round(cost.low - filters.budget)
    if (overBy > 0) bits.push(`~$${overBy.toLocaleString('en-US')} over budget`)
    else if (parts.headroom >= 0.45) bits.push('leaves plenty of budget to spare')
    else if (parts.headroom >= 0.2) bits.push('fits your budget comfortably')
    else if (cost.high > filters.budget) bits.push('doable at the low end of the range')
    else bits.push('fits your budget')
  }

  // Weather framing.
  if (parts.weather >= 0.7) bits.push(`ideal ${monthName} weather — ${clim.label}`)
  else if (parts.weather >= 0.45) bits.push(`good ${monthName} weather — ${clim.label}`)
  else bits.push(`${monthName}: ${clim.label}`)

  // Access chips.
  const access = [dest.flight.nonstop ? `nonstop ${dest.flight.hours}h` : `${dest.flight.hours}h, 1 stop`]
  if (parts.visa === 1) access.push('visa-free')
  else if (parts.visa === 0.5) access.push('ESTA')
  bits.push(access.join(', '))

  return capitalize(bits.join(' · '))
}

/** Shape a scored survivor into the public result object. */
function toResult(entry, filters, rank) {
  const { dest, cost, score, merit, parts, status } = entry
  const clim = dest.climate[filters.month]
  return {
    rank,
    id: dest.id,
    city: dest.city,
    country: dest.country,
    region: dest.region,
    coords: dest.coords,
    score: Math.round(score * 1000) / 10, // budget-adjusted; <0 when over budget
    merit: Math.round(merit * 1000) / 10, // pure quality score, 0..100
    scoreParts: parts,
    cost, // { low, high, mid, breakdown }
    overBudget: status.overBudget,
    overBy: status.overBy, // dollars over budget (0 when in budget)
    flight: { hours: dest.flight.hours, nonstop: dest.flight.nonstop },
    weather: { month: filters.month, ...clim },
    visa: dest.visa_ca,
    vibes: dest.vibes,
    reason: matchReason(dest, filters, cost, parts),
    blurb: dest.blurb,
    hero_image: dest.hero_image || null, // { url, photographer, profile_url } | null
  }
}

/**
 * The full pipeline: hard-filter → score → sort → diversify.
 *
 * @param {Array}  destinations - raw destination records
 * @param {Object} rawFilters   - search filters (see normalizeFilters)
 * @returns {{ filters, all, ranked }}
 *   filters — the normalised filters actually used
 *   all     — every survivor, scored, sorted by score (pre-diversification)
 *   ranked  — the product output: per-region cap applied, then limited
 */
export function searchDestinations(destinations, rawFilters = {}) {
  const filters = normalizeFilters(rawFilters)

  // Hard filter + score.
  const survivors = []
  for (const dest of destinations) {
    const cost = estimateCost(dest, filters)
    if (!passesHardFilters(dest, filters, cost)) continue
    const { score, merit, parts, status } = scoreDestination(dest, filters, cost)
    survivors.push({ dest, cost, score, merit, parts, status })
  }

  // The budget demotion is already baked into `score` (over-budget < 0 <=
  // in-budget), so a plain score sort yields the correct tiering — the invariant
  // survives any re-sort. Tie-break by merit, then by cheaper typical cost.
  survivors.sort(
    (a, b) => b.score - a.score || b.merit - a.merit || a.cost.mid - b.cost.mid,
  )

  const all = survivors.map((s, i) => toResult(s, filters, i + 1))

  // Diversify: cap per region so the grid feels like a real set of options,
  // not nine cities from one region (CLAUDE.md §6.1 step 3). Then limit.
  const perRegion = new Map()
  const ranked = []
  for (const entry of survivors) {
    const r = entry.dest.region
    const count = perRegion.get(r) || 0
    if (count >= filters.maxPerRegion) continue
    perRegion.set(r, count + 1)
    ranked.push(toResult(entry, filters, ranked.length + 1))
    if (ranked.length >= filters.limit) break
  }

  return { filters, all, ranked }
}
