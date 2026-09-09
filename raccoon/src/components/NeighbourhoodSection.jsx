import { useState } from 'react'
import { guideKind } from '../lib/neighbourhoodVocab'
import { CompactCityBand } from './neighbourhoodParts'
import DestinationDetail from './DestinationDetail'
import NeighbourhoodModule from './NeighbourhoodGuide'
import { useNeighbourhoodState } from '../lib/useNeighbourhoodState'

/**
 * The two-step neighbourhood interaction, in order:
 *
 *   1. the chip expands this section INLINE inside the result tile — a preview
 *      with the map, the lean filters and the area panel;
 *   2. only an explicit "Full screen" click opens the detail overlay.
 *
 * Both steps read one `useNeighbourhoodState`, so going full screen carries the
 * reader's selection and filters across instead of resetting them, and either
 * view can drive both maps.
 *
 * Minimal-tier cities have no map, so their inline step is the editorial band
 * with a collapse control and no full-screen affordance — there is nothing a
 * larger canvas would add.
 */
export default function NeighbourhoodSection({ city, result, onCollapse }) {
  const [fsOpen, setFsOpen] = useState(false)
  const kind = guideKind(city)
  // Hooks run unconditionally; a minimal city simply never reads the result.
  const state = useNeighbourhoodState(city)

  if (kind === 'minimal') {
    return (
      <div className="rc-nb rc-nb--inline rc-nb--band">
        <div className="rc-nb__bar">
          <span className="rc-nb__bar-title">Where to stay</span>
          <span className="rc-nb__bar-spacer" />
          <button type="button" className="rc-nb__barbtn" onClick={onCollapse}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
            Collapse
          </button>
        </div>
        <CompactCityBand note={city.note} />
      </div>
    )
  }

  if (kind !== 'full') return null

  return (
    <>
      <NeighbourhoodModule
        city={city}
        cityName={result.city}
        state={state}
        variant="inline"
        onFullscreen={() => setFsOpen(true)}
        onCollapse={onCollapse}
      />
      {fsOpen && (
        <DestinationDetail result={result} state={state} onClose={() => setFsOpen(false)} />
      )}
    </>
  )
}
