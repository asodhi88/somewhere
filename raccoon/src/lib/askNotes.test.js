import { describe, it, expect } from 'vitest'
import {
  ASK_FIELDS,
  annotateQuery,
  originTag,
  PARTY_NOTE,
  filledFields,
  isParse,
  looksLikeParty,
  originFallbackNote,
  parseToFilters,
  readParse,
  splitParty,
  unusedSentence,
} from './askNotes'
import { ASK_EXAMPLES, resolveExample } from './askExamples'
import { MONTH_OPTIONS, STAY_OPTIONS, ORIGIN_OPTIONS } from './searchState'

const MONTH = MONTH_OPTIONS[1].value

/** A parse in the shape /api/ask returns, overridden per test. */
const parse = (over = {}) => ({
  origin: 'YYZ',
  month: MONTH,
  nights: 7,
  budget: 2000,
  stay: 'mid',
  assumed: [],
  unused: [],
  originFallback: null,
  ...over,
})

describe('filledFields', () => {
  it('is every field the model did not leave to the form', () => {
    expect(filledFields(parse({ assumed: ['origin', 'stay'] }))).toEqual([
      'month',
      'nights',
      'budget',
    ])
  })
})

describe('unusedSentence', () => {
  it('is nothing at all when there is nothing to say', () => {
    expect(unusedSentence([])).toBeNull()
    expect(unusedSentence(undefined)).toBeNull()
  })

  it('reads as one sentence, singular', () => {
    expect(unusedSentence(['nightlife'])).toBe(
      'Couldn’t use “nightlife” — the form has no input for it.',
    )
  })

  it('reads as one sentence, plural, with the fragments quoted in order', () => {
    expect(unusedSentence(['nightlife', 'Lisbon', 'nonstop only'])).toBe(
      'Couldn’t use “nightlife”, “Lisbon” or “nonstop only” — the form has no input for those.',
    )
  })

  it('does not repeat the design’s false claim about how ranking works', () => {
    // Design 1c state 6 reads "Ranking is by total trip cost only". The engine
    // scores headroom, weather and flight time (src/lib/ranking.js), so that
    // sentence would contradict the product it describes.
    expect(unusedSentence(['nightlife'])).not.toMatch(/total trip cost only/i)
  })
})

describe('party size', () => {
  it('spots the wordings the parser routes into `unused`', () => {
    for (const f of [
      'for the two of us',
      '2 of us',
      'four people',
      '3 adults',
      'with my partner',
      'the kids',
      'a group',
      '$2,000 each',
      'per person',
      'travelling with my wife',
    ]) {
      expect(looksLikeParty(f), f).toBe(true)
    }
  })

  it('does not read a duration as a headcount', () => {
    expect(looksLikeParty('a couple of weeks')).toBe(false)
    expect(looksLikeParty('nightlife')).toBe(false)
    expect(looksLikeParty('somewhere in Asia')).toBe(false)
  })

  it('promotes a party fragment out of the quiet line, so it is never said twice', () => {
    const { party, rest } = splitParty(['for the two of us', 'nightlife'])
    expect(party).toEqual(['for the two of us'])
    expect(rest).toEqual(['nightlife'])
  })

  it('discloses a party the model omitted from `unused`, from the raw sentence', () => {
    // Measured against the deployed endpoint: the model reports the party
    // wording in roughly 3 of 5 runs of an identical query. A disclosure resting
    // on that fragment alone would be missing about 40% of the time, leaving a
    // party budget filtered against a one-traveller total with nothing saying so.
    const dropped = parse({ budget: 5000, unused: ['nightlife'] })
    const q = '10 nights in March, nice hotel, $5000 for the two of us, great nightlife'
    expect(readParse(dropped).notes.party).toBeNull() // no query: fragment only
    expect(readParse(dropped, q).notes.party).toEqual(PARTY_NOTE)
    // The number itself is never touched — it is the traveller's own figure.
    expect(readParse(dropped, q).filters.budget).toBe(5000)
  })

  it('does not fire on a sentence with no party in it', () => {
    const q = 'a couple of weeks somewhere warm in February under $2,000'
    expect(readParse(parse(), q).notes.party).toBeNull()
  })

  it('states the cost model plainly — one traveller, party pricing not yet', () => {
    const read = readParse(parse({ unused: ['for the two of us'] }))
    expect(read.notes.party).toEqual(PARTY_NOTE)
    expect(`${PARTY_NOTE.lead} ${PARTY_NOTE.rest}`).toBe(
      'Costs shown are for one traveller. Party pricing is coming.',
    )
    // Promoted, so the quiet sentence has nothing left to carry.
    expect(read.notes.unused).toBeNull()
  })
})

