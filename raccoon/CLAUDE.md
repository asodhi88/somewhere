# somewhere — Project Brief

*This file lives at the repo root. Claude Code reads it automatically at the start of every session. Keep it current — it's the source of truth for scope and constraints.*

---

## 1. The problem

The fuzziest, least-served moment in travel planning is **"I want to go somewhere, I don't know where."**

Every major travel product assumes you already know your destination. Google Flights, Expedia, Booking — all start from an origin/destination pair. The traveller who has a week off in October and $2,000 and no fixed idea has no good tool. They scroll Instagram, ask friends, or open twelve tabs.

**Target user:** the flexible-dates, flexible-destination leisure traveller departing from Toronto. Has budget and time constraints, not destination constraints.

---

## 2. The product

**Input:** origin (YYZ, fixed in v1), total trip budget, number of nights, month or date range, stay tier, and a vibe filter (beach / city / hike / food / anywhere-cheap).

**Output:** a ranked grid of destination cards showing estimated all-in cost, flight time, nonstop status, typical weather for that month, visa status on a Canadian passport, and a one-line reason it matched.

**Explicit non-goal:** does not book anything. Hands off to Google Flights. It is a shortlist generator, not a booking engine.

---

## 3. Core insight (what the product is built around)

Most "where can I go" tools rank by **airfare**, which is actively misleading.

A cheap flight to Reykjavík is followed by brutal ground costs. A pricier flight to Bangkok is followed by a week that costs less than a weekend in Toronto. **Ranking by flight price inverts the real answer.**

So the ranked number is **estimated total trip cost**, not airfare:

```
total = flight_band + (nightly_stay_rate × nights) + (daily_ground_spend × days)
```

This is the demo moment. It's also the product's one soft spot, since the numbers are estimates — which is why they are always shown as ranges.

---

## 4. Scope decisions and rationale

These matter as much as the build. They are the case study.

### 4.1 Curated dataset, not a live API
Amadeus decommissioned its Self-Service API portal on **July 17, 2026** — keys deactivated, portal closed, registration already paused. Enterprise access requires a sales contract and accreditation.

Alternatives (Duffel, Skyscanner, Expedia Rapid) are partner-gated, but the deeper reason to skip them is **shape mismatch**:
- A flight-search API answers *"price me YYZ→LIS on Oct 12."*
- This product asks *"here are 40 places worth going in October"* — an **inspiration query**, which nobody exposes cheaply. Serving it live would mean hundreds of calls per search plus heavy caching, i.e. building a curated dataset anyway, slower and with a bill.

**Decision:** ~120 destinations reachable from YYZ, hand-built. Seasonal price bands, flight times, nonstop status, climate normals, visa status. Public, stable, slow-decaying.

### 4.2 Ranges, never false precision
Show `$1,650–2,100 all-in`, with a tap-through breakdown. Precise-looking numbers that can't be backed by live inventory are the one thing that would make this feel amateur. Ranges are more defensible *and* more honest about what the tool is.

### 4.3 No authentication in v1
Auth is paid for in states and flows and buys little for a tool used a few times a year. Three cheaper layers instead:
1. **URL-encoded search state** — `/results?from=YYZ&budget=2000&nights=7&month=oct&vibe=beach`. Back, refresh, bookmark, and share all work for free. The share link is the real prize: destination decisions are rarely made alone.
2. **localStorage** for last search + shortlist. Returning user sees a "pick up where you left off" card. (localStorage is fine here — this is a real Vercel app, not a Claude artifact.)
3. **Shortlist → comparison view** (see 6.3).

Known limitation: no cross-device sync. The share link covers the important half. Supabase auth drops in cleanly later if there's ever a reason.

### 4.4 Deferred to v2 — community cost validation
Not user reviews (TripAdvisor exists; don't fight it). **Cost validation**: a traveller back from Lisbon confirming "we did it for $1,800, not the $2,300 you showed."

Why it's the right v2: hardens the estimate bands (the product's soft spot); structured data, not prose, so no moderation surface; "community-verified trip costs" is a defensible position.

