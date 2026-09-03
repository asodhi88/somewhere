import { useState } from 'react'
import { track } from '@vercel/analytics'
import {
  moneyRange,
  flightMeta,
  weatherChip,
  overTag,
  rankLabel,
} from '../lib/format'
import { buildFlightSearchUrl, resolveSearchMonth } from '../lib/links'
import { MONTH_OPTIONS } from '../lib/searchState'

// Unsplash's API guidelines: credit the photographer with a link back to their
// profile, and link to Unsplash, both tagged with our utm_source.
const UTM = '?utm_source=somewhere&utm_medium=referral'

/**
 * ResultCard — one ranked destination as a glass tile matching the search widget
 * (handoff: menus/HIW/hero §3), so a result reads as the answer to the widget
 * above it. Three columns: the hero image flush to the left edge, the body
 * (city / country / reason / fact chips), and a price rail whose range is the
 * dominant number (CLAUDE.md §3, §6.2). The rail's toggle opens the flight / stay
 * / ground breakdown, which sits in the body column beneath the chips. The open
 * state is the tile's one accent — border ring, soft glow, and an accent-tinted
 * rail — never more than one per card.
 *
 * The photo cell renders the destination's hand-picked Unsplash hero when
 * `hero_image` is present, with required attribution; when it's null (the whole
 * v1 dataset today, §5) it falls back to the designed placeholder texture.
 */
export default function ResultCard({ result, nights, originIata, month, index = 0, onOpenLightbox }) {
  const [open, setOpen] = useState(false)
  const { cost } = result
  const reason = result.blurb || result.reason
  const img = result.hero_image
  const hasImg = !!(img && img.url)

  // The one outbound action a card offers (flight-handoff-task.md). null
  // means required inputs are missing or the month can't be resolved — in
  // that case render nothing, no disabled state.
  const flightUrl = buildFlightSearchUrl({
    originIata,
    destinationIata: result.airport,
    month,
    nights,
  })

  const monthName = MONTH_OPTIONS.find((o) => o.value === month)?.name

  const handleFlightClick = () => {
    track('flight_handoff', {
      destination: result.id,
      origin: originIata,
      month: resolveSearchMonth(month),
      rank: result.rank,
    })
  }

  return (
    // data-motion opts the card into the reduced-motion still; the per-card
    // delay staggers the rise-in (170ms step, matching the design handoff).
    <article
      className="rc-card"
      data-motion="1"
      data-open={open ? 'true' : 'false'}
      style={{ animationDelay: `${index * 0.17}s` }}
    >
      <div className={`rc-card__photo${hasImg ? ' rc-card__photo--image' : ''}`}>
        {hasImg ? (
          <>
            <img
              className="rc-card__photo-img"
              src={img.url}
              alt={`${result.city}, ${result.country}`}
              loading="lazy"
            />
            <div className="rc-card__scrim" aria-hidden="true" />
            <button
              type="button"
              className="rc-card__enlarge"
              aria-label={`Enlarge photo of ${result.city}`}
              onClick={() =>
                onOpenLightbox({
                  url: img.url,
                  photographer: img.photographer,
                  profile_url: img.profile_url,
                  city: result.city,
                  country: result.country,
                })
              }
            />
            <span className="rc-card__attr">
              {img.photographer ? (
                <>
                  {img.profile_url ? (
                    <a href={img.profile_url + UTM} target="_blank" rel="noreferrer noopener">
                      {img.photographer}
                    </a>
                  ) : (
                    img.photographer
                  )}
                  {' / '}
                </>
              ) : null}
              <a href={'https://unsplash.com/' + UTM} target="_blank" rel="noreferrer noopener">
                Unsplash
              </a>
            </span>
          </>
        ) : (
          <span className="rc-card__region">{result.region}</span>
        )}
        <span className="rc-card__rank tnum">{rankLabel(result.rank)}</span>
      </div>

      <div className="rc-card__body">
        <div className="rc-card__heading">
          <span className="rc-card__city">{result.city}</span>
          <span className="rc-card__country">{result.country}</span>
          {/* On phones the price collapses onto the title line; the desktop rail
              price is display:none there, so exactly one price is in the a11y tree
              at each width. */}
          <span className="rc-card__price-inline tnum">
            {moneyRange(cost.low, cost.high)}
          </span>
        </div>
        <p className="rc-card__reason">{reason}</p>
        <div className="rc-chips tnum">
          {result.overBudget && (
            <span className="rc-chip rc-chip--over">{overTag(result.overBy)}</span>
          )}
          <span className="rc-chip">{flightMeta(result.flight)}</span>
          <span className="rc-chip">{weatherChip(result.weather)}</span>
          {/* Visa chip intentionally omitted: visa scoring is disabled (see
              WEIGHTS in ranking.js); restore once passport-aware data lands
              from the Sherpa Requirements API. */}
        </div>

        {/* The card's one outbound action — a month-price calendar, not a fare
            (flight-handoff-task.md §3). Visually secondary to the city name and
            price above; never rendered when buildFlightSearchUrl can't resolve
            a valid link. */}
        {flightUrl && (
          <a
            className="rc-card__handoff"
            href={flightUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleFlightClick}
          >
            See fares for {monthName || 'this month'}
            <span className="rc-card__handoff-arrow" aria-hidden="true">↗</span>
          </a>
        )}

        {/* Breakdown lives in the body column, beneath the chips — aligned to the
            text, never under the image. */}
        {open && (
          <div className="rc-card__breakdown">
            <div className="rc-break">
              <span className="rc-break__label">Flight</span>
              <span className="rc-break__value tnum">
                {moneyRange(cost.breakdown.flight.low, cost.breakdown.flight.high)}
              </span>
            </div>
            <div className="rc-break">
              <span className="rc-break__label">Stay · {nights} nights</span>
              <span className="rc-break__value tnum">
                {moneyRange(cost.breakdown.stay.low, cost.breakdown.stay.high)}
              </span>
            </div>
            <div className="rc-break">
              <span className="rc-break__label">On the ground</span>
              <span className="rc-break__value tnum">
                {moneyRange(cost.breakdown.ground.low, cost.breakdown.ground.high)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="rc-card__rail">
        <span className="rc-price__range tnum">{moneyRange(cost.low, cost.high)}</span>
        <button
          type="button"
          className="rc-card__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'hide breakdown' : 'see breakdown'}
        </button>
      </div>
    </article>
  )
}
