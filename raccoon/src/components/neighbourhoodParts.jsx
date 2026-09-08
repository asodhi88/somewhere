import { LEAN } from '../lib/neighbourhoodVocab'

/**
 * The light half of neighbourhood guidance: the two pieces a result card may
 * render eagerly. Kept separate from NeighbourhoodGuide.jsx so importing these
 * from ResultCard does NOT drag MapLibre + pmtiles into the main bundle — the
 * map half is lazy-loaded only when a card's map is actually opened.
 */

/** The card chip that opens the inline map. Sits in the card's fact-chip row. */
export function NeighbourhoodChip({ open, onClick, id }) {
  return (
    <button
      type="button"
      className={`rc-chip rc-chip--nb${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-controls={id}
      onClick={onClick}
    >
      <span className="rc-chip__swatch" aria-hidden="true" />
      neighbourhoods
    </button>
  )
}

/**
 * Minimal tier — a designed editorial band that owns the absence as a judgment
 * ("you don't need to juggle neighbourhoods here"), carrying the same visual
 * weight as a real module. Never a skeleton or "no data" state.
 */
export function CompactCityBand({ note }) {
  return (
    <div className="rc-nb__compact">
      <svg width="46" height="46" viewBox="0 0 46 46" fill="none" aria-hidden="true" className="rc-nb__compact-mark">
        <circle cx="23" cy="23" r="21" stroke={LEAN.below.ink} strokeWidth="1.5" strokeOpacity="0.45" />
        <circle cx="23" cy="23" r="13" stroke={LEAN.below.ink} strokeWidth="1.5" strokeOpacity="0.65" />
        <circle cx="23" cy="23" r="4.5" fill={LEAN.below.color} />
      </svg>
      <div className="rc-nb__compact-body">
        <p className="rc-nb__compact-title">Compact destination — stay in the central core.</p>
        <p className="rc-nb__compact-text">{note}</p>
      </div>
    </div>
  )
}
