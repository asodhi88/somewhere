/**
 * askNotes.js — turns a parse from /api/ask (or a curated example) into the
 * things the UI has to say about it.
 *
 * Pure: no React, no fetch, no DOM. The copy lives here so the honesty rules are
 * enforced in one readable place and can be unit-tested.
 *
 * The rules this module encodes:
 *   - Scout reads, fills and discloses. Nothing here says it found, picked,
 *     priced, recommended or chose anything, because it does none of those.
 *   - The form does not narrate itself. It once tagged every field Scout
 *     touched — "assumed, tap to change" where it filled a default, "from your
 *     words" on the origin row where it hadn't. All of it is gone. A disclosure
 *     has to earn its space by telling the traveller something that changes what
 *     the numbers mean; neither of those did. `assumed` survives only as the
 *     inverse of `filled`, which marks the fields Scout really did read. What
 *     passes that test is the next two rules.
 *   - `unused` renders as a SENTENCE, not chips. The model's wording varies
 *     between identical queries, so chips would look unstable; a sentence reads
 *     as prose that happens to quote them.
 *   - Two disclosures are promoted OUT of the quiet "couldn't use" line because
 *     acting on them changes what the numbers mean: an unsupported departure
 *     city, and a party of more than one. Both render as the design's banner.
 *   - The "Read as" card strikes words through IN PLACE (annotateQuery), but only
 *     words the model itself quoted — those are exact. It never highlights the
 *     words it thinks produced a value: /api/ask returns values, not character
 *     offsets, so "which words gave nights=10" could only ever be a guess, and a
 *     guess that moved between identical queries is the instability the sentence
 *     rule above exists to avoid. The sentence is always rendered too, so a
 *     fragment the model paraphrased instead of quoting is still disclosed.
 */
import { ORIGIN_OPTIONS, MONTH_OPTIONS, STAY_OPTIONS, normalizeOrigin } from './searchState'

/** The five form fields, in form order. Mirrors api/_lib/askSchema.js FIELDS. */
export const ASK_FIELDS = ['origin', 'month', 'nights', 'budget', 'stay']

const originCity = (code) =>
  ORIGIN_OPTIONS.find((o) => o.code === String(code || '').toUpperCase())?.city ||
  String(code || '')

/** Which fields came from the traveller's own words (everything not assumed). */
export const filledFields = (parse) =>
  ASK_FIELDS.filter((f) => !(parse.assumed || []).includes(f))

// ── party size ─────────────────────────────────────────────────────────────
// The cost model is one traveller's trip end to end (src/data/README.md): one
// seat, one bed, one person's daily spending. A party budget filtered against a
// solo total is wrong by roughly the headcount, so this cannot sit quietly in
// the "couldn't use" line next to "nightlife".
//
// The parser has no party field — rule 8 of its system prompt routes party
// wording into `unused` — so the promotion happens here, by reading those
// fragments.
//
// MEASURED, against the deployed endpoint: the model surfaces the party wording
// in roughly 3 of 5 runs of an IDENTICAL query. It reads the budget correctly
// every time (it never divides it), but it drops "for the two of us" from
// `unused` often enough that a disclosure resting on that fragment alone would
// be missing about 40% of the time.
//
// So the banner fires on EITHER a matching fragment OR the raw query text (see
// readParse). Biasing toward showing it is the safe direction: the note is a
// true statement about the cost model in every case — the estimate really is one
// traveller's trip — so a false positive is merely redundant, while a false
// negative leaves a party budget filtered against a solo total with nothing
// saying so. The durable fix is a dedicated party field in the PR 1 tool schema,
// where the model cannot forget to fill it; this is the honest interim.
const PARTY_PATTERNS = [
  // "2 of us", "four people", "3 adults", "two travellers"
  /\b(?:\d+|two|three|four|five|six|both)\s+(?:of\s+us|people|adults|travell?ers|passengers|guests)\b/i,
  // relationships and groups
  /\b(?:couples?|honeymoon|anniversary|famil(?:y|ies)|kids?|children|toddlers?|partner|wife|husband|spouse|girlfriend|boyfriend|friends?|group|party\s+of)\b/i,
  // money scoped to a headcount — "each", "per person", "between us"
  /\b(?:each|per\s+person|apiece|between\s+us)\b/i,
  // "travelling with my …", "me and …", "the two of us"
  /\b(?:travell?ing\s+with|going\s+with|me\s+and|us\s+two|the\s+two\s+of\s+us)\b/i,
]
// "a couple of weeks" is a duration, not a headcount — the one common false
// positive in the list above, so it is subtracted explicitly.
const NOT_PARTY = /\bcouple\s+of\s+(?:weeks?|days?|nights?|months?|hours?)\b/i

