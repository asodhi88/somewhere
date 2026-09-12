# Basemap tiles

The neighbourhood map is drawn by [`<MapBase>`](../src/components/MapBase.jsx) over a
**single self-hosted Protomaps PMTiles extract** — one multi-region file covering every
seed city, *not* a file per city. `<MapBase>` points at one Blob URL and does no
filename resolution by city id.

- **Extract URL** — set as `PMTILES_URL` in `MapBase.jsx`.
- **maxzoom = 14.** The map's `maxZoom` matches, so interactions never invite detail
  the extract cannot serve.
- **`cities.geojson` is the committed region source** — one polygon per city. It is the
  input to the cut, so it is the thing to edit and review; the `.pmtiles` output is
  build artefact and is gitignored.
- **Only full-tier cities get a region.** Minimal-tier cities render the editorial band
  and never mount `<MapBase>` (see `NeighbourhoodSection`), so a region cut for one buys
  nothing and costs extract size. Halifax had a region and no entry for exactly this
  reason; it was dropped once Halifax triaged minimal.
- No API key and no runtime third-party call: the extract is served from our own Blob
  storage.

## Adding a city

1. Add a polygon to the `MultiPolygon` in `cities.geojson` covering the city's areas.
   **Keep it tight** — just the metro area. Loose boxes are the main driver of extract
   size, and size discipline is what keeps this architecture viable at 150–200 cities.
2. Verify the city's polygons before cutting — see **Checking polygons** below.
3. Re-cut, once per batch rather than per city:

```bash
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles somewhere-z14-<YYYYMMDD>.pmtiles --region=tiles/cities.geojson --maxzoom=14
```

Use the same `<YYYYMMDD>` in both halves — the output is named for the build it came
from, so the file on disk, the object in Blob and `PMTILES_URL` all agree.

4. Upload the `.pmtiles` file to Blob storage **under a new dated filename**, then update
   `PMTILES_URL` in `MapBase.jsx` to match. See the convention below.

**Current extract:** `somewhere-z14-20260910.pmtiles` — 7 regions, cut from
`build.protomaps.com/20260910.pmtiles`, 62 MB. Los Angeles alone is ~4,100 km² of the
~5,500 km² total — its district-layered entry genuinely spans Pasadena to Santa Monica
to the Harbor, but it is the one to look at first if size ever needs trimming.

## Versioning: date the filename, never overwrite

The extract filename carries the **Protomaps build date it was cut from**
(`somewhere-z14-<YYYYMMDD>.pmtiles`), and each re-cut is uploaded under a new name.
The old object is left in place until the new URL is live.

This is not tidiness. Blob serves these with `Cache-Control: public, max-age=2592000` —
a month. Overwriting the same pathname keeps the URL stable and therefore *looks* like
the cheaper option, but it leaves CDN edges serving the previous extract for up to a
month, with no error anywhere: tiles load, the map renders, and only the cities added in
the newest cut are missing. A city seeded in this repo would draw its polygons over
blank tiles, and nothing in the app or the build would say why.

Dating the filename makes a re-cut a code change — one line in `MapBase.jsx` — which is
exactly the property worth having. The extract the app points at is then visible in the
diff and reviewable in the PR, and a stale extract is impossible rather than merely
unlikely.

**Because of this, a batch that re-cuts tiles cannot merge before the upload.** The
dataset and the URL have to land together: data without the extract renders blank tiles,
and the URL without the data points at regions nothing uses.

Old extracts can be deleted from Blob once the new URL has been live long enough that no
cached HTML still references the previous one.

## Checking polygons

```bash
node scripts/check-polygons.mjs                          # every full-tier city
node scripts/check-polygons.mjs del dxb                  # just these
node scripts/check-polygons.mjs --source=somewhere-z14-20260910.pmtiles  # against a local cut
```

Samples each polygon's interior against the basemap `water` layer and validates ring
closure, self-intersection, sibling overlap, tile-region containment and bbox spans.
Defaults to the remote planet build over range requests, because a newly-seeded city is
by definition not in our own extract yet; point `--source` at the local file afterwards
to confirm the cut actually serves it.

