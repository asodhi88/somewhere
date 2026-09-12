# Ask somewhere — AI query parsing

## Summary

A natural-language query box that sits **alongside** the existing search form as an alternate entry point. The user describes a trip in their own words; an LLM reads the query and fills in the existing form fields. The ranking engine is unchanged.

**The AI translates words into form inputs. It does not set prices, produce rankings, or generate prose.**

This is the first backend component in the project.

## Principles this feature must hold

- The AI is a translator, not an oracle. Every value it produces is a form input the user can see and change.
- Assumptions are disclosed, never silent.
- Anything the engine cannot rank on is named plainly rather than quietly dropped.
- The form remains fully usable if the AI is unavailable.
- Copy must not imply the AI is choosing destinations or knows more than the dataset.

## Naming

No persona. The feature is called **"Ask somewhere."** No avatar, no chat bubbles, no conversation history, no follow-up turns. A named assistant would imply conversational capability that is explicitly out of scope.

---

## PR 1 — Backend parser

### Endpoint

Vercel serverless function. The API key lives server-side and never reaches the browser.

- Model: `claude-haiku-4-5`
- API: Anthropic Messages API, tool use with a strict input schema so output always matches the form's shape
- `max_tokens` kept small — this is extraction, not generation

### Output schema

Fields correspond exactly to the existing form inputs:

| Field | Notes |
|---|---|
| `origin` | YYZ or YUL only |
| `month` | |
| `nights` | |
| `budget` | Total trip budget |
| `assumed` | Array of field names the model filled without support from the query |
| `unused` | Array of query fragments that could not be mapped to any input |
| `originFallback` | Set when the user named an unsupported departure city; carries the requested city name |

`assumed` and `unused` give the model a legitimate place to put what it cannot map, which reduces its tendency to force a fit.

### Limits

Three layers:

1. **Anthropic side** — monthly spend cap set in the Console as the hard backstop.
2. **Per IP** — approximately 10/minute, 50/day. Requires a persistent store (Upstash Redis or equivalent); in-memory counters do not survive serverless invocations.
3. **Per request** — query length capped at ~200 characters; small `max_tokens`.

### Test set

Approximately 20 sample queries with expected parses, covering:

- Fully specified queries
- Queries missing one or more fields (exercises `assumed`)
- Unsupported departure cities (exercises `originFallback`)
- Unrankable asks such as nightlife, safety, romance (exercises `unused`)
- Destinations outside the 37-city dataset
- Nonsense and empty input
- Queries at and beyond the character cap

Parse quality is validated against this set **before** PR 2 begins.

### Explicitly out of scope for PR 1

Any UI. No query box, no form wiring, no copy changes.

---

## PR 2 — UI

Implements the final Claude Design output. The design handoff bundle is extracted to `handoff/<bundle-name>/` (gitignored) per the standard workflow.

### Scope

- Query box with placeholder, positioned alongside the existing form
- Curated example searches shown when the box is empty
- Form prefill with a brief highlight on AI-set fields
- Inline assumption notes on individual fields (e.g. "7 nights · assumed, tap to change") rather than a banner, so the note sits where the correction happens
- Origin fallback note — prominent, since a traveler from an unsupported city faces materially different real costs
- "Couldn't use" note listing unrankable fragments
- Failure note; form stays usable

### Curated examples

Every example must be **fully answerable by the engine**. An example that triggers a "couldn't use" note on click would contradict the honesty spine on first contact.

Because examples are curated, their parses are stored up front. Clicking one fills the form instantly — no API call, no cost, no chance of a bad parse. The AI runs only for free-typed queries.

Starting set (to be finalized against the design):

- "Warm beach week in February under $2,000"
- "10 cheap nights in March from Montreal"
- "Long weekend in May, $1,200 all in"

### Copy-honesty check

Required before merge, per standard PR discipline. Confirm no UI copy implies the AI ranks, prices, or recommends.

### Explicitly out of scope for PR 2

- Generated explanations or "why these picks" prose — an AI-written rationale could contradict the underlying data and break the copy-never-contradicts-data rule
- Chat follow-ups or multi-turn refinement
- Any new ranking signal
- New origins. The origin fallback is a message, not a data change; multi-origin flight data remains a separate backlog item
- How It Works page copy — parked pending the planned rebuild of that page

---

## Open items

- Icon design — drawn from the app's own visual language rather than the generic AI sparkle. Resolved in Claude Design before PR 2.
- How It Works needs a line stating the AI only reads queries into the form. Deferred to the How It Works rebuild.
