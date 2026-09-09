# Task: Neighbourhood Guidance — Mechanism PR

**Unit of work:** mechanism only. Feature + schema + accessor seam + rendering, proven on two seed cities. **No full content pass.** The 37-city curation is a separate spec/PR once this schema is frozen.

## Why this exists

somewhere answers "where should I go" by total trip cost. This feature extends it to "you chose — now which part of the city fits your trip," on-thesis: the map colours each area by how its nightly stay **leans** against this city's accommodation estimate (below / near / above). It is the one neighbourhood map only somewhere can draw, because only somewhere routed the traveller in by whole-trip cost.

## Core principle (honesty)

The lean is a **disclosed editorial judgment, not a computed figure.** Three qualitative buckets only. **No percentages, no per-listing pricing, no false precision.** It never feeds the ranking or the estimate — it annotates the single accommodation figure the user already saw by showing the rough shape of its spread. This keeps the existing decision *"accommodation is a uniform input, not a scored differentiator"* intact.

**Explicitly not in this feature — do not build or design toward any of these:** safety ratings, "caution after dark," nightlife/vibe/quiet ratings, first-timer scoring, personalization/vibe-matcher, real-time or scraped pricing, per-neighbourhood cost modelling, comparison view, things-to-do, flight handoff. Colour encodes price lean and nothing else.

## Data model

New file `src/data/neighbourhoods.json`, keyed by city id (same ids as the destinations dataset).

```jsonc
{
  "havana": {
    "cityId": "havana",
    "tier": "full",              // "full" | "minimal" | "none"
    "reviewedOn": "2026-09",     // drives the disclosure line; YYYY-MM
    "anchor": {                  // the city's centre of gravity — one pin, not a transit layer
      "name": "Parque Central",
      "lat": 23.1367,
      "lng": -82.3589
    },
    "areas": [
      {
        "id": "habana-vieja",
        "name": "Habana Vieja",
        "lean": "above",         // "below" | "near" | "above" — editorial bucket
        "friction": "walkable",  // "walkable" | "short-ride" | "taxi-reliant" — relative to anchor
        "character": "The colonial core — iconic plazas, museums and street life, all on foot.",
        "stayIf": [
          "Sights and history outside your door",
          "Walking everywhere, no taxis",
          "Restaurants and bars at hand"
        ],
        "skipIf": [
          "You need quiet — the streets are loud until late",
          "Stretching the budget further matters more than location"
        ],
        "polygon": { "type": "Polygon", "coordinates": [[[ /* lng,lat */ ]]] }
      }
      // 3–5 areas for a full-tier city
    ]
  },

  "<compact-city-id>": {
    "cityId": "<compact-city-id>",
    "tier": "minimal",
    "reviewedOn": "2026-09",
    "note": "Compact destination — stay in the central core. You don't need to juggle neighbourhoods here.",
    "areas": []                  // 0–2 areas; no full map treatment
  }
}
```

### Field semantics

**`anchor`** — one pin per city marking the natural centre of gravity (Parque Central, Old Montreal, etc.). Renders as a single distinct marker on the map, visually different from the area fills. It is a reference point, **not** a transit layer — no routes, stops, or lines.

**`friction`** — how much effort it takes to reach the anchor from this area. **Coarse bands only, never precise minutes.** Three values:
- `walkable` → "Walkable to the centre"
- `short-ride` → "A short ride to the centre"
- `taxi-reliant` → "You'll rely on taxis to reach the centre"

Rationale: the traveller is deciding *whether they'll be commuting*, not budgeting to the minute. Precise minutes ("15m walk") are a falsifiable factual claim that goes stale silently and sits incoherently beside a deliberately qualitative price band. Bands carry nearly all the decision value at none of the exposure. Renders as one line in the area panel, beside the lean chip.

**Copy rule for `stayIf` / `skipIf`** — `skipIf` entries must be **dealbreakers, not drawbacks**. "You can't walk to the historic sights in under five minutes" is actionable; "some noise" is filler. Be direct. Two constraints on that directness:
- Point at **friction the traveller experiences**, never at the neighbourhood's character or the people in it. "The streets are loud until late" is fine; anything judging the place rather than the fit is not.
- Describe **transport need, never area risk.** "You'll want a taxi back at night" is logistics and is allowed. "Caution after dark", "sketchy", "avoid" and equivalents are prohibited anywhere in this feature.

### Tier semantics (this is itself an honesty feature — honest coverage, not uniform coverage)
- **full** — genuine multi-area story. Render the full module: map + three-band legend + clickable areas + panel.
- **minimal** — the honest answer is "one core." Render the `note` as a **designed editorial callout** carrying the same visual weight as a real module — never a greyed-out empty state, skeleton, or "no data" placeholder. The UI actively owns the absence as a judgment ("you don't need to juggle neighbourhoods here"), which reads as confidence rather than incompleteness. Optionally 1–2 areas, no full map treatment.
- **none** — no meaningful areas story. Module does not render for that city; the rest of the detail view is unaffected.

## Accessor seam

