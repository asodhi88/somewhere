/**
 * ask-parse-check.mjs — read the "Ask somewhere" parse quality by eye.
 *
 * Runs every fixture in api/_lib/askFixtures.js through the real parser and
 * prints the actual parse beside the expected one, so a human can judge whether
 * the translation is right before any UI is built on it (PR 1 exit criteria).
 *
 * The vitest file (api/_lib/askParse.test.js) is the pass/fail gate; this is the
 * readable report.
 *
 * Usage:
 *   node scripts/ask-parse-check.mjs                  # every fixture
 *   node scripts/ask-parse-check.mjs --ids nonsense,cap-at-200
 *   node scripts/ask-parse-check.mjs --json out.json  # also write raw parses
 *
 * Needs ANTHROPIC_API_KEY in the environment or in raccoon/.env. It calls the
 * API directly and does not go through the endpoint, so no rate-limit store is
 * involved. ~25 calls on claude-haiku-4-5 — well under a cent.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── minimal .env loader (no dependency) — same as fetch-images.mjs ──────────
function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    let val = m[2]
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val
  }
}
loadEnv(path.join(ROOT, '.env'))

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('✗ ANTHROPIC_API_KEY is not set.')
  console.error('  Add it to raccoon/.env (copy .env.example) or export it, then re-run.')
  process.exit(1)
}

const { FIXTURES, FIXTURE_NOW } = await import('../api/_lib/askFixtures.js')
const { parseQuery } = await import('../api/_lib/parseQuery.js')

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const argOf = (flag) => {
  const i = argv.indexOf(flag)
  return i === -1 ? null : argv[i + 1]
}
const only = argOf('--ids')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const jsonOut = argOf('--json')
const cases = only ? FIXTURES.filter((f) => only.includes(f.id)) : FIXTURES

// ── formatting ─────────────────────────────────────────────────────────────
const money = (n) => `$${Number(n).toLocaleString('en-CA')}`
const list = (a) => (a?.length ? a.join(' / ') : '—')

const line = (p) =>
  [
    p.origin,
    p.month,
    `${p.nights}n`,
    money(p.budget),
    `assumed: ${list(p.assumed)}`,
    `unused: ${list(p.unused)}`,
    `fallback: ${p.originFallback || '—'}`,
  ].join(' · ')

/** The expected side, rendered the same way — regexes shown as patterns. */
const expectedLine = (e) =>
  [
    e.origin,
    e.month,
    `${e.nights}n`,
    money(e.budget),
    `assumed: ${list(e.assumed)}`,
    `unused: ${e.unused?.length ? e.unused.map(String).join(' / ') : '—'}`,
    `fallback: ${e.originFallback ? String(e.originFallback) : '—'}`,
  ].join(' · ')

/** Field-by-field comparison; returns the names that differ. */
function diff(actual, expected) {
  const bad = []
  for (const k of ['origin', 'month', 'nights', 'budget']) {
    if (actual[k] !== expected[k]) bad.push(k)
  }
  if (actual.assumed.join(',') !== expected.assumed.join(',')) bad.push('assumed')

  if (expected.originFallback instanceof RegExp) {
    if (!actual.originFallback || !expected.originFallback.test(actual.originFallback)) {
      bad.push('originFallback')
    }
  } else if (actual.originFallback) {
    bad.push('originFallback')
  }

  if (!expected.unused?.length) {
    if (actual.unused.length) bad.push('unused')
  } else {
    const missed = expected.unused.filter((p) => !actual.unused.some((u) => p.test(u)))
    if (missed.length) bad.push(`unused (no match for ${missed.map(String).join(', ')})`)
  }
  return bad
}

// ── run ────────────────────────────────────────────────────────────────────
const results = []
let pass = 0
let inTok = 0
let outTok = 0
let category = null

console.log(`\nAsk somewhere — parse check · ${cases.length} queries · claude-haiku-4-5`)
console.log(`Clock pinned to ${FIXTURE_NOW.toISOString().slice(0, 10)}\n`)

for (const [i, f] of cases.entries()) {
  if (f.category !== category) {
    category = f.category
    console.log(`\n── ${category} ${'─'.repeat(Math.max(0, 58 - category.length))}`)
  }

  const n = String(i + 1).padStart(2, ' ')
  console.log(`\n[${n}] ${f.id}`)
  console.log(`     query     "${f.query}"${f.query.length >= 180 ? ` (${f.query.length} chars)` : ''}`)

  if (f.expectError) {
    let code = null
    try {
      await parseQuery(f.query, { now: FIXTURE_NOW })
    } catch (err) {
      code = err.code || err.name
    }
    const ok = code === f.expectError
    console.log(`     expected  rejected: ${f.expectError} (no API call)`)
    console.log(`     actual    ${code ? `rejected: ${code}` : 'PARSED — the cap did not hold'}`)
    console.log(`     ${ok ? '✓ match' : '✗ MISMATCH'}`)
    if (ok) pass++
    results.push({ id: f.id, ok, expectError: f.expectError, actualError: code })
    continue
  }

  let parse
  let usage
  try {
    ;({ parse, usage } = await parseQuery(f.query, { now: FIXTURE_NOW }))
  } catch (err) {
    console.log(`     expected  ${expectedLine(f.expect)}`)
    console.log(`     actual    ERROR ${err.code || ''} ${err.message}`)
    console.log('     ✗ MISMATCH')
    results.push({ id: f.id, ok: false, error: err.message })
    continue
  }

  inTok += usage.input_tokens || 0
  outTok += usage.output_tokens || 0

  const bad = diff(parse, f.expect)
  if (!bad.length) pass++
  results.push({ id: f.id, ok: !bad.length, diff: bad, parse })

  console.log(`     expected  ${expectedLine(f.expect)}`)
  console.log(`     actual    ${line(parse)}`)
  console.log(bad.length ? `     ✗ differs on: ${bad.join(', ')}` : '     ✓ match')
}

// ── summary ────────────────────────────────────────────────────────────────
const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5 // claude-haiku-4-5: $1 / $5 per MTok
console.log(`\n${'─'.repeat(64)}`)
console.log(`${pass}/${cases.length} matched`)
if (pass < cases.length) {
  console.log('\nDiffers:')
  for (const r of results.filter((r) => !r.ok)) {
    console.log(`  ${r.id} — ${r.diff?.join(', ') || r.error || 'see above'}`)
  }
}
console.log(`\ntokens: ${inTok} in / ${outTok} out · ≈ $${cost.toFixed(4)}\n`)

if (jsonOut) {
  fs.writeFileSync(path.resolve(ROOT, jsonOut), JSON.stringify(results, null, 2))
  console.log(`wrote ${jsonOut}\n`)
}
