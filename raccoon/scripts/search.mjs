/**
 * search.mjs — a terminal harness for the Raccoon matching logic.
 *
 * This is a Weekend-1 dev tool, NOT app code: it lets you fire searches and
 * read the rankings in a plain list before any UI exists (CLAUDE.md §8 exit
 * criteria — "five realistic searches return rankings that feel right").
 *
 * It goes through the getDestinations seam, exactly like the app will.
 *
 * Usage:
 *   node scripts/search.mjs                     # runs 5 preset scenarios
 *   node scripts/search.mjs --budget 2000 --nights 7 --month oct --vibe beach
 *   node scripts/search.mjs --budget 2500 --month oct --vibe city --stay nice --all
 *
 * Flags:
 *   --budget <n>       total trip budget ceiling (CAD)
 *   --nights <n>       nights (default 7)
 *   --month <m>        jan | mar | jun | oct | dec
 *   --vibe <v>         beach | city | hike | food | cheap | anywhere
 *   --stay <t>         budget | mid | nice (default mid)
 *   --max-flight <n>   max flight hours
 *   --limit <n>        max results (default 12)
 *   --per-region <n>   per-region cap for diversification (default 2)
 *   --all              also print every survivor (pre-diversification)
 */
import { searchWithDetails } from '../src/lib/getDestinations.js'
import { MONTHS, MONTH_NAMES, effectiveWeights, flightSensitivity, OVER_BUDGET_TOLERANCE } from '../src/lib/ranking.js'

// ── arg parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _showAll: false }
  const map = {
    '--budget': 'budget',
    '--nights': 'nights',
    '--month': 'month',
    '--vibe': 'vibe',
    '--stay': 'stay',
    '--max-flight': 'maxFlightHours',
    '--limit': 'limit',
    '--per-region': 'maxPerRegion',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--all') { out._showAll = true; continue }
    const key = map[a]
    if (key) { out[key] = argv[++i]; continue }
    console.warn(`(ignoring unknown flag: ${a})`)
  }
  return out
}

// ── formatting ──────────────────────────────────────────────────────────────
const money = (n) => '$' + Math.round(n).toLocaleString('en-US')
const range = (lo, hi) => `${money(lo)}–${money(hi).slice(1)}` // $1,650–2,100
const pad = (s, n) => String(s).padEnd(n)

function printResult(r) {
  const stops = r.flight.nonstop ? 'nonstop' : '1 stop'
  const overTag = r.overBudget ? `  ⚠ ~${money(r.overBy)} over budget (merit ${r.merit})` : ''
  console.log(
    `  ${pad('#' + r.rank, 4)} ${pad(r.city + ', ' + r.country, 30)} ` +
    `${pad(range(r.cost.low, r.cost.high), 20)} score ${r.score}${overTag}`
  )
  console.log(
    `       ${pad(r.region, 30)} ${r.flight.hours}h ${stops} · ` +
    `${r.weather.high_c}°/${r.weather.low_c}°C, ${r.weather.rain_days} rain days · visa: ${r.visa}`
  )
  const p = r.scoreParts
  const f2 = (x) => x.toFixed(2)
  console.log(
    `       parts: headroom ${f2(p.headroom)} · weather ${f2(p.weather)} · ` +
    `nonstop ${f2(p.nonstop)} · visa ${f2(p.visa)}`
  )
  console.log(`       ${r.reason}`)
  console.log('')
}

function runSearch(label, filters) {
  const { filters: used, all, ranked } = searchWithDetails(filters)

  console.log('─'.repeat(78))
  console.log(label)
  const monthName = MONTH_NAMES[used.month] || used.month || '(none)'
  console.log(
    `  budget ${used.budget ? money(used.budget) : '(none)'} · ${used.nights} nights · ` +
    `${monthName} · vibe ${used.vibe || 'anywhere'} · stay ${used.stay}` +
    (used.maxFlightHours != null ? ` · ≤${used.maxFlightHours}h flight` : '')
  )
  if (used.month && !MONTHS.includes(used.month)) {
    console.log(`  ⚠  '${used.month}' is not in the v1 dataset (have: ${MONTHS.join(', ')}).`)
  }
  const w = effectiveWeights(used)
  const w2 = (x) => x.toFixed(2)
  const flightNote = flightSensitivity(used.maxFlightHours) === 0
    ? '  (flight unconstrained → nonstop not rewarded)'
    : ''
  console.log(
    `  weights: headroom ${w2(w.headroom)} · weather ${w2(w.weather)} · ` +
    `nonstop ${w2(w.nonstop)} · visa ${w2(w.visa)}${flightNote}`
  )
  const overCount = all.filter((r) => r.overBudget).length
  const budgetNote = used.budget != null
    ? ` (${all.length - overCount} in budget, ${overCount} within ${Math.round(OVER_BUDGET_TOLERANCE * 100)}% over)`
    : ''
  console.log(`  ${all.length} destinations pass hard filters${budgetNote} → showing ${ranked.length} after per-region cap of ${used.maxPerRegion}\n`)

  if (ranked.length === 0) {
    console.log('  (no matches)\n')
    return
  }
  ranked.forEach(printResult)

  if (filters._showAll && all.length > ranked.length) {
    console.log('  ── all survivors, before diversification / limit ──\n')
    all.forEach(printResult)
  }
}

// ── preset scenarios (no args) ──────────────────────────────────────────────
const PRESETS = [
  ['1. Cheap winter beach escape', { budget: 1800, nights: 7, month: 'jan', vibe: 'beach', stay: 'mid' }],
  ['2. City + culture, shoulder season, mid budget', { budget: 2500, nights: 7, month: 'oct', vibe: 'city', stay: 'mid' }],
  ['3. Anywhere cheap, long trip, hostel tier', { budget: 2000, nights: 10, month: 'mar', vibe: 'cheap', stay: 'budget' }],
  ['4. Hiking trip, generous budget, summer', { budget: 3500, nights: 8, month: 'jun', vibe: 'hike', stay: 'mid' }],
  ['5. The stay-tier test: $2k / 7nt / Oct at NICE hotels', { budget: 2000, nights: 7, month: 'oct', stay: 'nice' }],
]

// ── main ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
if (argv.length === 0) {
  console.log('No filters given — running preset scenarios. Pass flags for a custom search (see --help in the header).')
  for (const [label, filters] of PRESETS) runSearch(label, filters)
} else {
  const filters = parseArgs(argv)
  runSearch('Custom search', filters)
}