Add `getNeighbourhoods(cityId)` in `src/lib/` (parallel to `getDestinations`). All neighbourhood reads route through this one module so the JSON backend can later swap to Supabase with no caller changes. Returns the city object or `null`. No component reads `neighbourhoods.json` directly.

## Rendering

- **Renderer:** MapLibre GL (project-settled). Wrap the base in a `<MapBase>` component so the tile source is swappable and nothing else depends on it.
- **Base:** a **single self-hosted Protomaps PMTiles multi-region extract** covering all seed cities in one file — *not* per-city files. `<MapBase>` points at one Blob URL; no filename resolution by city id. No API key, no runtime third-party call.
  - Extract URL: hosted on Vercel Blob (public). Paste the current URL when wiring.
  - **maxzoom = 13.** Map interactions should not expect detail beyond this.
  - Register the `pmtiles://` protocol for MapLibre GL.
  - `tiles/cities.geojson` is the **committed region source** (one polygon per city, cut with `pmtiles extract --region`). Adding a city = add a polygon, re-cut, re-upload. Add `*.pmtiles` to `.gitignore` — tiles are build output, not source.
  - Show visible **© OpenStreetMap** attribution on the map. This is an ODbL obligation, not optional. Protomaps credit is appreciated but not required.
- **Scale note (provisional):** the multi-region extract is chosen to scale to 150–200 cities, where per-city files would not. Revisit if total tile size becomes unwieldy — a full-planet extract or a hosted tile provider are the alternatives, and the `<MapBase>` seam makes that a one-URL change.
- **Areas layer:** render each area's `polygon` as a fill layer, colour driven by a `match` on the `lean` property → three colours.
- **Colour = price lean only.** Use a money scale, **not** a good/bad scale — below = cool/affordable, near = neutral, above = warm. Avoid pure red (no "danger" read). Legend shows exactly three bands: *below your estimate · about your estimate · above your estimate.*
- **Anchor:** render the city `anchor` as a single labelled marker, visually distinct from the area fills. No transit layer.
- **Interaction:** click a polygon → panel shows the area name, a lean chip (qualitative band label, **no number**), the `friction` line, the `character` line, and the `stayIf` / `skipIf` lists. Porting the existing prototype panel logic is fine.
- **Disclosure line** under the map, always visible for full-tier cities:
  > Our read of how stays in each area compare to this city's estimate — a judgment, not a calculation. Reviewed {Month YYYY from `reviewedOn`}.

- **Container:** there is no routed detail view yet. Mount the module in a **minimal per-city detail overlay** opened from a result card — cost header, hero, neighbourhood module, close. Keep it thin; it is a presentation shell, not a first draft of the full detail view. The routed `/destination/:id` view is a separate future unit of work, and the module moves into it unchanged because it reads only from `getNeighbourhoods()`.
- **Visual implementation** follows the Claude Design handoff (v2); **behaviour** follows this spec. Where they conflict, this spec wins — and the conflict is reported in the PR, not silently reconciled.

## Seed cities (to lock the schema)

- **Full-tier seed:** Havana (design mock + prototype already exist).
- **Minimal-tier seed:** one genuinely compact city from the 37 where the honest answer is "one core." If unsure which qualifies, temporarily set any second city to `tier: "minimal"` purely to exercise that render path — its real tier is finalised in the content pass. The point is that **both the full and minimal code paths render correctly** before we author 130+ entries.

## Copy-honesty step (required before PR)

- Confirm no computed precision appears anywhere in UI or copy — bands only, no "%", and **no precise walk/ride times**.
- Confirm every `skipIf` entry is a dealbreaker about traveller fit, not a judgment of the place; confirm no risk/safety language anywhere.
- Confirm the disclosure line renders from `reviewedOn` and matches what the code actually does (editorial buckets).
- Update **How It Works** to note that neighbourhood guidance is an editorial judgment, disclosed and dated — consistent with the site-wide honesty rule.

## Acceptance criteria

1. `getNeighbourhoods(cityId)` returns the seeded objects; no component reads the JSON directly.
2. Havana renders the full module: map, anchor marker, three-band legend, clickable areas, panel with lean chip + friction line + character + stay/skip, disclosure line.
3. The minimal-tier seed renders its note as a designed editorial callout — not an empty/greyed state — and no full map treatment.
4. A city with no entry (or `tier: "none"`) renders no module and the detail view is otherwise unaffected.
5. Colour encodes lean only; legend shows three bands; no safety/vibe/nightlife encoding anywhere; no percentages anywhere; `friction` renders as one of the three band labels and never as a precise duration.
6. Map renders from the single multi-region PMTiles extract via one Blob URL, with visible © OpenStreetMap attribution.
7. How It Works updated.

## Out of scope (do not touch)

Full 37-city content; adding the remaining cities to `tiles/cities.geojson`; real/scraped pricing; typical nightly price per area; "worth the walk" spots; "see stays in {area}" outbound links; comparison view; things-to-do; flight handoff; the routed detail view; any safety/vibe/personalization layer.
