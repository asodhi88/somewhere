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

The feature is **"Ask somewhere"** in this document and in the code (`/api/ask`,
`askNotes.js`); the UI calls it **Scout**.

**Scout is a label, not a persona.** No avatar, no voice, no chat bubbles, no
conversation history, no follow-up turns. The name is on the entry button and the
panel header, and nowhere else. It does not change what shipped: Scout reads,
fills, and discloses.

The constraint the original wording was protecting still holds, and is now
enforced by a test (`src/lib/askNotes.test.js`, "copy honesty"): **no UI copy may
say Scout found, picked, priced, recommended or chose anything**, because it does
none of those. A name that implies conversational capability would be the failure
here — a name alone is not.

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
| `stay` | Stay tier — `budget` / `mid` / `nice`, the form's own values |
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

## PR 2 — UI — **SHIPPED** (#43)

Implements the Ask somewhere design, card **1c "Show the reading"** (plus **1d**,
the same flow in the day ambient). Read directly from the Claude Design project
via DesignSync rather than a `handoff/` bundle — see auto-memory
`raccoon-design-source` for the project id and the `/design-login` requirement.

**What shipped, in shape:** a quiet `ask Scout` button at the end of the
"Leaving from" row opens a query panel **inside the search widget's own shell**,
in place of the field grid. The form is never unmounted while the panel is open,
so a half-typed budget survives a trip through Scout. On success the panel closes
and a **"Read as"** card stands above the filled form, doubling as the way back
in (tap to edit, ✕ to clear).

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

**Shipped set** (`src/lib/askExamples.js`). Each was run through the live parser
three times and produced the stored parse every time, with an empty `unused`:

- "February 1 week under $2,000"
- "7 nights in March from Toronto"
- "Long weekend in Oct, $1,500 all in"

All three produce exactly **two** assumed fields, which is why two assumption
tags is the layout's default case rather than an edge case.

The month is stored as a 3-letter key and resolved against the rolling 13-month
window at click time — storing `feb-2027` would go stale and eventually fall out
of the window.

### Copy-honesty check

Required before merge, per standard PR discipline. Confirm no UI copy implies the AI ranks, prices, or recommends.

Now also enforced by a test — `src/lib/askNotes.test.js`, "copy honesty" — so it
cannot rot silently between passes.

### Departures from the design, and why

1. **"Read as" strikes through only words the model actually quoted.** It never
   highlights the words it thinks produced a value. `/api/ask` returns values,
   not character offsets, so "which words gave nights=10" could only be a guess,
   and a guess that moved between identical queries is the same instability that
   keeps `unused` a sentence rather than chips. `unused` fragments and
   `originFallback` ARE verbatim quotes by construction, so those are located
   exactly. The sentence renders underneath as well, so a fragment the model
   paraphrased instead of quoting is still disclosed.
2. **The design's "Ranking is by total trip cost only" was not shipped — it is
   false.** The engine scores headroom, weather and flight time
   (`src/lib/ranking.js`), and the How-it-works page prints that formula. The
   note reads "the form has no input for it" instead, which is the real limit.
3. **Every assumed field carries a tag.** The design has no assumed state at all
   (`.is-assumed` and `.rc-field__tag` exist in its CSS but appear in zero
   markup) and leaves budget blank and unnoted in its own Filled example. A
   silently filled default is the one failure this feature exists to prevent.

Party size has no treatment in the design either; it reuses the banner at
origin-fallback prominence. Mobile was never drawn — the design doc lists
"mobile version of 1c" as its own next step — so the phone keeps the sentence
composer and borrows 1c's behaviour, not its layout.

Assumption tags retire once a search has actually run: they prompt a correction
*before* searching, and nag after it. A new reading brings them back.

### Explicitly out of scope for PR 2

- Generated explanations or "why these picks" prose — an AI-written rationale could contradict the underlying data and break the copy-never-contradicts-data rule
- Chat follow-ups or multi-turn refinement
- Any new ranking signal
- New origins. The origin fallback is a message, not a data change; multi-origin flight data remains a separate backlog item
- How It Works page copy — parked pending the planned rebuild of that page

---

## Open items

- ~~Icon design~~ — **resolved.** The design's own mark: two lines of text, a
  chevron, one filled cell — "words go in, a field comes out". Not an AI sparkle.
  `src/components/ScoutIcon.jsx`.
- How It Works needs a line stating the AI only reads queries into the form.
  Deferred to the How It Works rebuild.

## Follow-ups from shipping

- **A dedicated `party` field in the PR 1 tool schema.** Measured against the
  deployed endpoint: for an IDENTICAL query, the model put the party wording in
  `unused` in only **3 of 5 runs**. The budget was right every time — it never
  divides it — but the note saying the figure is measured against a
  ONE-TRAVELLER total went missing about 40% of the time. PR 2 works around it by
  also reading the raw query text, which is safe (the note is true in every case,
  so a false positive is merely redundant) but is a heuristic. A named field the
  model cannot forget to fill, derived the way `assumed` already is, is the real
  answer.
- **Reverse-sync the design** to match shipped code, per CLAUDE.md §12 step 6 —
  the three departures above, plus the assumed state the design lacks.
- **The desktop search bar truncates its values between 720px and ~1000px**
  ("June 2027" renders as "June …"). Pre-existing, unrelated to Scout: the field
  flex ratios are tuned for the ~980-1040px design width, and below that the four
  fields split whatever the submit button leaves.
