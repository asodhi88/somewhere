# Task: Neighbourhood Guidance — Content Pass

**Depends on:** PR #37 (merged). Schema is frozen. This spec adds **data only** — no mechanism changes. If something here seems to require a code change, stop and flag it rather than changing the mechanism.

## What this is

37 cities currently render neighbourhood guidance for three. This pass fills in the rest. The output is entries in `src/data/neighbourhoods.json` plus city boxes in `tiles/cities.geojson` and one tile re-cut at the end.

## The standard (read before writing anything)

Every line is a **disclosed editorial judgment**, and the feature's credibility rests on each one reflecting a judgment actually formed. Rushed generic copy across 37 cities is how this becomes filler and quietly discredits the cost estimates it sits beside.

The test for any entry: **would someone who knows this city nod, or wince?** If you can't form a real view on a city, that city is minimal-tier or none — not a full-tier entry with vague copy.

Hard constraints, unchanged from the mechanism spec:
- No safety or risk language. No "caution after dark", "sketchy", "avoid". Describe **transport need, never area risk.**
- No percentages, no precise walk or ride times. Qualitative bands only.
- `skipIf` entries are **dealbreakers, not drawbacks** — and they point at *friction the traveller experiences*, never at the neighbourhood's character or the people in it.
- Colour encodes price lean and nothing else.

## Step 1 — Tier triage (do this first, all 37 at once)

Before writing any entries, assign every city a tier. This is one sitting and it determines the real size of the job — it may turn 37 cities of work into 25.

- **full** — a genuine multi-area story: where you stay materially changes the trip. 4–5 areas. May optionally be district-layered (like LA) where the city is large enough that districts → neighbourhoods is the honest read.
- **minimal** — the honest answer is "one core, stay there." One editorial `note`, optionally 1–2 areas. Costs one sentence, not five entries.
- **none** — no meaningful areas story. Module doesn't render.

Record the triage in the PR description. Being honest here is itself an honesty feature: forcing five areas onto a one-core town is manufacturing content.

## Step 2 — Per-city entry

For each **full-tier** city:

1. **Name the 4–5 areas** that materially change the trip — not geographic completeness. The test: "these are the areas a traveller actually needs to understand before choosing."
2. **Polygons**, ~20 points each, following real features (coastline, rivers, major arterials). Deliberate approximations, not surveyed boundaries. Adjacent areas share boundary lines so they abut cleanly rather than overlapping.
3. **`lean`** — below / near / above, relative to that city's accommodation estimate. An editorial read, never a computed figure.
4. **`friction`** — walkable / short-ride / taxi-reliant, relative to the city's `anchor`.
5. **`anchor`** — one pin at the city's centre of gravity.
6. **`character`** — one line. What the place is actually like.
7. **`stayIf` / `skipIf`** — 2–3 each. Direct. Dealbreakers, not drawbacks.

For **minimal-tier** cities: just `note` — one honest sentence owning the absence ("Compact destination — stay in the central core. You don't need to juggle neighbourhoods here.").

## Step 3 — Verification (mandatory, per city)

**The water check is required, not optional.** Since PR #37 made framing follow the data, a city with misplaced polygons now frames the wrong place *convincingly* — the failure mode moved from obvious to invisible.

For each full-tier city, sample each polygon's interior against the basemap `water` layer:
- Non-waterfront area above ~5% water → **fail**, fix before committing.
- Waterfront areas will show a few percent legitimately — eyeball those.

Make the sampling hook a reusable dev utility rather than reconstructing it per city. It caught Miramar sitting entirely in the sea; it will catch the next one too.

Also verify per city: polygons closed, no self-intersections, no overlaps between areas, all inside the tile region, and bbox sizes plausible against the real districts.

## Step 4 — Tiles

Add each new **full-tier** city's bounding box to `tiles/cities.geojson`. **Keep boxes tight** — just the metro area. Loose boxes are the main driver of extract size, and size discipline is what keeps this architecture viable at 150–200 cities.

**Only full-tier cities get a box.** Minimal-tier cities render the editorial band and never mount the map — `NeighbourhoodSection` returns `CompactCityBand` for `tier: "minimal"` and no `<MapBase>` — so a region cut for one is pure waste. This also means the triage, not the city list, sets the extract's size: downgrading a city to minimal removes tiles as well as copy.

Re-cut **once at the end of each batch**, not per city:

```
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles somewhere-z14.pmtiles --region=tiles/cities.geojson --maxzoom=14
```

Upload to Vercel Blob, update the URL in `<MapBase>` and the spec.

~~Resolve **Halifax** in this pass: it has a region cut but no entry. Seed it or drop the region.~~
**Resolved (batch 1): region dropped.** Halifax triaged minimal — a compact peninsula where the honest answer is downtown or the North End — and minimal tier renders no map, so the box had nothing to serve.

## Batching

Do **not** attempt this in one sitting — quality dilution is the failure mode, not time.

- Batch 1: tier triage (all 37) + 6–8 full-tier cities you know well.
- Subsequent batches: 8–10 cities each, grouped by familiarity.
- One PR per batch. Re-cut tiles at the end of each.

Cities you've travelled to are fast. Cities you haven't need real research — budget for it, and downgrade to minimal-tier rather than writing copy you can't stand behind.

## Acceptance criteria (per batch)

1. Every city in the batch has a tier assigned and entries matching that tier.
2. Water check passes for every full-tier polygon; geometry validation passes.
3. No safety/risk language, no percentages, no precise times anywhere in the batch.
4. Every `skipIf` is a dealbreaker about traveller fit.
5. `tiles/cities.geojson` updated, extract re-cut, Blob URL updated.
6. No mechanism changes — diff is data plus the tile URL.

## Out of scope

Any mechanism change; typical nightly price; "worth the walk" spots; hotel handoff; POIs / higher maxzoom; comparison view; the routed detail view.
