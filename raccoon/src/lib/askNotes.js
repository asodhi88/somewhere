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
 *   - Every assumption gets a note ON its own field, where the correction is
 *     made — never rolled up into one banner.
 *   - `unused` renders as a SENTENCE, not chips. The model's wording varies
 *     between identical queries, so chips would look unstable; a sentence reads
 *     as prose that happens to quote them.
 *   - Two disclosures are promoted OUT of the quiet "couldn't use" line because
 *     acting on them changes what the numbers mean: an unsupported departure
 *     city, and a party of more than one.
 */
import { ORIGIN_OPTIONS, MONTH_OPTIONS, STAY_OPTIONS, normalizeOrigin } from './searchState'

/** The five form fields, in form order. Mirrors api/_lib/askSchema.js FIELDS. */
export const ASK_FIELDS = ['origin', 'month', 'nights', 'budget', 'stay']

const originCity = (code) =>
  ORIGIN_OPTIONS.find((o) => o.code === String(code || '').toUpperCase())?.city ||
  String(code || '')

const money = (n) => '$' + Number(n).toLocaleString('en-US')

/**
 * How a filled field reads in its own note — the value as the form shows it, so
 * the note and the control never disagree ("Mid-range", not "mid").
 */
export function fieldValueLabel(field, parse) {
  switch (field) {
    case 'origin':
      return originCity(parse.origin)
    case 'month':
      return MONTH_OPTIONS.find((m) => m.value === parse.month)?.label || parse.month
    case 'nights':
      return `${parse.nights} night${Number(parse.nights) === 1 ? '' : 's'}`
    case 'budget':
      return parse.budget == null ? 'No limit' : money(parse.budget)
    case 'stay':
      return STAY_OPTIONS.find((s) => s.value === parse.stay)?.label || parse.stay
    default:
      return ''
  }
}

/**
 * The inline note for one assumed field, e.g. "Mid-range · assumed, tap to change".
 * It names the value the form filled, not the field — the field name is already
 * on the control the note sits under.
 */
export const assumptionNote = (field, parse) =>
  `${fieldValueLabel(field, parse)} · assumed, tap to change`

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
// fragments. That makes it a heuristic over the model's own phrasing: a party
// described in wording none of these patterns match still gets disclosed, just
// in the quiet line rather than the prominent one. The failure mode is
// under-promotion, never a wrong number.
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
  return (
    `Scout couldn’t fit ${listOf(list)} into the form — ` +
    `there’s no input for ${one ? 'that' : 'those'}, so ` +
    `${one ? 'it isn’t' : 'they aren’t'} part of this search.`
  )
}

/**
 * The origin-fallback note. Prominent, because a traveller leaving from an
 * unsupported city faces materially different real costs — this is not a
 * "couldn't use" shrug.
 */
export function originFallbackNote(parse) {
  if (!parse?.originFallback) return null
  return (
    `Departures from ${parse.originFallback} are coming soon. ` +
    `For now, here’s what these trips cost from ${originCity(parse.origin)}.`
  )
}

/** The party-size note. Same prominence as the origin fallback, same reason. */
export const PARTY_NOTE = 'Costs shown are for one traveller. Party pricing is coming.'

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
 * @returns {{filters: Object, assumed: string[], filled: string[],
 *            fieldNotes: Object, notes: Object}}
 */
export function readParse(parse) {
  const { party, rest } = splitParty(parse.unused)
  const assumed = ASK_FIELDS.filter((f) => (parse.assumed || []).includes(f))
  return {
    filters: parseToFilters(parse),
    assumed,
    filled: filledFields(parse),
    // field name → the inline note that field carries, for the form to place
    // under its own control.
    fieldNotes: Object.fromEntries(assumed.map((f) => [f, assumptionNote(f, parse)])),
    notes: {
      origin: originFallbackNote(parse),
      party: party.length ? PARTY_NOTE : null,
      unused: unusedSentence(rest),
    },
  }
}
