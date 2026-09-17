/**
 * askExamples.js — the curated "Scout" example queries and their stored parses.
 *
 * Clicking an example fills the form instantly: no request, no cost, and no
 * chance of a bad parse on first contact. That only works if the stored parse is
 * the one the live parser actually produces, so each of these was run through
 * api/_lib/parseQuery.js three times and produced this result every time, with
 * an empty `unused`.
 *
 * The rule for adding one: EVERY word in the query must map to a form input. An
 * example whose stored parse quietly ignores a word would be a silent drop —
 * hidden in a place `unused` cannot reach, on the first thing a user clicks.
 *
 * Why `monthKey` and not a month value: the form's month list is a rolling
 * 13-month window (searchState.buildMonthOptions), so "February" means a
 * different option depending on when the page is loaded. Storing `feb-2027`
 * would go stale and eventually fall out of the window. Storing the key and
 * resolving it against the live window reproduces the parser's own rule — the
 * next occurrence of that month — for as long as the app runs.
 */
import { MONTH_OPTIONS, DEFAULT_MONTH } from './searchState'

/**
 * @typedef {Object} AskExample
 * @property {string} query     the words shown on the chip, verbatim
 * @property {Object} parse     the verified parse, with `month` held as `monthKey`
 */

/** @type {AskExample[]} */
export const ASK_EXAMPLES = [
  {
    query: 'February 1 week under $2,000',
    parse: {
      origin: 'YYZ',
      monthKey: 'feb',
      nights: 7,
      budget: 2000,
      stay: 'mid',
      assumed: ['origin', 'stay'],
      unused: [],
      originFallback: null,
    },
  },
  {
    query: '7 nights in March from Toronto',
    parse: {
      origin: 'YYZ',
      monthKey: 'mar',
      nights: 7,
      budget: 2000,
      stay: 'mid',
      assumed: ['budget', 'stay'],
      unused: [],
      originFallback: null,
    },
  },
  {
    query: 'Long weekend in Oct, $1,500 all in',
    parse: {
      origin: 'YYZ',
      monthKey: 'oct',
      nights: 3,
      budget: 1500,
      stay: 'mid',
      assumed: ['origin', 'stay'],
      unused: [],
      originFallback: null,
    },
  },
]

/**
 * Resolve a stored example into a real parse — the same shape /api/ask returns.
 *
 * @param {AskExample} example
 * @param {Array} [months] the month window (injectable for tests)
 * @returns {Object} a parse with a concrete `month` value
 */
export function resolveExample(example, months = MONTH_OPTIONS) {
  const { monthKey, ...rest } = example.parse
  // The window is ordered from this month forward, so the first match is the
  // next occurrence — exactly what the parser does with a bare month name.
  const match = months.find((m) => m.key === monthKey)
  return { ...rest, month: match ? match.value : DEFAULT_MONTH }
}
