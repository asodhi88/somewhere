import { useState } from 'react'
import NightSky from './NightSky'
import SearchBar from './SearchBar'
import OriginPicker from './OriginPicker'
import MobileSearch from './MobileSearch'
import { useMediaQuery } from '../lib/useMediaQuery'
import heroImg from '../assets/mural-cutout.png'

/**
 * Hero — the search-first panel: night sky behind, the pitch stacked in the
 * upper middle, then the origin control + search bar as one left-aligned group,
 * and the landmark mural dropping to a quiet horizon band beneath it.
 *
 * Two search UIs share this panel, chosen by viewport (never both mounted):
 *  • Desktop (>720px) — the headline pitch + OriginPicker + SearchBar field grid.
 *    Origin lives here and is merged into the filters SearchBar submits.
 *  • Mobile (≤720px) — the MobileSearch sentence composer, which owns all five
 *    values (origin included) and hands the whole object to onSearch.
 * Either way the search flows through the seam and URL identically.
 */
export default function Hero({ defaults, pending, onSearch }) {
  const [origin, setOrigin] = useState(defaults.origin)
  const isMobile = useMediaQuery('(max-width: 720px)')

  return (
    <section className="rc-hero">
      <NightSky />

      {isMobile ? (
        <MobileSearch defaults={defaults} pending={pending} onSearch={onSearch} />
      ) : (
        <div className="rc-hero__content">
          <h1 className="rc-hero__title">Find somewhere to go</h1>
          <p className="rc-hero__sub">
            Set your budget, month, and stay tier — we find places by what the
            whole trip costs.
          </p>

          <div className="rc-searchgroup">
            <OriginPicker value={origin} onChange={setOrigin} />
            <SearchBar
              defaults={defaults}
              pending={pending}
              onSearch={(fields) => onSearch({ ...fields, origin })}
            />
          </div>
        </div>
      )}

      <div className="rc-hero__image" data-motion="1">
        <img src={heroImg} alt="" />
      </div>
    </section>
  )
}
