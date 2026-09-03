import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildFlightSearchUrl, resolveSearchMonth } from './links'

const NOW = new Date(2026, 8, 2) // Sept 2, 2026 — matches the app's "today"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildFlightSearchUrl', () => {
  it('builds the correct URL for a standard case (YYZ → NRT, November, 7 nights)', () => {
    const url = buildFlightSearchUrl({
      originIata: 'YYZ',
      destinationIata: 'NRT',
      month: 'nov-2026',
      nights: 7,
    })
    const params = new URL(url).searchParams
    expect(url.startsWith('https://skyscanner.net/g/referrals/v1/flights/calendar-month-view/')).toBe(true)
    expect(params.get('origin')).toBe('YYZ')
    expect(params.get('destination')).toBe('NRT')
    expect(params.get('oym')).toBe('2026-11')
    expect(params.get('iym')).toBe('2026-11')
    expect(params.get('rtn')).toBe('1')
    expect(params.get('currency')).toBe('CAD')
    expect(params.get('market')).toBe('CA')
    expect(params.get('locale')).toBe('en-CA')
  })

  it('rolls iym to the following month when nights > 21', () => {
    const url = buildFlightSearchUrl({
      originIata: 'YYZ',
      destinationIata: 'LIS',
      month: 'nov-2026',
      nights: 22,
    })
    const params = new URL(url).searchParams
    expect(params.get('oym')).toBe('2026-11')
    expect(params.get('iym')).toBe('2026-12')
  })

  it('keeps iym equal to oym at exactly 21 nights', () => {
    const url = buildFlightSearchUrl({
      originIata: 'YYZ',
      destinationIata: 'LIS',
      month: 'nov-2026',
      nights: 21,
    })
    const params = new URL(url).searchParams
    expect(params.get('oym')).toBe(params.get('iym'))
  })

  it('rolls iym across a year boundary when nights > 21', () => {
    const url = buildFlightSearchUrl({
      originIata: 'YYZ',
      destinationIata: 'LIS',
      month: 'dec-2026',
      nights: 30,
    })
    const params = new URL(url).searchParams
    expect(params.get('oym')).toBe('2026-12')
    expect(params.get('iym')).toBe('2027-01')
  })

  it('omits mediaPartnerId when the env var is unset', () => {
    vi.stubEnv('VITE_SKYSCANNER_PARTNER_ID', '')
    const url = buildFlightSearchUrl({
      originIata: 'YYZ',
      destinationIata: 'NRT',
      month: 'nov-2026',
      nights: 7,
    })
    expect(url).not.toContain('mediaPartnerId')
  })

  it('includes mediaPartnerId when the env var is set', () => {
    vi.stubEnv('VITE_SKYSCANNER_PARTNER_ID', 'abc123')
    const url = buildFlightSearchUrl({
      originIata: 'YYZ',
      destinationIata: 'NRT',
      month: 'nov-2026',
      nights: 7,
    })
    expect(new URL(url).searchParams.get('mediaPartnerId')).toBe('abc123')
  })

  it('returns null on missing origin IATA', () => {
    expect(
      buildFlightSearchUrl({ originIata: '', destinationIata: 'NRT', month: 'nov-2026', nights: 7 }),
    ).toBeNull()
  })

  it('returns null on missing destination IATA', () => {
    expect(
      buildFlightSearchUrl({ originIata: 'YYZ', destinationIata: '', month: 'nov-2026', nights: 7 }),
    ).toBeNull()
  })

  it('returns null when the month cannot be resolved', () => {
    expect(
      buildFlightSearchUrl({ originIata: 'YYZ', destinationIata: 'NRT', month: '', nights: 7 }),
    ).toBeNull()
  })
})

describe('resolveSearchMonth', () => {
  it('resolves a year-qualified value to YYYY-MM', () => {
    expect(resolveSearchMonth('nov-2026', NOW)).toBe('2026-11')
  })

  it('resolves the current month to the current year', () => {
    expect(resolveSearchMonth('sep-2026', NOW)).toBe('2026-09')
    expect(resolveSearchMonth('sep', NOW)).toBe('2026-09')
  })

  it('rolls a bare month key to next year when that month has passed', () => {
    // "today" is Sept 2026; March has already happened this year.
    expect(resolveSearchMonth('mar', NOW)).toBe('2027-03')
  })

  it('rolls a bare month key to next year when it is later this year', () => {
    expect(resolveSearchMonth('nov', NOW)).toBe('2026-11')
  })

  it('returns null beyond the 12-month window', () => {
    expect(resolveSearchMonth('oct-2027', NOW)).toBeNull()
  })

  it('accepts exactly 12 months ahead', () => {
    expect(resolveSearchMonth('sep-2027', NOW)).toBe('2027-09')
  })

  it('never emits a month in the past for a stale year', () => {
    expect(resolveSearchMonth('jan-2020', NOW)).toBe('2027-01')
  })

  it('returns null for an unrecognized month key', () => {
    expect(resolveSearchMonth('xyz', NOW)).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(resolveSearchMonth('', NOW)).toBeNull()
    expect(resolveSearchMonth(null, NOW)).toBeNull()
  })
})
