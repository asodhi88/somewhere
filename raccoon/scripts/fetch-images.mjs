/**
 * scripts/fetch-images.mjs — ONE-OFF: populate hero_image in
 * src/data/destinations.json from the Unsplash API.
 *
 * Run this manually. The app must NEVER call Unsplash at runtime: the free tier
 * is 50 requests/hour, so per-visitor fetching would break the site instantly
 * (CLAUDE.md §5, §7). This bakes the chosen image URLs into the JSON once; the
 * app then just hotlinks the baked urls.regular from Unsplash's CDN.
 *
 * Per destination it searches Unsplash by the record's `photo_query`, takes the
 * top landscape result, triggers that photo's download_location (required by the
 * Unsplash API guidelines whenever a photo is "used"), and writes:
 *   hero_image: { url, photographer, profile_url, download_location }
 *
 * Resumable: any record that already has hero_image is skipped, and each success
 * is written to disk immediately — so a run stopped by the hourly rate limit can
 * be re-run safely to pick up where it left off.
 *
 * Auth: `Authorization: Client-ID <key>` with the key read from
 * UNSPLASH_ACCESS_KEY in a local .env (gitignored — never committed).
 *
 * Usage:
 *   1. cp .env.example .env   and paste your Unsplash Access Key into it
 *   2. node scripts/fetch-images.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_PATH = path.join(ROOT, 'src', 'data', 'destinations.json')
const ENV_PATH = path.join(ROOT, '.env')

const API = 'https://api.unsplash.com'
const DELAY_MS = Number(process.env.FETCH_DELAY_MS) || 1500 // between requests
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── minimal .env loader (no dependency) ─────────────────────────────────────
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
loadEnv(ENV_PATH)

const KEY = process.env.UNSPLASH_ACCESS_KEY
if (!KEY) {
  console.error('✗ UNSPLASH_ACCESS_KEY is not set.')
  console.error('  Create raccoon/.env (copy .env.example) and add your Unsplash Access Key.')
  process.exit(1)
}

const headers = { Authorization: `Client-ID ${KEY}`, 'Accept-Version': 'v1' }

// 403 from Unsplash means the hourly rate limit is exhausted — a normal stop
// point for this script, distinct from a real error.
class RateLimited extends Error {}

async function unsplash(url) {
  const res = await fetch(url, { headers })
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (res.status === 401) throw new Error('Unsplash rejected the key (401) — check UNSPLASH_ACCESS_KEY.')
  if (res.status === 403) throw new RateLimited(`rate limit reached (remaining ${remaining ?? '0'})`)
  if (!res.ok) throw new Error(`Unsplash ${res.status} ${res.statusText}`)
  return { json: await res.json(), remaining }
}

async function topLandscape(query) {
  const url = new URL(API + '/search/photos')
  url.searchParams.set('query', query)
  url.searchParams.set('orientation', 'landscape')
  url.searchParams.set('per_page', '1')
  url.searchParams.set('content_filter', 'high')
  const { json, remaining } = await unsplash(url)
  return { photo: json.results?.[0] || null, remaining }
}

// Unsplash guideline: register a download whenever a photo is used.
async function triggerDownload(downloadLocation) {
  await unsplash(downloadLocation)
}

// ── formatting-preserving write, located by record id ───────────────────────
// Rewriting the whole file with JSON.stringify would reflow the dataset's
// hand-tuned layout, so instead we replace just the `"hero_image": null` inside
// the target record's span with a compact one-line object. Locating by id keeps
// this correct even when some records are skipped (no query / no result).
const compact = (o) =>
  `{ "url": ${JSON.stringify(o.url)}, "photographer": ${JSON.stringify(o.photographer)}, ` +
  `"profile_url": ${JSON.stringify(o.profile_url)}, "download_location": ${JSON.stringify(o.download_location)} }`

function writeHeroImage(text, id, obj) {
  const marker = `"id": ${JSON.stringify(id)}`
  const start = text.indexOf(marker)
  if (start === -1) throw new Error(`record id ${id} not found in JSON`)
  const nextId = text.indexOf('"id":', start + marker.length)
  const end = nextId === -1 ? text.length : nextId
  const replaced = text
    .slice(start, end)
    .replace(/"hero_image":\s*null/, `"hero_image": ${compact(obj)}`)
  return text.slice(0, start) + replaced + text.slice(end)
}

async function main() {
  let text = fs.readFileSync(DATA_PATH, 'utf8')
  const destinations = JSON.parse(text)

  const pending = destinations.filter((d) => !d.hero_image)
  console.log(
    `${destinations.length} destinations · ${destinations.length - pending.length} already have images · ` +
      `${pending.length} to fetch\n`,
  )

  let fetched = 0
  let missingQuery = 0
  let noResults = 0

  for (const d of destinations) {
    if (d.hero_image) continue // resumable: never re-fetch a populated record
    if (!d.photo_query) {
      console.warn(`- ${d.id} (${d.city}): no photo_query — skipping`)
      missingQuery++
      continue
    }

    try {
      console.log(`… ${d.id} (${d.city}) — "${d.photo_query}"`)
      const { photo, remaining } = await topLandscape(d.photo_query)
      await sleep(DELAY_MS)
      if (!photo) {
        console.warn(`  ! no landscape result for "${d.photo_query}"`)
        noResults++
        continue
      }

      // Trigger the download BEFORE committing: if we can't honour the guideline
      // (e.g. rate limit hits here), leave the record unset so the next run
      // retries both the search and the trigger together.
      await triggerDownload(photo.links.download_location)
      await sleep(DELAY_MS)

      const hero = {
        url: photo.urls.regular,
        photographer: photo.user.name,
        profile_url: photo.user.links.html,
        download_location: photo.links.download_location,
      }
      text = writeHeroImage(text, d.id, hero)
      fs.writeFileSync(DATA_PATH, text)
      d.hero_image = hero
      fetched++
      console.log(`  ✓ ${hero.photographer} · ${hero.url}  (rate limit left: ${remaining ?? '?'})`)
    } catch (err) {
      if (err instanceof RateLimited) {
        console.warn(`\n■ Unsplash ${err.message}. Progress saved — re-run in ~an hour to continue.`)
        break
      }
      console.error(`  ✗ ${d.id}: ${err.message}`)
    }
  }

  const stillPending = destinations.filter((d) => !d.hero_image && d.photo_query).length
  console.log(
    `\nDone this run: ${fetched} fetched · ${missingQuery} missing photo_query · ` +
      `${noResults} no results · ${stillPending} still pending`,
  )
  if (stillPending > 0) console.log('Re-run the script to continue where it left off.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