Why not v1: **coverage sparsity.** Twenty contributors might cover 30 of 120 destinations. Empty sections read as broken, not "not yet." Sparse UGC looks worse than none. Survivors seed one vertical densely, not a broad set thinly.

**Ship in v1:** a non-functional "contribute your trip cost" stub. One hour of work, makes the v2 story concrete in a demo.

---

## 5. Data model

One JSON file in v1 (Supabase only if it outgrows that). ~120 records.

```json
{
  "id": "lis",
  "city": "Lisbon",
  "country": "Portugal",
  "region": "Southern Europe",
  "coords": [38.72, -9.14],
  "flight": {
    "hours": 6.5,
    "nonstop": true,
    "bands": { "jan": [520, 700], "jun": [850, 1150] }
  },
  "stay": {
    "budget": [45, 70],
    "mid":    [110, 170],
    "nice":   [240, 400]
  },
  "ground_daily": [55, 95],
  "climate": {
    "oct": { "high_c": 22, "low_c": 15, "rain_days": 8, "label": "mild, some rain" }
  },
  "visa_ca": "visa_free_90",
  "vibes": ["city", "food", "beach"],
  "hero_image": { "url": "...", "photographer": "...", "profile_url": "..." },
  "blurb": "Cheap for Western Europe, warm into November, walkable."
}
```

**Sourcing:** cost-of-living indices, median hostel/hotel rates, published daily-budget aggregates, IATA/airline route data, climate normals, Government of Canada travel advisories for visa status.