**Why it is not optional.** Since framing follows the data, a city with misplaced
polygons frames the wrong place *convincingly* — the failure moved from obvious to
invisible. It caught Miramar sitting in the sea, and on the batch-1 run it caught Rome's
centro storico drawn across the Tiber and Quebec's lower town drawn into the St Lawrence.

Two things it deliberately does **not** assume:

- **Districts are not geometric parents of their areas.** They are a generalized shape
  drawn below `DRILL_ZOOM`; in the LA seed, `pasadena` sits entirely outside the `valley`
  district it belongs to. Only the label is checked, not containment.
- **A waterfront area legitimately contains water.** Those are listed in the script's
  `WATERFRONT` set, which is an attestation that someone read the number and accepted it
  — not a way to silence the check.

It also fails loudly when too many samples land on tiles the source cannot serve, rather
than reporting a confident `0.0%` — the same silent-fallback trap as the fonts note below.

## Fonts (glyphs)

Vector tiles carry label *text* but never the *fonts* to draw it, so MapLibre needs a
`glyphs` endpoint before any symbol layer renders. Those are **self-hosted too**, for the
same reason as the tiles: a hosted glyph CDN would be exactly the runtime third-party
call this setup exists to avoid.

- Location: `public/fonts/<stack>/<range>.pbf`, referenced by the style as the relative
  URL `/fonts/{fontstack}/{range}.pbf`.
- Vendored: **one stack, three ranges** — `Noto Sans Regular`: `0-255` (Basic Latin +
  Latin-1), `256-511` (Latin Extended-A) and `8192-8447` (General Punctuation — OSM names
  really do contain en dashes and curly quotes). ~276KB in total against 256 ranges /
  ~6MB for the full stack, the rest being scripts no seed city needs. `OFL.txt` is the
  font licence and ships alongside.
- Source: [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets)
  (`fonts/Noto Sans Regular/`). Note the directory names contain spaces, so the fetched
  path is URL-encoded (`Noto%20Sans%20Regular`).

**Adding a font range or stack:** only if a label needs it. Pull the single range rather
than the whole set, and keep `text-font` in `MapBase.jsx` in step with the directories
that actually exist.

**How a missing range shows up — worth knowing, because it is silent.** MapLibre requests
a range only when a label contains a character in it, and a missing file does *not*
surface as a 404: the SPA fallback answers with `200` and `index.html`, so MapLibre gets
HTML where it expects a protobuf, fails to parse it, and quietly drops those glyphs. No
console error. `8192-8447` was found exactly this way — labels looked fine until the
request log showed a `/fonts/` response typed `text/html`. If labels ever look truncated
or a word silently vanishes, check the network panel for a `/fonts/` request whose
content-type is HTML, and vendor that range.

**TODO (content-pass scale): make this fail loudly.** Finding a missing range by eye does
not scale to 130+ entries whose names we will not have read. Add a check that `/fonts/`
responses are actually glyph payloads rather than the SPA fallback — a small dev-time
fetch wrapper, or a CI step that requests each range the style references.

One caveat for whoever builds it: **do not assert `content-type: application/x-protobuf`.**
The dev server returns these `.pbf` files with *no* content-type at all, so an equality
check would fail in dev while passing in production — the worst possible direction for a
guard. The reliable tell is the inverse: a `text/html` content-type (or a body that fails
to parse as a glyph protobuf) means the fallback answered and the range is missing.

## Attribution

The basemap is OpenStreetMap data. **© OpenStreetMap is rendered on the map whenever it
is on screen** — an ODbL obligation, not a nicety, so it is never conditional on load
success. Protomaps credit is included alongside it as a courtesy.

## Scale note (provisional)

The multi-region extract is chosen to scale to roughly 150–200 cities, where per-city
files would not. If total tile size becomes unwieldy the alternatives are a full-planet
extract or a hosted tile provider — and because everything routes through `<MapBase>`,
that switch is a one-URL change.