describe('originFallbackNote', () => {
  it('is nothing when they flew from a city we support', () => {
    expect(originFallbackNote(parse())).toBeNull()
  })

  it('names the city they asked for and the city the numbers are actually from', () => {
    const n = originFallbackNote(parse({ originFallback: 'Vancouver' }))
    expect(`${n.lead} ${n.rest}`).toBe(
      'Departures from Vancouver are coming soon. For now, here’s what these trips cost from Toronto.',
    )
  })

  it('follows the origin the parse actually landed on', () => {
    expect(originFallbackNote(parse({ origin: 'YUL', originFallback: 'Halifax' })).rest).toMatch(
      /cost from Montreal\.$/,
    )
  })
})

describe('parseToFilters', () => {
  it('speaks the form’s vocabulary: lowercase origin value, month window value', () => {
    expect(parseToFilters(parse())).toEqual({
      origin: 'yyz',
      budget: 2000,
      nights: 7,
      month: MONTH,
      stay: 'mid',
    })
  })

  it('can never hand the form a value the form would reject', () => {
    const f = parseToFilters(parse({ origin: 'LHR', month: 'jan-1999', nights: 900, stay: 'palace' }))
    expect(ORIGIN_OPTIONS.some((o) => o.available && o.value === f.origin)).toBe(true)
    expect(MONTH_OPTIONS.some((m) => m.value === f.month)).toBe(true)
    expect(f.nights).toBeLessThanOrEqual(30)
    expect(STAY_OPTIONS.some((s) => s.value === f.stay)).toBe(true)
  })

  it('keeps an explicit "no limit" budget as null rather than zeroing it', () => {
    expect(parseToFilters(parse({ budget: null })).budget).toBeNull()
  })
})

describe('isParse', () => {
  it('rejects the endpoint’s error bodies, so an error never fills the form', () => {
    expect(isParse({ code: 'unavailable', error: 'Not available right now.' })).toBe(false)
    expect(isParse(null)).toBe(false)
    expect(isParse(parse())).toBe(true)
  })
})

describe('the curated examples', () => {
  it('each resolve to a month the form actually offers today', () => {
    for (const ex of ASK_EXAMPLES) {
      const p = resolveExample(ex)
      expect(MONTH_OPTIONS.some((m) => m.value === p.month), ex.query).toBe(true)
      // The window runs forward from this month, so the stored key must resolve
      // to the NEXT occurrence — never a month already gone.
      expect(p.month.slice(0, 3)).toBe(ex.parse.monthKey)
    }
  })

  it('never quietly ignore a word — every one of them has an empty `unused`', () => {
    // The rule for adding an example: every word must map to a form input. An
    // example that produced a "couldn't use" note on click would contradict the
    // honesty spine on first contact.
    for (const ex of ASK_EXAMPLES) {
      expect(readParse(resolveExample(ex)).notes.unused, ex.query).toBeNull()
    }
  })

  it('account for all five fields — nothing is both assumed and filled', () => {
    for (const ex of ASK_EXAMPLES) {
      const read = readParse(resolveExample(ex))
      expect([...read.assumed, ...read.filled].sort()).toEqual([...ASK_FIELDS].sort())
    }
  })

  it('all carry at least one assumption, so `filled` is never the whole form', () => {
    // Nothing renders this any more, but it is still what keeps the `.is-ai`
    // rings meaningful: a ring on every field would say nothing.
    for (const ex of ASK_EXAMPLES) {
      expect(readParse(resolveExample(ex)).assumed.length, ex.query).toBeGreaterThan(0)
    }
  })
})

