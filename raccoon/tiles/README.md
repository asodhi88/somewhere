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
- No API key and no runtime third-party call: the extract is served from our own Blob
  storage.

## Adding a city

1. Add a polygon to the `MultiPolygon` in `cities.geojson` covering the city's areas
   (a generous bbox is fine — vector tiles are cheap at these zooms).
2. Re-cut and re-upload:

```bash
pmtiles extract https://build.protomaps.com/<date>.pmtiles somewhere-z14.pmtiles --region=tiles/cities.geojson --maxzoom=14
```

3. Upload the `.pmtiles` file to Blob storage and, if the URL changed, update
   `PMTILES_URL`.

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
