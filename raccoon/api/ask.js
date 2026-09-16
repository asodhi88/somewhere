/**
 * POST /api/ask — "Ask somewhere", the natural-language entry point to the
 * existing search form (Vercel serverless function).
 *
 * Body:    { "query": "warm beach week in February under $2,000" }
 * Returns: { origin, month, nights, budget, stay, assumed[], unused[], originFallback }
 *
 * Every value in that response is a form input the user can see and change. The
 * endpoint does not rank, price, or name a destination — the ranking engine is
 * untouched by this feature, and the form works whether or not this call
 * succeeds. Copy in PR 2 must keep saying so.
 *
 * Three limits guard the spend, in order of how early they stop a request:
 *   1. length cap  — anything over 200 characters is refused before the API call
 *   2. per-IP      — ~10/minute, ~50/day, counted in Upstash (see _lib/rateLimit.js)
 *   3. Console cap — the monthly spend ceiling set on the Anthropic account
 *
 * Env (server-only — none of these reach the browser; see .env.example):
 *   ANTHROPIC_API_KEY
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */
import { AskError, parseQuery, validateQuery } from './_lib/parseQuery.js'
import { checkRateLimit, clientIp } from './_lib/rateLimit.js'

// Same shape as api/feedback.js: Vercel's Node runtime usually pre-parses a JSON
// body onto req.body, but fall back to the raw stream when it doesn't.
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

const fail = (res, status, code, error) => res.status(status).json({ code, error })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return fail(res, 405, 'method_not_allowed', 'Method not allowed.')
  }

  const body = await readBody(req)

  // Cheapest check first: a too-long or empty query never reaches the limiter,
  // let alone the API.
  let query
  try {
    query = validateQuery(body.query)
  } catch (err) {
    if (err instanceof AskError) return fail(res, err.status, err.code, err.message)
    throw err
  }

  const limit = await checkRateLimit(clientIp(req))
  if (!limit.ok) {
    if (limit.reason === 'unavailable') {
      return fail(res, 503, 'unavailable', 'Not available right now — use the form.')
    }
    if (limit.retryAfter) res.setHeader('Retry-After', String(limit.retryAfter))
    return fail(
      res,
      429,
      limit.reason === 'day' ? 'rate_limited_day' : 'rate_limited_minute',
      limit.reason === 'day'
        ? "That's enough queries for today — the form still works."
        : 'One moment — too many queries just now.',
    )
  }

  try {
    const { parse } = await parseQuery(query)
    return res.status(200).json(parse)
  } catch (err) {
    if (err instanceof AskError) return fail(res, err.status, err.code, err.message)
    console.error('ask: unexpected failure', err)
    return fail(res, 500, 'unexpected', 'Could not read that right now.')
  }
}
