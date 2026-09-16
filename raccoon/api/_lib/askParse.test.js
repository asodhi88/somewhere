/**
 * askParse.test.js — the "Ask somewhere" parse test set.
 *
 * Two layers:
 *
 *   Offline (always)  — the request limits and the normaliser, which is what
 *                       actually guarantees the endpoint can only ever hand the
 *                       form a value the form accepts. No API key, no cost.
 *
 *   Live (opt-in)     — every fixture query through claude-haiku-4-5, asserted
 *                       against its expected parse. Costs a fraction of a cent
 *                       and needs a key, so it is gated:
 *
 *                         ASK_LIVE=1 ANTHROPIC_API_KEY=sk-... npm test
 *
 * For a readable actual-vs-expected table (rather than pass/fail), run
 * `node scripts/ask-parse-check.mjs`.
 */
import { describe, expect, it } from 'vitest'
import { FIXTURES, FIXTURE_NOW } from './askFixtures.js'
import {
  askContext,
  buildTool,
  normalizeParse,
  MAX_QUERY_CHARS,
  FIELDS,
  STAY_VALUES,
} from './askSchema.js'
import { AskError, parseQuery, validateQuery } from './parseQuery.js'

const ctx = askContext(FIXTURE_NOW)

// A well-formed tool input, to be spread over with the one bad field per case.
const good = {
  origin: 'YUL',
  month: 'jan-2027',
  nights: 5,
  budget: 1800,
  stay: 'nice',
  assumed: [],
  unused: [],
  originFallback: '',
}

describe('the fixture set', () => {
  it('covers every category the spec names', () => {
    const categories = new Set(FIXTURES.map((f) => f.category))
    expect(categories).toEqual(
      new Set([
        'Fully specified',
        'Missing fields',
        'Stay tier',
        'Unsupported origin',
        'Unrankable ask',
        'Named destination',
        'Long query',
        'Nonsense / empty',
        'Character cap',
      ]),
    )
    expect(FIXTURES.length).toBeGreaterThanOrEqual(20)
  })

  it('gives every fixture a unique id and an expectation', () => {
    const ids = FIXTURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of FIXTURES) expect(Boolean(f.expect) !== Boolean(f.expectError)).toBe(true)
  })

  it('tests the cap at the boundary, not near it', () => {
    const at = FIXTURES.find((f) => f.id === 'cap-at-200')
    const over = FIXTURES.find((f) => f.id === 'cap-over-200')
    expect(at.query.length).toBe(MAX_QUERY_CHARS)
    expect(over.query.length).toBeGreaterThan(MAX_QUERY_CHARS)
  })

  it('only expects months the form offers', () => {
    for (const f of FIXTURES) {
      if (f.expect) expect(ctx.monthValues).toContain(f.expect.month)
    }
  })
})

describe('the tool schema', () => {
  const tool = buildTool(ctx)

  it('is strict, closed, and requires every field', () => {
    expect(tool.strict).toBe(true)
    expect(tool.input_schema.additionalProperties).toBe(false)
    expect(tool.input_schema.required).toEqual([...FIELDS, 'unused', 'originFallback'])
  })

  it("binds the enums to the form's own values", () => {
    const props = tool.input_schema.properties
    expect(props.month.anyOf[0].enum).toEqual(ctx.monthValues)
    expect(props.stay.anyOf[0].enum).toEqual(STAY_VALUES)
    expect(props.origin.anyOf[0].enum).toEqual(['YYZ', 'YUL'])
  })

  it('lets the model decline every field, and never asks it for `assumed`', () => {
    const props = tool.input_schema.properties
    // The model's only judgement is value-or-null. `assumed` is derived from
    // the nulls by normalizeParse, so the model has no array it could forget
    // to append to — the silent-default failure is structurally impossible.
    expect(props.assumed).toBeUndefined()
    expect(tool.input_schema.required).not.toContain('assumed')
    for (const f of ['origin', 'month', 'stay']) {
      expect(props[f].anyOf[1]).toEqual({ type: 'null' })
    }
    for (const f of ['nights', 'budget']) {
      expect(props[f].type).toEqual([f === 'nights' ? 'integer' : 'integer', 'null'])
    }
    expect(props.originFallback.type).toEqual(['string', 'null'])
  })

  it('carries no numeric bounds — a strict schema rejects them on integers', () => {
    // The API returns 400 "For 'integer' type, properties maximum, minimum are
    // not supported". clampInt enforces the ranges instead; this guards the
    // schema against quietly growing them back.
    const json = JSON.stringify(tool.input_schema)
    expect(json).not.toMatch(/"minimum"|"maximum"/)
  })
})