**Imagery:** Unsplash API. Free, strong travel photography, attribution required and easy to satisfy. **Hand-pick one hero per destination** rather than keyword-pulling — otherwise you ship the same generic Eiffel Tower as everyone else. (User's own photography is *not* carrying imagery — insufficient coverage.)

---

## 6. Ranking and key screens

### 6.1 Ranking model
1. **Hard filters** — budget ceiling, month availability, vibe match, max flight time if set.
2. **Score** survivors on budget headroom (how comfortably it fits, not just whether), weather quality for the month, nonstop bonus, visa-free bonus.
3. **Diversify** — cap results per region so the grid feels like a set of real options, not nine Southeast Asian cities.

Stay tier re-ranks everything. Tokyo fails a $2,000 budget at "nice" and passes at "budget" — a genuinely useful thing to learn.

### 6.2 Results grid
Hero image, city/country, cost range as the dominant number, then flight time, weather, visa as secondary chips. One-line match reason.

### 6.3 Comparison view — *the screen that matters*
Heart destinations → they collect in a tray → tapping it opens side-by-side comparison across cost, flight time, weather, visa. Where a shortlist stops being bookmarks and becomes a decision tool. Best screen in the product, photographs well for a portfolio. Spend the time here.

### 6.4 Detail view
Cost breakdown (flight / stay / ground), month-by-month weather and price strip so users can see if shifting a month helps, visa detail, hand-off to Google Flights.

---

## 7. Stack

- React + Vite, Tailwind, deployed on Vercel
- Data as static JSON in v1; Supabase only if it outgrows that
- Unsplash API for imagery
- No auth, no backend in v1
- **Vercel Analytics on from day one** — real usage numbers for the case study
- Custom domain, not `*.vercel.app` — this may become a real product

**Product-thinking constraint:** this might become a shipped product, not just a portfolio piece. That changes almost nothing about v1 except: **keep the data layer behind a seam.** Components must not import the JSON directly — route everything through a single `getDestinations(filters)` module so swapping static JSON for Supabase later is a one-file change. Do NOT otherwise build for scale you don't have (no auth, no DB, no accounts until something forces it).

**Platform:** all tooling instructions assume **Windows 11 / VS Code / PowerShell**.
### Visual direction (decided Weekend 2)

**Palette — warm dark:**
- Background: `#1A1614` (warm near-black, brown-leaning)
- Elevated surfaces: `#26201C`
- Borders: `#3A322C`
- Primary text: `#F5F0E8`
- Muted text: `#A89B8F`
- Primary accent: `#E8A33D` (amber) — CTA only
- Secondary accent: `#E8735A` (coral) — sparing

**Type:** Cabinet Grotesk (display), Inter (body, tabular figures for numbers). No monospace.

**Hero:** headline → subhead → search bar → landmark illustration band. Night sky
layer with stars, real-moon-phase moon (calculated, with tooltip), shooting stars,
satellite. No clouds. Respects `prefers-reduced-motion`.

**Rule:** amber CTA is the single loudest element. Nothing competes with it.
---
## 7b. MVP scope — SHIP THIS FIRST

Main screen only: search bar + ranked results list. That's it.

**In scope:** search inputs (budget, nights, month, stay tier), results wired to
real `getDestinations()` output, Unsplash hero images, thin-results state,
URL-encoded search state, mobile.

**NOT in MVP:** tile clicks, shortlist, comparison view, detail pages.

**Design was built against ideal content.** The build must also handle:
over-budget cards with "~$X over" tags, searches returning very few results,
and the loading state.

## 8. Three-weekend plan

### Weekend 1 — data and logic, deliberately ugly
- Build the destination dataset (~120 records). Bulk of the weekend.
- Filter + scoring + diversification logic.
- Unstyled results list.
- **Exit criteria:** five realistic searches return rankings that feel right. If they don't, fix the model now — no amount of design saves a bad shortlist. **Do not build UI this weekend.**

### Weekend 2 — the design pass *(where the portfolio value lives)*
- Search input, results grid, detail view, comparison view.
- Empty, loading, and no-results states — what separates a portfolio piece from a demo.
- Typography and visual direction set here.

### Weekend 3 — ship
- Mobile pass.
- URL state, localStorage, shortlist persistence.
- OG/meta tags (this product is meant to be shared).
- Deploy to Vercel.
- Write the case study.

---

## 9. Case study outline

The app is the artifact; the writeup is what hiring managers read.
1. **Problem** — the flexible traveller has no tool.
2. **Insight** — ranking by airfare gives the wrong answer; total cost inverts it.
3. **Constraint** — the Amadeus shutdown mid-scoping, and why an inspiration query differs from a fare query. Reasoning, not apology — strongest section.
4. **Tradeoffs** — no booking, no auth, estimates as ranges. Each with rationale.
5. **Cut** — community cost validation and why cold-start sequencing put it in v2.
6. **Metrics you'd instrument** — searches/session, shortlist rate, comparison-view opens, share-link clicks, hand-off click-through. Name the one you'd optimize and why.

---

## 10. Open items

- Final product name (somewhere is the working name) and domain
- v1 ships **YYZ-only** (recommended — more origins multiply the dataset without improving the demo)

---

## 11. Stack / commands reference

### Scaffold

- **React 19 + Vite 8**, JavaScript (`.jsx`), ES modules.
- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin — no `tailwind.config.js` or `postcss.config.js`. Config, when needed, lives in `src/index.css` under `@theme`. Tailwind is pulled in by the single `@import 'tailwindcss';` at the top of `src/index.css`.
- **Vercel Analytics** (`@vercel/analytics`) — `<Analytics />` is mounted once in `src/main.jsx` alongside `<App />`.
- ESLint (flat config in `eslint.config.js`).

### Folder layout

```
raccoon/
├── CLAUDE.md              # this file — project brief + scope (source of truth)
├── index.html            # Vite entry HTML
├── vite.config.js        # Vite config — react() + tailwindcss() plugins
├── eslint.config.js
├── package.json
├── public/               # static assets served at root (favicon, icons)
└── src/
    ├── main.jsx          # app entry — mounts <App /> + <Analytics />
    ├── App.jsx           # root component (still the Vite starter demo — replace in Weekend 2)
    ├── index.css         # global styles + `@import 'tailwindcss';`
    ├── App.css           # starter demo styles (removable once App.jsx is replaced)
    ├── assets/           # imported assets (react.svg, vite.svg, hero.png — starter demo)
    ├── components/       # React components (empty until Weekend 2)
    ├── data/
    │   └── destinations.json   # the ~120-record dataset (currently []; built in Weekend 1)
    └── lib/
        └── getDestinations.js  # THE data-access seam (CLAUDE.md §7) — the only module
                                 # that reads destination data. Components import from here,
                                 # never from data/ directly. Stub returns [] for now.
```

> **The seam (§7):** all destination reads route through `getDestinations(filters)` in
> [src/lib/getDestinations.js](src/lib/getDestinations.js). Swapping static JSON for Supabase
> later must stay a one-file change — do not import `src/data/destinations.json` anywhere else.

### Commands

- Install deps: `npm install`
- Dev server: `npm run dev` (Vite, defaults to http://localhost:5173)
- Production build: `npm run build` (outputs to `dist/`, gitignored)
- Preview the build locally: `npm run preview`
- Lint: `npm run lint`
- Deploy: push to `main` — Vercel auto-deploys.

## 12. Design → code handoff (`handoff.md`)

Visual work happens in **Claude Design** (the design doc `Raccoon Directions.dc.html`), which runs ahead of the repo. Design changes that aren't in the code yet are captured in **`handoff.md` at the repo root** — the contract between the two.

**Format.** Newest work first. Each item is self-contained: the final values (no "roughly", no TBD), the CSS/markup snippets, and implementation notes (which file, which component, gotchas). The doc ends with an **"Already in the repo (no action)"** list — things the design already reflects that are *also* shipped — so the implementer reconciles rather than rebuilds.

**Workflow when implementing a handoff:**
1. **Read `handoff.md` first**, then **confirm each item against the current implementation before writing code** — some items may already be built, or partially. Say what you'll change and what's already there before touching anything.
2. Implement item by item. Respect the existing seams and conventions (the `[data-motion]` reduced-motion opt-out, the `--ac*` accent tokens, the `getDestinations` data seam).
3. **Verify against the running app** (`npm run dev` + the browser tools), not by eye alone.
4. Ship the code changes on a branch → PR → merge. **`handoff.md` is a transient working doc — keep it out of the feature commit** (it's regenerated per design sync, not repo history).
5. Once merged, the design doc is synced to match shipped code and `handoff.md` is cleared/rewritten for the next batch.

**Related:** the Claude Design project id and the DesignSync re-sync flow live in auto-memory (`raccoon-design-source`), not here.

## Post-MVP backlog
- Comparison view (shortlist → side-by-side) — highest portfolio value
- Detail view (cost breakdown, month strip, Google Flights hand-off)
- "Why not [destination]" panel — surface a rejected pick and explain why.
  Needs real ranking logic, not decorative copy.
- Community cost validation (see 4.4)
- Vibe filter in the search bar UI
- **Image carousel per destination** (3–5 photos instead of one hero).
  Requires: `hero_image` becomes an array; fetch script takes top N results;
  per-photo attribution. Rate-limit cost is significant — 30 × 4 photos × 2
  requests ≈ 240 calls against the 50/hr free cap (~5hrs of resume runs).
  Open question: carousels may suit the detail view better than the results
  list, where users are scanning to compare rather than lingering.
- **Neighbourhood guidance per destination.** Second-order problem: once a
  user knows *where* to go, they don't know *where in it* to stay. Same
  shape as the core problem — too many options, no way to compare on what
  matters. Would show 3–5 neighbourhoods per city with price level,
  character, and who it suits.
  Notes: data cost is an order of magnitude above destinations (37 cities ×
  5–8 neighbourhoods), and neighbourhood knowledge is harder to source
  reliably than climate or cost-of-living data — likely needs local/community
  input rather than published datasets. Ties directly to the community
  cost-validation item. Also interacts with stay tiers: "budget in Lisbon"
  means something different in Alfama than in the suburbs, which the current
  model can't express.