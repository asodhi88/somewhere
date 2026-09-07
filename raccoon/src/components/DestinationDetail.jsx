import { useEffect, useRef } from 'react'
import { getNeighbourhoods } from '../lib/getNeighbourhoods'
import NeighbourhoodGuide from './NeighbourhoodGuide'

/**
 * DestinationDetail — a lightweight per-city overlay (same modal pattern as the
 * Lightbox: mounted only while open, dismissed by backdrop / Escape / close
 * button, page scroll locked). It is NOT the full routed detail view from the
 * backlog — it exists so the neighbourhood module has a real home to render in
 * for the seed cities. Its only content today is the city header + the
 * NeighbourhoodGuide module; cost breakdown, month strip and flight hand-off are
 * out of scope for this PR.
 */
export default function DestinationDetail({ result, onClose }) {
  const closeRef = useRef(null)
  const city = getNeighbourhoods(result.id)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      className="rc-detail"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${result.city} — where to stay`}
    >
      <div className="rc-detail__inner" onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeRef}
          type="button"
          className="rc-detail__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <header className="rc-detail__head">
          <span className="rc-detail__eyebrow">Where to stay</span>
          <h2 className="rc-detail__city">{result.city}</h2>
          <span className="rc-detail__country">{result.country}</span>
        </header>

        <NeighbourhoodGuide city={city} />
      </div>
    </div>
  )
}
