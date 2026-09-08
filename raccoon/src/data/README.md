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
