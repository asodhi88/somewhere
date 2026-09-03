# Task: Flight handoff deep links

**Branch:** `feat/flight-handoff`
**Scope:** One PR. Add an outbound Skyscanner link to each result card, behind a links abstraction, with click tracking.

---

## Goal

Every result card gets a single outbound action that sends the traveller to a Skyscanner
month-price calendar for that exact route and month. This is the first point in the product
where the user can act on a recommendation.

No live pricing. No hotels. No detail view. See Out of scope.

---

## 1. New file: `src/lib/links.js`

This is a seam, in the same spirit as `getDestinations(filters)`. All outbound URL
construction lives here. No component builds a URL inline.

### Exported function

```js
buildFlightSearchUrl({ originIata, destinationIata, month, nights })
```

Returns a URL string, or `null` if required inputs are missing (caller must handle null by
not rendering the link).

### Target URL

Skyscanner Affiliates Link API, `calendar-month-view` page type. This is a plain 301
redirect service — no API key, no client-side fetch, works as a normal `href`.

```
https://skyscanner.net/g/referrals/v1/flights/calendar-month-view/
  ?origin=YYZ
  &destination=NRT
  &oym=2026-11
  &iym=2026-11
  &rtn=1
  &currency=CAD
  &market=CA
  &locale=en-CA
  &mediaPartnerId=<partner id>
```

### Parameter rules

| Param | Value |
|---|---|
| `origin` | IATA code of the selected departure city (YYZ or YUL) |
| `destination` | Destination IATA code from the dataset |
| `oym` | Outbound month, `YYYY-MM`. See month resolution below. |
| `iym` | Inbound month, `YYYY-MM`. Equal to `oym`, except when `nights > 21`, in which case use the following month. |
| `rtn` | Always `1` (return trip) |
| `currency` | `CAD` |
| `market` | `CA` |
| `locale` | `en-CA` |
| `mediaPartnerId` | From env var, omitted entirely if unset |

### Month resolution

The app's search state stores a month without a year. `links.js` must resolve it:

- Resolve to the **next future occurrence** of that month. If today is Sept 2026 and the
  user picked March, that resolves to `2027-03`. If they picked November, `2026-11`.
- If the current month is selected, resolve to the current year (Skyscanner accepts
  same-month searches).
- **Clamp:** Skyscanner supports flight searches up to 12 months ahead. If resolution lands
  beyond that window, return `null` rather than a link that will misbehave.
- Never emit a month in the past.

Put this logic in a small exported helper (`resolveSearchMonth`) so it's testable
independently.

### Environment variable

`VITE_SKYSCANNER_PARTNER_ID`

If unset or empty, omit the `mediaPartnerId` param entirely. The link must still work
without it — do not emit `mediaPartnerId=undefined`. Add the var to `.env.example` with a
comment that it is optional and currently unassigned.

---

## 2. Unit tests

Add tests for `links.js`. Cover:

- Correct URL for a standard case (YYZ → NRT, November, 7 nights)
- `iym` rolls to the following month when `nights > 21`
- `iym` equals `oym` at exactly 21 nights
- Month resolution rolls to next year when the month has passed
- Returns `null` when beyond the 12-month window
- `mediaPartnerId` omitted when env var is unset, present when set
- Returns `null` on missing origin or destination IATA

---

## 3. UI: link on the result card

One link per result card. Not a group of provider buttons.

- Renders as the card's call to action, visually secondary to the destination name and cost
  figures — it should not compete with the ranking information.
- `target="_blank"` and `rel="noopener noreferrer"`.
- If `buildFlightSearchUrl` returns `null`, render nothing. No disabled state, no error text.
- Must meet a 44px minimum touch target on mobile.
- Keyboard focusable with a visible focus ring consistent with existing focus styles.

### Label

The label must not imply somewhere has live fares. It sends the user to a price calendar,
so say that.

Suggested: **"See fares for <Month>"** or **"Check flights on Skyscanner"**.
Pick one and use it consistently. Avoid "Book", "Best price", or anything that promises a
number we don't have.

---

## 4. Analytics

Vercel Analytics custom event on click. This is the only conversion signal the product has,
so it needs to be right the first time.

```js
track('flight_handoff', {
  destination: <destination id>,
  origin: <origin iata>,
  month: <resolved YYYY-MM>,
  rank: <1-indexed position in the results grid>
})
```

`rank` matters — it tells us whether people click the top result or scroll. Do not include
budget, nights, or anything else user-identifying.

---

## 5. Copy honesty step

**Required before this PR is considered done.** Read `How It Works` and any results-page
copy, and reconcile it with what this change actually does.

Specifically, the page must now state:

1. Flight figures shown by somewhere are estimates from a curated dataset, not live fares.
2. The outbound link opens a month-view price calendar on Skyscanner, where the traveller
   picks their own dates. somewhere does not choose dates on their behalf.
3. **If** `VITE_SKYSCANNER_PARTNER_ID` is set at deploy time, the site carries affiliate
   links and this must be disclosed. Add the disclosure copy now, conditional on the env
   var, so it cannot ship un-disclosed later. If the var is unset, the disclosure does not
   render.

Do not add copy claiming price accuracy, freshness, or partnership status that isn't true
today.

---

## Out of scope — do not build

- Hotel or accommodation handoff of any kind
- Detail view / destination page
- Live or scheduled fare data (Indicative Prices API, Travelpayouts, cron refresh)
- Multiple flight providers, provider picker, or price comparison between providers
- Google Flights links
- Neighbourhood guidance
- Any change to ranking, scoring, weights, or the results grid ordering

If any of the above seems necessary to complete the task, stop and flag it rather than
building it.

---

## Definition of done

- [ ] `src/lib/links.js` exists and is the only place a Skyscanner URL is constructed
- [ ] Unit tests pass, covering the cases listed above
- [ ] Link renders on every result card that has a valid destination IATA
- [ ] Link opens in a new tab with `rel="noopener noreferrer"`
- [ ] Analytics event fires on click with the four properties listed
- [ ] Works with the partner ID env var both set and unset
- [ ] How It Works copy reconciled; affiliate disclosure added conditionally
- [ ] Manually verified: at least three generated links open the correct Skyscanner month
      calendar for the correct route