describe('validateQuery — the per-request limit', () => {
  it('rejects an empty query before any API call', () => {
    expect(() => validateQuery('   ')).toThrow(AskError)
    try {
      validateQuery('')
    } catch (err) {
      expect(err.code).toBe('empty_query')
      expect(err.status).toBe(400)
    }
  })

  it('accepts exactly the cap and rejects one character more', () => {
    expect(validateQuery('a'.repeat(MAX_QUERY_CHARS))).toHaveLength(MAX_QUERY_CHARS)
    try {
      validateQuery('a'.repeat(MAX_QUERY_CHARS + 1))
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.code).toBe('query_too_long')
      expect(err.status).toBe(400)
    }
  })

  it('measures the trimmed query', () => {
    expect(validateQuery(`  ${'a'.repeat(MAX_QUERY_CHARS)}  `)).toHaveLength(MAX_QUERY_CHARS)
  })
})

describe('normalizeParse — the form is the authority, not the model', () => {
  it('passes a clean parse through unchanged', () => {
    expect(normalizeParse(good, ctx)).toEqual({
      origin: 'YUL',
      month: 'jan-2027',
      nights: 5,
      budget: 1800,
      stay: 'nice',
      assumed: [],
      unused: [],
      originFallback: null,
    })
  })

  it('falls back to the form default for an unsupported origin, and says so', () => {
    const out = normalizeParse({ ...good, origin: 'YVR' }, ctx)
    expect(out.origin).toBe('YYZ')
    expect(out.assumed).toContain('origin')
  })

  it('pins origin to the default when a fallback city is named, without an assumed chip', () => {
    const out = normalizeParse({ ...good, origin: 'YVR', originFallback: 'Vancouver' }, ctx)
    expect(out.origin).toBe('YYZ')
    expect(out.originFallback).toBe('Vancouver')
    expect(out.assumed).not.toContain('origin')
  })

  it('treats a null or blank originFallback as none', () => {
    expect(normalizeParse({ ...good, originFallback: null }, ctx).originFallback).toBeNull()
    expect(normalizeParse({ ...good, originFallback: '  ' }, ctx).originFallback).toBeNull()
  })

  it('never lists the fallback city under unused as well', () => {
    // originFallback is the disclosure; PR 2 gives it its own prominent note.
    const out = normalizeParse(
      { ...good, originFallback: 'Vancouver', unused: ['From Vancouver', 'beach'] },
      ctx,
    )
    expect(out.originFallback).toBe('Vancouver')
    expect(out.unused).toEqual(['beach'])
  })

  it('replaces a month outside the form window', () => {
    const out = normalizeParse({ ...good, month: 'oct-2031' }, ctx)
    expect(out.month).toBe(ctx.defaults.month)
    expect(out.assumed).toContain('month')
  })

  it('clamps nights and budget to what the form accepts', () => {
    expect(normalizeParse({ ...good, nights: 400 }, ctx).nights).toBe(30)
    expect(normalizeParse({ ...good, nights: 0 }, ctx).nights).toBe(1)
    expect(normalizeParse({ ...good, nights: 6.4 }, ctx).nights).toBe(6)
    expect(normalizeParse({ ...good, budget: 9e9 }, ctx).budget).toBe(100000)
    expect(normalizeParse({ ...good, budget: -50 }, ctx).budget).toBe(0)
  })

  it('defaults a missing number and records the assumption', () => {
    const out = normalizeParse({ ...good, nights: null, budget: undefined }, ctx)
    expect(out.nights).toBe(ctx.defaults.nights)
    expect(out.budget).toBe(ctx.defaults.budget)
    expect(out.assumed).toEqual(['nights', 'budget'])
  })

  it('falls back to the form default for an unknown stay tier, and says so', () => {
    const out = normalizeParse({ ...good, stay: 'penthouse' }, ctx)
    expect(out.stay).toBe(ctx.defaults.stay)
    expect(out.assumed).toContain('stay')
  })

  it('takes the stay value, never the UI label', () => {
    // The form stores `mid` and displays "Mid-range" — a label is not a value.
    expect(normalizeParse({ ...good, stay: 'Mid-range' }, ctx).stay).toBe(ctx.defaults.stay)
    expect(normalizeParse({ ...good, stay: 'MID' }, ctx).stay).toBe('mid')
    expect(normalizeParse({ ...good, stay: 'MID' }, ctx).assumed).not.toContain('stay')
  })

  it('derives assumed in form order from the nulls, ignoring what the model sends', () => {
    const out = normalizeParse(
      // A model-supplied `assumed` is not read at all — it is derived from the
      // fields that came back null, which is the whole point of the design.
      { ...good, origin: null, budget: null, assumed: ['month', 'vibe'] },
      ctx,
    )
    expect(out.assumed).toEqual(['origin', 'budget'])
    for (const f of out.assumed) expect(FIELDS).toContain(f)
  })

  it('does not call a clamped number an assumption', () => {
    // The traveller did answer; the answer was just out of range.
    expect(normalizeParse({ ...good, nights: 400 }, ctx).assumed).toEqual([])
    expect(normalizeParse({ ...good, budget: -50 }, ctx).assumed).toEqual([])
  })

  it('tidies unused fragments — trimmed, deduped, capped', () => {
    const out = normalizeParse(
      {
        ...good,
        unused: ['  beach  ', 'Beach', '', null, 'a'.repeat(200), 'b', 'c', 'd', 'e', 'f'],
      },
      ctx,
    )
    expect(out.unused[0]).toBe('beach')
    expect(out.unused).not.toContain('Beach')
    expect(out.unused.length).toBeLessThanOrEqual(5)
    for (const f of out.unused) expect(f.length).toBeLessThanOrEqual(80)
  })

  it('survives a garbage tool input by handing back the blank form', () => {
    const out = normalizeParse(null, ctx)
    expect(out).toEqual({
      origin: ctx.defaults.origin,
      month: ctx.defaults.month,
      nights: ctx.defaults.nights,
      budget: ctx.defaults.budget,
      stay: ctx.defaults.stay,
      assumed: FIELDS,
      unused: [],
      originFallback: null,
    })
  })
})

