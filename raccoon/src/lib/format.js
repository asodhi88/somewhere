/**
 * format.js — display formatters that turn the getDestinations() result shape
 * (see ranking.js → toResult) into the strings the UI renders. Kept separate
 * from the ranking logic so presentation choices never leak into scoring.
 *
 * Every dollar figure in the data is a [low, high] range, so the money helpers
 * always render ranges (CLAUDE.md §4.2 — ranges, never false precision).
 */

const NUMBER_WORDS = [
  'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
  'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
]

/** "$1,080" */
export const money = (n) => '$' + Math.round(n).toLocaleString('en-US')

/** A [low, high] pair as "$1,080–1,950" (dash, no second dollar sign). */
export const moneyRange = (low, high) =>
  `${money(low)}–${Math.round(high).toLocaleString('en-US')}`

/** Flight access chip: "nonstop 6.5h" or "6.5h · 1 stop". */
export const flightMeta = (flight) =>
  flight.nonstop ? `nonstop ${flight.hours}h` : `${flight.hours}h · 1 stop`

/**
 * Weather chip from the month's climate normal: "22° mild, some rain". The
 * month is intentionally omitted — the user already picked it in the search
 * widget, so repeating it on every tile is redundant.
 */
export const weatherChip = (weather) => `${weather.high_c}° ${weather.label}`

/** Short visa standing on a Canadian passport, from the visa_ca code. */
export function visaChip(visa) {
  if (!visa) return 'check visa'
  if (visa.includes('esta')) return 'ESTA'
  if (visa.startsWith('visa_free')) return 'visa-free'
  if (visa.includes('evisa')) return 'eVisa'
  return 'visa required'
}

/** Over-budget tag: "~$340 over". */
export const overTag = (overBy) => `~${money(overBy)} over`

/**
 * A larger variant of a baked Unsplash "regular" URL for the lightbox. Only the
 * image CDN's width param is bumped — this is not an API call, and the app still
 * never touches the Unsplash API at runtime (CLAUDE.md §5). Returns the URL
 * unchanged if it carries no width param.
 */
export const largeUrl = (url) =>
  !url ? url : url.replace(/([?&])w=\d+/, '$1w=1600')

/** Zero-padded rank, "01".."12". */
export const rankLabel = (rank) => String(rank).padStart(2, '0')

/**
 * Results heading count phrase: "Six places that fit your trip",
 * "One place that fits your trip". Falls back to digits past twelve.
 */
export function countPhrase(n) {
  const word = NUMBER_WORDS[n] ?? String(n)
  const noun = n === 1 ? 'place that fits' : 'places that fit'
  return `${word} ${noun} your trip`
}
