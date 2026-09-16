/**
 * parseQuery.js — the one call to Claude behind "Ask somewhere".
 *
 * Separated from the HTTP handler so the same function backs both the endpoint
 * and scripts/ask-parse-check.mjs, the harness that prints a parse for every
 * fixture query. Nothing here knows about req/res or rate limits.
 *
 * Model: claude-haiku-4-5 — extraction, not generation. Forced tool use with a
 * strict schema means the reply is always a form-shaped object, never prose, and
 * max_tokens is deliberately small.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  ASK_MODEL,
  ASK_MAX_TOKENS,
  ASK_TOOL_NAME,
  MAX_QUERY_CHARS,
  askContext,
  buildSystemPrompt,
  buildTool,
  normalizeParse,
} from './askSchema.js'

/** Thrown for anything the caller should turn into a specific HTTP status. */
export class AskError extends Error {
  constructor(code, status, message) {
    super(message)
    this.name = 'AskError'
    this.code = code
    this.status = status
  }
}

let cachedClient = null

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AskError('not_configured', 500, 'Query parsing is not configured.')
  }
  // Reused across invocations on a warm instance; the key cannot change under it.
  if (!cachedClient) cachedClient = new Anthropic()
  return cachedClient
}

/**
 * Validate a raw query string before anything is spent on it.
 *
 * @param {unknown} raw
 * @returns {string} the trimmed query
 * @throws {AskError} `empty_query` or `query_too_long` — both rejected pre-API.
 */
export function validateQuery(raw) {
  const query = String(raw == null ? '' : raw).trim()
  if (!query) throw new AskError('empty_query', 400, 'Type a few words about the trip.')
  if (query.length > MAX_QUERY_CHARS) {
    throw new AskError(
      'query_too_long',
      400,
      `Keep it under ${MAX_QUERY_CHARS} characters.`,
    )
  }
  return query
}

/**
 * Parse one traveller query into form inputs.
 *
 * @param {string} raw - the traveller's words (validated here, not before)
 * @param {Object} [opts]
 * @param {Date}   [opts.now]    - clock for the month window (tests pass a fixed date)
 * @param {Object} [opts.client] - an Anthropic client, for tests
 * @returns {Promise<{parse: Object, usage: Object}>}
 */
export async function parseQuery(raw, { now = new Date(), client } = {}) {
  const query = validateQuery(raw)
  const ctx = askContext(now)
  const anthropic = client || getClient()

  let message
  try {
    message = await anthropic.messages.create({
      model: ASK_MODEL,
      max_tokens: ASK_MAX_TOKENS,
      system: buildSystemPrompt(ctx),
      tools: [buildTool(ctx)],
      // Forced: the only acceptable reply is a filled form.
      tool_choice: { type: 'tool', name: ASK_TOOL_NAME },
      messages: [{ role: 'user', content: query }],
    })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new AskError('upstream_busy', 503, 'Too busy right now — use the form.')
    }
    if (err instanceof Anthropic.APIError) {
      console.error('ask: Anthropic error', err.status, err.message)
      throw new AskError('upstream_error', 502, 'Could not read that right now.')
    }
    console.error('ask: request failed', err)
    throw new AskError('upstream_error', 502, 'Could not read that right now.')
  }

  const block = message.content.find(
    (b) => b.type === 'tool_use' && b.name === ASK_TOOL_NAME,
  )
  if (!block) {
    console.error('ask: no tool_use block', message.stop_reason)
    throw new AskError('unparsed', 502, 'Could not read that right now.')
  }

  return {
    parse: normalizeParse(block.input, ctx),
    usage: {
      input_tokens: message.usage?.input_tokens ?? null,
      output_tokens: message.usage?.output_tokens ?? null,
    },
  }
}