describe('annotateQuery — the "Read as" sentence', () => {
  const Q = '10 cheap nights in March from Vancouver with great nightlife'

  it('rebuilds the traveller’s sentence exactly, whatever it marks', () => {
    const segs = annotateQuery(Q, parse({
      originFallback: 'Vancouver',
      unused: ['great nightlife'],
    }))
    expect(segs.map((x) => x.text).join('')).toBe(Q)
  })

  it('strikes the departure city and labels it, in place', () => {
    const segs = annotateQuery(Q, parse({ originFallback: 'Vancouver', unused: [] }))
    const dead = segs.filter((x) => x.dead)
    expect(dead).toEqual([{ text: 'Vancouver', dead: true, label: 'coming soon' }])
  })

  it('labels a party fragment for what it is, not "not ranked"', () => {
    // The trip is priced for one person — a different limitation from an ask
    // the form has no input for, so it must not borrow that label.
    const q = 'a week in May for the two of us'
    const segs = annotateQuery(q, parse({ unused: ['for the two of us'] }))
    expect(segs.find((x) => x.dead).label).toBe('priced for one')
  })

  it('never positively highlights a recognised word', () => {
    // /api/ask returns values, not offsets, so which words produced nights=10
    // could only be guessed. Nothing but a struck fragment is ever marked.
    const segs = annotateQuery(Q, parse({ nights: 10, unused: [] }))
    expect(segs.every((x) => x.dead || (!x.label && !x.tok))).toBe(true)
  })

  it('leaves a paraphrased fragment unmarked rather than guessing at it', () => {
    // The sentence underneath still discloses it — that is why both render.
    const segs = annotateQuery(Q, parse({ unused: ['partying and bars'] }))
    expect(segs.some((x) => x.dead)).toBe(false)
    expect(unusedSentence(['partying and bars'])).toContain('partying and bars')
  })

  it('never marks the same words twice when fragments overlap', () => {
    const q = 'great nightlife please'
    const segs = annotateQuery(q, parse({ unused: ['great nightlife', 'nightlife'] }))
    expect(segs.filter((x) => x.dead).length).toBe(1)
    expect(segs.map((x) => x.text).join('')).toBe(q)
  })

  it('is empty for an empty query rather than throwing', () => {
    expect(annotateQuery('', parse())).toEqual([])
  })
})

describe('originTag', () => {
  it('says the departure city was adjusted when we cannot fly from it', () => {
    expect(originTag(parse({ originFallback: 'Vancouver' }))).toBe('adjusted')
  })

  it('says nothing at all when the query never named a departure city', () => {
    // The "assumed · tap to change" tag was removed with the per-field ones.
    expect(originTag(parse({ assumed: ['origin'] }))).toBeNull()
  })

  it('never credits the traveller for an origin they did not name', () => {
    // The trap in returning null above: falling through to "from your words"
    // would claim they said Toronto when the form defaulted to it.
    expect(originTag(parse({ assumed: ['origin'] }))).not.toBe('from your words')
  })

  it('still says "adjusted" for an unsupported city, even unnamed elsewhere', () => {
    // The fallback outranks the assumed check — "adjusted" is half of the
    // origin-fallback disclosure and must survive it.
    expect(originTag(parse({ originFallback: 'Vancouver', assumed: ['origin'] }))).toBe(
      'adjusted',
    )
  })

  it('credits the traveller when it came from their own words', () => {
    expect(originTag(parse())).toBe('from your words')
  })
})

describe('copy honesty', () => {
  // Scout reads, fills and discloses. It does not rank, price, pick or
  // recommend — so no string this module can produce may claim it does.
  const FORBIDDEN =
    /\b(found|finds|picked|picks|chose|chooses|recommends?|suggests?|best|perfect|ideal|cheapest)\b/i

  it('never claims Scout did anything but read the query into the form', () => {
    const fallback = originFallbackNote(parse({ originFallback: 'Vancouver' }))
    const strings = [
      PARTY_NOTE.lead,
      PARTY_NOTE.rest,
      fallback.lead,
      fallback.rest,
      unusedSentence(['nightlife', 'Lisbon']),
      ...['from your words', 'adjusted'],
    ]
    for (const s of strings) expect(s, s).not.toMatch(FORBIDDEN)
  })

  it('discloses no assumption anywhere, on any field or on the origin row', () => {
    // The guard against the removed notes creeping back. Every string a reading
    // can produce is checked, for a parse where the form filled EVERY field.
    const read = readParse(parse({ assumed: [...ASK_FIELDS] }))
    const strings = [
      read.originTag,
      read.notes.unused,
      read.notes.origin?.lead,
      read.notes.origin?.rest,
      read.notes.party?.lead,
      read.notes.party?.rest,
    ].filter(Boolean)
    for (const s of strings) expect(s, s).not.toMatch(/assumed/i)
    // …and the reading carries no per-field copy to render in the first place.
    expect(read.fieldNotes).toBeUndefined()
    expect(read.originTag).toBeNull()
  })
})
