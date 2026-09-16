# destinations.json — schema notes

`destinations.json` is strict JSON (imported via `import … with { type: 'json' }` in
[`src/lib/getDestinations.js`](../lib/getDestinations.js)), so it **cannot carry inline
`//` comments**. Field semantics that aren't obvious from the key names live here instead.
The canonical schema and sourcing notes are in [`CLAUDE.md`](../../CLAUDE.md) §5.

## Flight bands — `flights.<origin>.bands.<month>`

```
"flights": {
  "yyz": {
    "hours":   6.5,          // typical door-scheduled flight time, hours
    "nonstop": true,
    "bands": {
      "jun": [850, 1150]     // <-- see below
    }
  }
}
```

Each `bands.<month>` is a `[low, high]` pair meaning:

> **Return (round-trip) economy fare per adult, in CAD**, expressed as the range
> across the given month.

- **Return, not one-way.** The number is the entire air-travel cost of the trip, both
  legs. The cost model adds it exactly once — `total = flight_band + stay + ground`
  (`estimateCost` in [`src/lib/ranking.js`](../lib/ranking.js)) — and the outbound link
  opens a **round-trip** Skyscanner search (`rtn=1`). A one-way redefinition would break
  both.
- **Per adult**, economy cabin.
- **CAD.**
- **A range across the month**, not a single fare or a specific date.

Keep this definition consistent across every row: the rows are only comparable to each
other, and to the "See fares" handoff, because they all mean the same thing.

## Stay rates — `stay.<tier>`

```
"stay": {
  "budget": [40, 65],
  "mid":    [95, 160],
  "nice":   [230, 400]
}
```

Each tier is a `[low, high]` pair meaning:

> **Nightly accommodation cost for ONE traveller, in CAD**, as a range for that tier.

- **Per traveller, per night.** `estimateCost` multiplies it by `nights`.
- **What the tier buys** differs by tier: `budget` is typically a **hostel dorm bed**;
  `mid` and `nice` are typically a **private room**.
- **Tier values are canonical, labels are not.** The stored values are
  `budget` / `mid` / `nice`; the UI shows `mid` as "Mid-range".

**This field does not scale cleanly to more than one traveller.** A dorm bed doubles for
two people; a private room does not — two travellers share one `mid` room at roughly the
one-room price. So the same field needs a different multiplier per tier, which is why
party pricing is **out of scope for v1** and would need a per-tier rule rather than a
headcount multiplier over the whole total. Until that exists, read every stay figure —
and every total built from one — as a single traveller's.

## Ground spend — `ground_daily`

```
"ground_daily": [50, 90]
```

> **Daily ground spend per person, in CAD** — food, local transit, entry fees and
> incidental spending — as a range.

- **Per person, per day.** `estimateCost` treats days as equal to nights, so a 7-night
  trip carries 7 days of ground spend.
- Excludes accommodation (that is `stay`) and the flights (that is `flights.<origin>.bands`).

## What the total means

> **The estimated total is one traveller's trip cost.**

`total = flight_band + (stay × nights) + (ground_daily × days)` — one seat, one
traveller's bed, one person's daily spending. The search form has no party-size input and
the ranking has no headcount, so every cost range, budget comparison and "~$X over" tag in
the product is a solo figure. See the note under **Stay rates** for why multiplying the
total by a headcount would not give a correct party price.
