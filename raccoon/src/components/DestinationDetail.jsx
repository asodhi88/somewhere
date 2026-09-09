import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { moneyRange } from '../lib/format'
import { getNeighbourhoods } from '../lib/getNeighbourhoods'
import { guideKind } from '../lib/neighbourhoodVocab'
import { CompactCityBand } from './neighbourhoodParts'
import NeighbourhoodModule from './NeighbourhoodGuide'
import { useNeighbourhoodState } from '../lib/useNeighbourhoodState'

/**
 * DestinationDetail — a deliberately thin per-city overlay: hero, cost header,
 * the neighbourhood module, and a close button. It exists only to give the
 * module somewhere to live until the routed /destination/:id view is built (a
 * separate unit of work), so it stays a presentation shell — no breakdown, no
 * month strip, no hand-off. The module reads only from getNeighbourhoods(), so
 * it moves into that view later unchanged.
 *
 * Portalled to <body>: .rc-card carries a backdrop-filter, which makes it the
 * containing block for position:fixed descendants — rendered in place, the
 * overlay would be trapped inside the card and scroll with it. Same trap the
 * how-it-works blind avoids by being a sibling of .rc-app.
 */
export default function DestinationDetail({ result, state, onClose }) {
  const closeRef = useRef(null)
  const city = getNeighbourhoods(result.id)
  const kind = guideKind(city)
  const img = result.hero_image
  const { cost } = result
  // Normally handed the inline section's state so the two views agree; falls
  // back to its own when opened standalone (e.g. from a future routed view).
  const ownState = useNeighbourhoodState(city ?? { areas: [] })
  const mapState = state ?? ownState

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div
      className="rc-detail"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${result.city} — where to stay`}
    >
      <div className="rc-detail__inner" onClick={(e) => e.stopPropagation()}>
        <header className="rc-detail__head">
          <div className="rc-detail__hero">
            {img?.url ? (
              <img className="rc-detail__hero-img" src={img.url} alt={`${result.city}, ${result.country}`} />
            ) : (
              <span className="rc-detail__hero-fallback">{result.region}</span>
            )}
          </div>
          <div className="rc-detail__titles">
            <h2 className="rc-detail__city">{result.city}</h2>
            <span className="rc-detail__country">{result.country}</span>
          </div>
          {cost && (
            <div className="rc-detail__cost">
              <span className="rc-detail__cost-range tnum">{moneyRange(cost.low, cost.high)}</span>
              <span className="rc-detail__cost-note">whole-trip range</span>
            </div>
          )}
          <button
            ref={closeRef}
            type="button"
            className="rc-detail__close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>

        {/* A city with no entry, or tier "none", renders no module at all and
            leaves the rest of the overlay untouched. */}
        {kind === 'full' && (
          <NeighbourhoodModule
            city={city}
            cityName={result.city}
            state={mapState}
            variant="overlay"
          />
        )}
        {kind === 'minimal' && <CompactCityBand note={city.note} />}
      </div>
    </div>,
    document.body,
  )
}
