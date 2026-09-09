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
        "summary": "Restored plazas, museums and a cathedral square, all within a few blocks of the harbour.",
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
      // 3–5 areas for a single-level full-tier city
    ]
  },

  // OPTIONAL on a full-tier city: a district layer above the areas, for cities
  // with too many neighbourhoods to read at once. Where it is present each area
  // also carries `district: "<district id>"`. Omit the whole key for a
  // single-level city — see "Tier semantics" below.
  "<large-city-id>": {
    "cityId": "<large-city-id>",
    "tier": "full",
    "reviewedOn": "2026-09",
    "anchor": { "name": "Downtown LA", "lat": 34.043, "lng": -118.238 },
    "districts": [
      {
        "id": "central",
        "name": "Downtown & Eastside",
        "lean": "near",        // the dominant lean of its member areas
        "polygon": { "type": "Polygon", "coordinates": [[[ /* lng,lat */ ]]] }
      }
    ],
    "areas": [
      { "id": "dtla", "district": "central" /* …plus every area field above… */ }
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

**`summary` (optional)** — one further sentence under `character` in the area panel.
`character` is the one-line read and is required; `summary` expands it with the concrete
detail that makes the area recognisable ("a produce market and the concert hall within a
short walk of each other"). It obeys every copy rule below. Omit it and the panel simply
shows the `character` line.

**`districts` (optional, full tier only)** — a coarser layer above `areas`, for cities
with more neighbourhoods than a single map can carry. See "Tier semantics".

**Copy rule for `stayIf` / `skipIf`** — `skipIf` entries must be **dealbreakers, not drawbacks**. "You can't walk to the historic sights in under five minutes" is actionable; "some noise" is filler. Be direct. Two constraints on that directness:
- Point at **friction the traveller experiences**, never at the neighbourhood's character or the people in it. "The streets are loud until late" is fine; anything judging the place rather than the fit is not.
- Describe **transport need, never area risk.** "You'll want a taxi back at night" is logistics and is allowed. "Caution after dark", "sketchy", "avoid" and equivalents are prohibited anywhere in this feature.

### Tier semantics (this is itself an honesty feature — honest coverage, not uniform coverage)
- **full** — genuine multi-area story. Render the full module: map + three-band legend + clickable areas + panel. A full-tier city comes in **two shapes**, and the renderer picks by whether `districts` is present:
  - **single-level** (the default, e.g. Havana — 4 areas): every area is on the map at all zooms, and the panel's no-selection state lists the areas. Aim for 3–5 areas; past that a single level stops being readable.
  - **district-layered** (e.g. Los Angeles — 5 districts over 12 areas): districts render below the drill zoom and neighbourhoods above it; clicking a district eases past that threshold and selects its first area. The panel's no-selection state lists districts with their area counts. Use this only when a city genuinely has more areas than one level can carry — it is a legibility device, not a richer tier, and it costs a second layer of authored polygons.

  Both shapes are the same tier and the same module. `districts` is **optional**: omitting it is not a lesser entry, and most cities should not need it.
- **minimal** — the honest answer is "one core." Render the `note` as a **designed editorial callout** carrying the same visual weight as a real module — never a greyed-out empty state, skeleton, or "no data" placeholder. The UI actively owns the absence as a judgment ("you don't need to juggle neighbourhoods here"), which reads as confidence rather than incompleteness. Optionally 1–2 areas, no full map treatment.
- **none** — no meaningful areas story. Module does not render for that city; the rest of the detail view is unaffected.

## Accessor seam

Add `getNeighbourhoods(cityId)` in `src/lib/` (parallel to `getDestinations`). All neighbourhood reads route through this one module so the JSON backend can later swap to Supabase with no caller changes. Returns the city object or `null`. No component reads `neighbourhoods.json` directly.

## Rendering

- **Renderer:** MapLibre GL (project-settled). Wrap the base in a `<MapBase>` component so the tile source is swappable and nothing else depends on it.
- **Base:** a **single self-hosted Protomaps PMTiles multi-region extract** covering all seed cities in one file — *not* per-city files. `<MapBase>` points at one Blob URL; no filename resolution by city id. No API key, no runtime third-party call.
  - Extract URL: hosted on Vercel Blob (public). Paste the current URL when wiring.
  - **maxzoom = 14.** Map interactions should not expect detail beyond this. (Was 13; re-cut at 14 so the close-in view carries real street and block detail.)
  - Because that detail is now worth seeing, **area fills fade as zoom increases** and the boundary hands over to its stroke. Far out the fill is the information — the shape of the lean across the city; close in a wash over the streets hides what the reader zoomed in for.
  - Register the `pmtiles://` protocol for MapLibre GL.
  - `tiles/cities.geojson` is the **committed region source** (one polygon per city, cut with `pmtiles extract --region`). Adding a city = add a polygon, re-cut, re-upload. Add `*.pmtiles` to `.gitignore` — tiles are build output, not source.
  - Show visible **© OpenStreetMap** attribution on the map. This is an ODbL obligation, not optional. Protomaps credit is appreciated but not required.
- **Scale note (provisional):** the multi-region extract is chosen to scale to 150–200 cities, where per-city files would not. Revisit if total tile size becomes unwieldy — a full-planet extract or a hosted tile provider are the alternatives, and the `<MapBase>` seam makes that a one-URL change.
- **Areas layer:** render each area's `polygon` as a fill layer, colour driven by a `match` on the `lean` property → three colours.
- **Colour = price lean only.** Use a money scale, **not** a good/bad scale — below = cool/affordable, near = neutral, above = warm. Avoid pure red (no "danger" read). Legend shows exactly three bands: *below your estimate · about your estimate · above your estimate.*
- **Anchor:** render the city `anchor` as a single labelled marker, visually distinct from the area fills. No transit layer.
- **Interaction:** click a polygon → panel shows the area name, a lean chip (qualitative band label, **no number**), the `friction` line, the `character` line, the optional `summary` line, and the `stayIf` / `skipIf` lists. Porting the existing prototype panel logic is fine. On a district-layered city, clicking a *district* drills in rather than selecting: it eases past the drill zoom and selects that district's first area.
- **Legend as filter:** the three legend bands double as toggles, hiding non-matching neighbourhoods and their labels. Districts are unaffected — a district can hold areas from more than one band.
- **Disclosure line** under the map, always visible for full-tier cities:
  > Our read of how stays in each area compare to this city's estimate — a judgment, not a calculation. Reviewed {Month YYYY from `reviewedOn`}.

- **Container:** there is no routed detail view yet, and the module is reached in **two steps**:
  1. the result card's `neighbourhoods` chip expands the section **inline inside the tile** — bar (lean filters, full-screen and collapse controls) over map + panel, with the disclosure line beneath. A collapse control closes it again. This is the reader's first step and the common case.
  2. an **explicit full-screen click** opens a **minimal per-city detail overlay** — hero, cost header, the module (which gains a rail listing every area), close. Nothing else opens it: the chip never jumps straight to full screen.

  Both steps share one selection/filter state, so going full screen carries the reader's selection across rather than resetting it. A minimal-tier city's inline step is the editorial callout with a collapse control and no full-screen affordance — a larger canvas adds nothing to a paragraph.

  Keep the overlay thin; it is a presentation shell, not a first draft of the full detail view. The routed `/destination/:id` view is a separate future unit of work, and the module moves into it unchanged because it reads only from `getNeighbourhoods()`.
- **Visual implementation** follows the Claude Design handoff (v2); **behaviour** follows this spec. Where they conflict, this spec wins — and the conflict is reported in the PR, not silently reconciled.

## Seed cities (to lock the schema)

Three cities are seeded, so that **every render path is exercised** before we author 130+ entries:

- **Full tier, single-level:** Havana — 4 areas, no `districts` key. Proves the district layer is genuinely optional.
- **Full tier, district-layered:** Los Angeles — 5 districts over 12 areas (the v2 design's content). Proves the drill-down.
- **Minimal tier:** San José — one genuinely compact city where the honest answer is "one core." Its real tier is confirmed in the content pass; the point here is that the path renders.

Havana's areas carry hand-drawn polygons; Los Angeles' were generated once from the design's procedural shapes and **baked into the dataset as real GeoJSON**, so the runtime never generates geometry. Both are approximations pending the content pass.

## Copy-honesty step (required before PR)

- Confirm no computed precision appears anywhere in UI or copy — bands only, no "%", and **no precise walk/ride times**.
- Confirm every `skipIf` entry is a dealbreaker about traveller fit, not a judgment of the place; confirm no risk/safety language anywhere.
- Confirm the disclosure line renders from `reviewedOn` and matches what the code actually does (editorial buckets).
- Update **How It Works** to note that neighbourhood guidance is an editorial judgment, disclosed and dated — consistent with the site-wide honesty rule.

## Acceptance criteria

1. `getNeighbourhoods(cityId)` returns the seeded objects; no component reads the JSON directly.
2. Havana renders the full module single-level: map, anchor marker, three-band legend, clickable areas, panel with lean chip + friction line + character + optional summary + stay/skip, disclosure line. Los Angeles renders the same module district-layered, drilling from districts to neighbourhoods.
2b. The chip expands the section **inline in the tile** and never jumps straight to full screen; the collapse control closes it; full screen opens only from its own control and carries the current selection and filters across.
3. The minimal-tier seed renders its note as a designed editorial callout — not an empty/greyed state — and no full map treatment.
4. A city with no entry (or `tier: "none"`) renders no module and the detail view is otherwise unaffected.
5. Colour encodes lean only; legend shows three bands; no safety/vibe/nightlife encoding anywhere; no percentages anywhere; `friction` renders as one of the three band labels and never as a precise duration.
6. Map renders from the single multi-region PMTiles extract via one Blob URL, with visible © OpenStreetMap attribution.
7. How It Works updated.

## Out of scope (do not touch)

Full 37-city content; adding the remaining cities to `tiles/cities.geojson`; real/scraped pricing; typical nightly price per area; "worth the walk" spots; "see stays in {area}" outbound links; comparison view; things-to-do; flight handoff; the routed detail view; any safety/vibe/personalization layer.
