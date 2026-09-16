/**
 * rateLimit.test.js — the per-IP counters behind /api/ask.
 *
 * The store is stubbed (global.fetch), so these run offline. What matters here
 * is the fail-closed behaviour: a missing or broken store must refuse requests,
 * never wave them through — /api/ask is the one endpoint in this project that
 * spends money per call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRateLimit, clientIp, PER_DAY, PER_MINUTE } from './rateLimit.js'

const ENV = { ...process.env }

/** Stub the Upstash pipeline reply: [INCR m, EXPIRE, INCR d, EXPIRE]. */
const stubCounts = (minute, day) =>
  vi.fn(async () => ({
    ok: true,
    json: async () => [{ result: minute }, { result: 1 }, { result: day }, { result: 1 }],
  }))

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  delete process.env.ASK_RATE_LIMIT
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.env = { ...ENV }
  vi.restoreAllMocks()
})

describe('clientIp', () => {
  it('takes the client from the front of the x-forwarded-for chain', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } })).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip, then to a shared bucket', () => {
    expect(clientIp({ headers: { 'x-real-ip': '203.0.113.9' } })).toBe('203.0.113.9')
    expect(clientIp({ headers: {} })).toBe('unknown')
  })
})

describe('checkRateLimit', () => {
  it('allows a request inside both windows', async () => {
    global.fetch = stubCounts(3, 12)
    await expect(checkRateLimit('1.2.3.4')).resolves.toMatchObject({ ok: true })
  })

  it('allows exactly the limit and refuses the next one', async () => {
    global.fetch = stubCounts(PER_MINUTE, 20)
    await expect(checkRateLimit('1.2.3.4')).resolves.toMatchObject({ ok: true })

    global.fetch = stubCounts(PER_MINUTE + 1, 20)
    const blocked = await checkRateLimit('1.2.3.4')
    expect(blocked).toMatchObject({ ok: false, reason: 'minute' })
    expect(blocked.retryAfter).toBeGreaterThan(0)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  it('refuses on the daily window too', async () => {
    global.fetch = stubCounts(1, PER_DAY + 1)
    const blocked = await checkRateLimit('1.2.3.4')
    expect(blocked).toMatchObject({ ok: false, reason: 'day' })
    expect(blocked.retryAfter).toBeGreaterThan(0)
  })

  it('counts each IP separately', async () => {
    const calls = []
    global.fetch = vi.fn(async (_url, init) => {
      calls.push(JSON.parse(init.body)[0][1])
      return { ok: true, json: async () => [{ result: 1 }, {}, { result: 1 }, {}] }
    })
    await checkRateLimit('1.2.3.4')
    await checkRateLimit('5.6.7.8')
    expect(calls[0]).not.toBe(calls[1])
  })

  it('hashes the IP rather than storing it', async () => {
    let key = ''
    global.fetch = vi.fn(async (_url, init) => {
      key = JSON.parse(init.body)[0][1]
      return { ok: true, json: async () => [{ result: 1 }, {}, { result: 1 }, {}] }
    })
    await checkRateLimit('203.0.113.7')
    expect(key).not.toContain('203.0.113.7')
    expect(key).toMatch(/^ask:m:[0-9a-f]{16}:\d+$/)
  })

  it('fails closed when the store is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    global.fetch = vi.fn()
    await expect(checkRateLimit('1.2.3.4')).resolves.toMatchObject({
      ok: false,
      reason: 'unavailable',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fails closed when the store errors or answers oddly', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    await expect(checkRateLimit('1.2.3.4')).resolves.toMatchObject({ reason: 'unavailable' })

    global.fetch = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(checkRateLimit('1.2.3.4')).resolves.toMatchObject({ reason: 'unavailable' })

    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ oops: true }) }))
    await expect(checkRateLimit('1.2.3.4')).resolves.toMatchObject({ reason: 'unavailable' })
  })

  it('only skips the store when explicitly switched off for local dev', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    process.env.ASK_RATE_LIMIT = 'off'
    global.fetch = vi.fn()
    await expect(checkRateLimit('1.2.3.4')).resolves.toEqual({ ok: true })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