export const looksLikeParty = (fragment) => {
  const f = String(fragment || '')
  if (NOT_PARTY.test(f)) return false
  return PARTY_PATTERNS.some((re) => re.test(f))
}

/**
 * Split `unused` into the fragments that need the prominent party note and the
 * rest. A fragment is only ever in one list, so nothing is said twice.
 */
export function splitParty(unused) {
  const list = (Array.isArray(unused) ? unused : []).filter(Boolean)
  const party = list.filter(looksLikeParty)
  return { party, rest: list.filter((f) => !party.includes(f)) }
}

// ── the sentences ──────────────────────────────────────────────────────────

const quote = (f) => `“${f}”`

/** "a", "a or b", "a, b or c" — a list that reads aloud inside a sentence. */
function listOf(items) {
  const q = items.map(quote)
  if (q.length <= 1) return q[0] || ''
  return `${q.slice(0, -1).join(', ')} or ${q[q.length - 1]}`
}

/**
 * The "couldn't use" line, as one sentence. Returns null when there is nothing
 * to say — an empty list must render nothing at all, not an empty container.
 *
 * It puts the limit on the form, which is where the limit actually is: these are
 * asks the ranking engine has no input for, not asks Scout judged.
 */
export function unusedSentence(fragments) {
  const list = (Array.isArray(fragments) ? fragments : []).filter(Boolean)
  if (!list.length) return null
  const one = list.length === 1
  // NOT the design's "Ranking is by total trip cost only" — that is false. The
  // engine scores headroom, weather and flight time (src/lib/ranking.js), and
  // the How-it-works page says so. The real limit is that the form has no input
  // for these, which is also the honest thing to say.
  return `Couldn’t use ${listOf(list)} — the form has no input for ${one ? 'it' : 'those'}.`
}

/**
 * The origin-fallback note. Prominent, because a traveller leaving from an
 * unsupported city faces materially different real costs — this is not a
 * "couldn't use" shrug.
 */
export function originFallbackNote(parse) {
  if (!parse?.originFallback) return null
  return {
    lead: `Departures from ${parse.originFallback} are coming soon.`,
    rest: `For now, here’s what these trips cost from ${originCity(parse.origin)}.`,
  }
}

/** The party-size note. Same prominence as the origin fallback, same reason. */
export const PARTY_NOTE = {
  lead: 'Costs shown are for one traveller.',
  rest: 'Party pricing is coming.',
}

// ── the "Read as" sentence ─────────────────────────────────────────────────

/**
 * Split the traveller's own sentence into segments, striking through the words
 * the parse could not carry (the design's `.rc-tok--dead`).
 *
 * Only words the MODEL QUOTED are marked. Every fragment in `unused` is a verbatim
 * slice of the query by construction (rule 8: "in their own wording"), and
 * `originFallback` is the city "exactly as they wrote it" (rule 7) — so these can
 * be located rather than guessed. Recognised words are deliberately NOT
 * highlighted: the endpoint returns values, not offsets, so which words produced
 * nights=10 would be a guess, and a guess that moved between identical queries is
 * the exact instability that keeps `unused` a sentence instead of chips.
 *
 * A fragment the model paraphrased instead of quoting simply isn't found and
 * isn't marked; it is still disclosed by the sentence rendered underneath, which
 * is why both are always shown.
 *
 * @param {string} query
 * @param {Object} parse
 * @returns {Array<{text: string, dead?: boolean, label?: string}>}
 */
