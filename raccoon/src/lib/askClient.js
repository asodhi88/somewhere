/**
 * askClient.js — the one call to /api/ask (the PR 1 serverless parser).
 *
 * Split out of the components so the fetch, its error contract, and the length
 * cap live in one place and the UI only ever deals with "a parse" or "a message
 * to show". No key, no model, no prompt reaches the browser: the endpoint holds
 * all of that (api/ask.js).
 */
import { isParse } from './askNotes'

/** Mirrors MAX_QUERY_CHARS in api/_lib/askSchema.js — the endpoint's own cap. */
export const MAX_QUERY_CHARS = 200

/**
 * Parse one traveller sentence into form inputs.
 *
 * Never throws. A failure comes back as `{ error }`, already phrased for the
 * traveller, because every failure path in this feature ends the same way: one
 * neutral line, and a form that still works.
 *
 * @param {string} query
 * @returns {Promise<{parse?: Object, error?: string}>}
 */
export async function requestParse(query) {
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && isParse(data)) return { parse: data }
    // The endpoint's own messages are neutral and already point back at the form
    // (rate limits, length cap, upstream trouble), so they are shown as written.
    // Only a failure with no message of its own falls through to the default.
    return { error: data?.error || defaultFailure() }
  } catch {
    // Network drop, offline, a proxy returning HTML — nothing the traveller can
    // act on, so it reads the same as any other miss.
    return { error: defaultFailure() }
  }
}

export const defaultFailure = () =>
  'Scout couldn’t read that just now. The search is yours to fill in.'
