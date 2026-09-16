import { describe, it, expect } from 'vitest'
import {
  ASK_FIELDS,
  PARTY_NOTE,
  assumptionNote,
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

describe('assumptionNote', () => {
  it('names the value as the form shows it, not the stored value', () => {
    // The form stores `mid` and labels it "Mid-range"; a note that said "mid"
    // would not match the control it sits under.
    expect(assumptionNote('stay', parse())).toBe('Mid-range · assumed, tap to change')
  })

  it('reads origin as a city, not an airport code', () => {
    expect(assumptionNote('origin', parse())).toBe('Toronto · assumed, tap to change')
  })

  it('singularises one night', () => {
    expect(assumptionNote('nights', parse({ nights: 1 }))).toMatch(/^1 night · /)
    expect(assumptionNote('nights', parse({ nights: 3 }))).toMatch(/^3 nights · /)
  })

  it('formats budget with a thousands separator, and no limit as words', () => {
    expect(assumptionNote('budget', parse({ budget: 2000 }))).toMatch(/^\$2,000 · /)
    expect(assumptionNote('budget', parse({ budget: null }))).toMatch(/^No limit · /)
  })
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
      'Scout couldn’t fit “nightlife” into the form — there’s no input for that, so it isn’t part of this search.',
    )
  })

  it('reads as one sentence, plural, with the fragments quoted in order', () => {
    expect(unusedSentence(['nightlife', 'Lisbon', 'nonstop only'])).toBe(
      'Scout couldn’t fit “nightlife”, “Lisbon” or “nonstop only” into the form — there’s no input for those, so they aren’t part of this search.',
    )
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

  it('states the cost model plainly — one traveller, party pricing not yet', () => {
    const read = readParse(parse({ unused: ['for the two of us'] }))
    expect(read.notes.party).toBe(PARTY_NOTE)
    // Promoted, so the quiet sentence has nothing left to carry.
    expect(read.notes.unused).toBeNull()
  })
})

describe('originFallbackNote', () => {
  it('is nothing when they flew from a city we support', () => {
    expect(originFallbackNote(parse())).toBeNull()
  })

  it('names the city they asked for and the city the numbers are actually from', () => {
    expect(originFallbackNote(parse({ originFallback: 'Vancouver' }))).toBe(
      'Departures from Vancouver are coming soon. For now, here’s what these trips cost from Toronto.',
    )
  })

  it('follows the origin the parse actually landed on', () => {
    expect(originFallbackNote(parse({ origin: 'YUL', originFallback: 'Halifax' }))).toMatch(
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

  it('all carry at least one assumption, so two notes is the normal layout', () => {
    for (const ex of ASK_EXAMPLES) {
      expect(readParse(resolveExample(ex)).assumed.length, ex.query).toBeGreaterThan(0)
    }
  })
})

describe('copy honesty', () => {
  // Scout reads, fills and discloses. It does not rank, price, pick or
  // recommend — so no string this module can produce may claim it does.
  const FORBIDDEN =
    /\b(found|finds|picked|picks|chose|chooses|recommends?|suggests?|best|perfect|ideal|cheapest)\b/i

  it('never claims Scout did anything but read the query into the form', () => {
    const strings = [
      PARTY_NOTE,
      originFallbackNote(parse({ originFallback: 'Vancouver' })),
      unusedSentence(['nightlife', 'Lisbon']),
      ...ASK_FIELDS.map((f) => assumptionNote(f, parse())),
    ]
    for (const s of strings) expect(s, s).not.toMatch(FORBIDDEN)
  })
})