export function annotateQuery(query, parse) {
  const q = String(query || '')
  if (!q) return []
  const lower = q.toLowerCase()
  const marks = []

  const claim = (needle, label) => {
    const n = String(needle || '').trim()
    if (!n) return
    const start = lower.indexOf(n.toLowerCase())
    if (start === -1) return
    const end = start + n.length
    // First claim wins; a later fragment never re-marks text already struck.
    if (marks.some((m) => start < m.end && end > m.start)) return
    marks.push({ start, end, label })
  }

  // The departure city first: it is the most specific claim, and its own label.
  if (parse.originFallback) claim(parse.originFallback, 'coming soon')
  const { party, rest } = splitParty(parse.unused)
  // "not ranked" would be wrong here — the trip is priced for one person, which
  // is a different limitation from an ask the form cannot express.
  for (const f of party) claim(f, 'priced for one')
  for (const f of rest) claim(f, 'not ranked')

  marks.sort((a, b) => a.start - b.start)

  const out = []
  let cursor = 0
  for (const m of marks) {
    if (m.start > cursor) out.push({ text: q.slice(cursor, m.start) })
    out.push({ text: q.slice(m.start, m.end), dead: true, label: m.label })
    cursor = m.end
  }
  if (cursor < q.length) out.push({ text: q.slice(cursor) })
  return out
}

/**
 * What the "Leaving from" row says about its own value after a fill — the
 * design's `.rc-orig-tag`. There is exactly one thing left worth saying, so this
 * is null in every other case.
 *
 * The row used to narrate every outcome: "assumed · tap to change" for an origin
 * the form defaulted to, "from your words" for one the traveller named. Both are
 * gone. Neither earned the space — one disclosed a default nobody asked about,
 * the other told the traveller something they already knew, having just typed it.
 *
 * "adjusted" stays because it is not narration: it is half of the origin-fallback
 * disclosure, the visible half. It fires only when the traveller named a
 * departure city we don't fly from, and the numbers on screen are therefore
 * priced from somewhere else. `originFallbackNote()` carries the other half.
 */
export const originTag = (parse) => (parse?.originFallback ? 'adjusted' : null)

// ── parse → form ───────────────────────────────────────────────────────────

/** True for anything shaped like a parse the form can be filled from. */
export function isParse(p) {
  return (
    !!p &&
    typeof p === 'object' &&
    typeof p.month === 'string' &&
    Number.isFinite(Number(p.nights)) &&
    typeof p.stay === 'string'
  )
}

/**
 * The five filter values, in the form's own vocabulary (lowercase origin value,
 * month window value). Anything the form would reject falls back through the
 * same normalisers a shared URL goes through — a parse can never hand the form
 * a value it would refuse.
 */
export function parseToFilters(parse) {
  const month = MONTH_OPTIONS.find((m) => m.value === parse.month)
  const nights = Math.min(30, Math.max(1, Math.round(Number(parse.nights)) || 7))
  return {
    origin: normalizeOrigin(parse.origin),
    budget: parse.budget == null ? null : Math.min(100000, Math.max(0, Number(parse.budget))),
    nights,
    month: month ? month.value : MONTH_OPTIONS[0].value,
    stay: STAY_OPTIONS.some((s) => s.value === parse.stay) ? parse.stay : 'mid',
  }
}

/**
 * Everything the UI needs from one parse, in one object.
 *
 * @param {Object} parse
 * @param {string} [query] the traveller's own sentence, so a party the model
 *        failed to report in `unused` is still disclosed
 * @returns {{filters: Object, assumed: string[], filled: string[],
 *            originTag: ?string, notes: Object}}
 */
export function readParse(parse, query = '') {
  const { party, rest } = splitParty(parse.unused)
  // The raw sentence is the backstop for a party the model forgot to report.
  const partyMentioned = party.length > 0 || looksLikeParty(query)
  const assumed = ASK_FIELDS.filter((f) => (parse.assumed || []).includes(f))
  return {
    filters: parseToFilters(parse),
    assumed,
    filled: filledFields(parse),
    // Origin is not one of the form's fields (it lives in the "Leaving from"
    // row), so it carries its own tag. Null unless the traveller named a city —
    // nothing discloses an assumed value any more.
    originTag: originTag(parse),
    notes: {
      origin: originFallbackNote(parse),
      party: partyMentioned ? PARTY_NOTE : null,
      unused: unusedSentence(rest),
    },
  }
}
