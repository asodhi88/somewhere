/**
 * rateLimit.js — per-IP limits for the one endpoint in this project that costs
 * money per call (ask-somewhere task, Limits layer 2).
 *
 * Serverless invocations don't share memory, so a module-level counter would
 * reset whenever a new instance spun up — i.e. exactly when someone is hammering
 * the endpoint. The counters live in Upstash Redis (REST, so no TCP client and
 * no dependency) under fixed windows:
 *
 *   10 per minute   — stops a burst
 *   50 per day      — stops a slow grind
 *
 * Both keys embed their window, so each one is written once and expires on its
 * own; there is no read-modify-write and no NX dance.
 *
 * Fails CLOSED. If the store is unreachable or unconfigured, requests are
 * refused rather than waved through — the endpoint spends real money, and the
 * search form works without it. Set ASK_RATE_LIMIT=off to run the endpoint
 * locally with no store (never in production; the Anthropic Console spend cap is
 * then the only thing left between a loop and a bill).
 *
 * Env (server-only):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *   ASK_RATE_LIMIT=off   — optional local-dev escape hatch
 */
import { createHash } from 'node:crypto'

export const PER_MINUTE = 10
export const PER_DAY = 50

const MINUTE = 60
const DAY = 86400

/**
 * The caller's IP, from the proxy headers Vercel sets. `x-forwarded-for` is a
 * comma-separated chain; the client is the first entry.
 */
export function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for']
  const first = String(Array.isArray(fwd) ? fwd[0] : fwd || '')
    .split(',')[0]
    .trim()
  return first || String(req.headers?.['x-real-ip'] || '').trim() || 'unknown'
}

// Hashed, not stored raw: the counter only needs to tell visitors apart, and an
// IP is personal data we have no reason to hand to a third-party store.
const bucketId = (ip) => createHash('sha256').update(String(ip)).digest('hex').slice(0, 16)

/**
 * Run both counters in one round trip.
 *
 * @param {string} ip
 * @param {number} [nowMs]
 * @returns {Promise<{ok: boolean, reason?: string, retryAfter?: number,
 *                    minute?: number, day?: number}>}
 */
export async function checkRateLimit(ip, nowMs = Date.now()) {
  if (process.env.ASK_RATE_LIMIT === 'off') return { ok: true }

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.error('ask: UPSTASH_REDIS_REST_URL / _TOKEN unset — refusing to run unmetered.')
    return { ok: false, reason: 'unavailable' }
  }

  const id = bucketId(ip)
  const minuteWindow = Math.floor(nowMs / 1000 / MINUTE)
  const dayWindow = Math.floor(nowMs / 1000 / DAY)
  const minuteKey = `ask:m:${id}:${minuteWindow}`
  const dayKey = `ask:d:${id}:${dayWindow}`

  let results
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', minuteKey],
        ['EXPIRE', minuteKey, MINUTE],
        ['INCR', dayKey],
        ['EXPIRE', dayKey, DAY],
      ]),
    })
    if (!r.ok) {
      console.error('ask: rate-limit store returned', r.status)
      return { ok: false, reason: 'unavailable' }
    }
    results = await r.json()
  } catch (err) {
    console.error('ask: rate-limit store unreachable', err)
    return { ok: false, reason: 'unavailable' }
  }

  const minute = Number(results?.[0]?.result)
  const day = Number(results?.[2]?.result)
  if (!Number.isFinite(minute) || !Number.isFinite(day)) {
    console.error('ask: unexpected rate-limit reply', results)
    return { ok: false, reason: 'unavailable' }
  }

  if (minute > PER_MINUTE) {
    // Seconds left in this fixed window.
    const retryAfter = (minuteWindow + 1) * MINUTE - Math.floor(nowMs / 1000)
    return { ok: false, reason: 'minute', retryAfter, minute, day }
  }
  if (day > PER_DAY) {
    const retryAfter = (dayWindow + 1) * DAY - Math.floor(nowMs / 1000)
    return { ok: false, reason: 'day', retryAfter, minute, day }
  }

  return { ok: true, minute, day }
}