// ── live parses (opt-in) ────────────────────────────────────────────────────
const live = process.env.ASK_LIVE === '1' && Boolean(process.env.ANTHROPIC_API_KEY)

describe.skipIf(!live)('live parses (claude-haiku-4-5)', () => {
  for (const f of FIXTURES) {
    it(`${f.id} — ${f.query.slice(0, 60)}`, async () => {
      if (f.expectError) {
        await expect(parseQuery(f.query, { now: FIXTURE_NOW })).rejects.toMatchObject({
          code: f.expectError,
        })
        return
      }

      const { parse } = await parseQuery(f.query, { now: FIXTURE_NOW })
      expect(parse.origin).toBe(f.expect.origin)
      expect(parse.month).toBe(f.expect.month)
      expect(parse.nights).toBe(f.expect.nights)
      expect(parse.budget).toBe(f.expect.budget)
      expect(parse.stay).toBe(f.expect.stay)
      expect(parse.assumed).toEqual(f.expect.assumed)

      if (f.expect.originFallback instanceof RegExp) {
        expect(parse.originFallback).toMatch(f.expect.originFallback)
      } else {
        expect(parse.originFallback).toBeNull()
      }

      if (f.expect.unused.length === 0) {
        expect(parse.unused).toEqual([])
      } else {
        for (const pattern of f.expect.unused) {
          expect(parse.unused.some((u) => pattern.test(u))).toBe(true)
        }
      }
    }, 30000)
  }
})
