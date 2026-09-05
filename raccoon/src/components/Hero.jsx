import { useState } from 'react'
import Header from './Header'
import NightSky from './NightSky'
import SearchBar from './SearchBar'
import OriginPicker from './OriginPicker'
import MobileSearch from './MobileSearch'
import { useMediaQuery } from '../lib/useMediaQuery'
import heroImg from '../assets/hero-mural.webp'

/**
 * Hero — the full-bleed, search-first band (handoff: menus/HIW/hero §5). The sky
 * and landmark mural run edge to edge with square corners; only the content —
 * header row, headline, subhead, search widget — stays in centred max-width
 * columns inside it. The header lives INSIDE the hero now, so it shares the sky
 * (no separate strip above to mismatch and no overflow clip on the H1).
 *
 * Two search UIs share this band, chosen by viewport (never both mounted):
 *  • Desktop (>720px) — the headline pitch + OriginPicker + SearchBar field grid.
 *    Origin lives here and is merged into the filters SearchBar submits.
 *  • Mobile (≤720px) — the MobileSearch sentence composer, which owns all five
 *    values (origin included) and hands the whole object to onSearch.
 * Either way the search flows through the seam and URL identically.
 */
export default function Hero({
  defaults,
  pending,
  onSearch,
  onNavigate,
  onHowItWorks,
  onHome,
}) {
  const [origin, setOrigin] = useState(defaults.origin)
  const isMobile = useMediaQuery('(max-width: 720px)')

  return (
    <section className="rc-hero">
      <NightSky />

      <Header onNavigate={onNavigate} onHowItWorks={onHowItWorks} onHome={onHome} />

      {isMobile ? (
        <MobileSearch defaults={defaults} pending={pending} onSearch={onSearch} />
      ) : (
        <div className="rc-hero__content">
          <h1 className="rc-hero__title">find somewhere to go</h1>
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

      {/* Mural — a transparent-sky panorama (real alpha): full-bleed to the left,
          right, and bottom edges at width:100% height:auto, uncropped. The sky is
          transparent, so the hero's own theme background (night sky / day gradient)
          shows through behind the landmarks — no fill or frame of its own. */}
      <div className="rc-hero__image" data-motion="1">
        <img src={heroImg} alt="" />
      </div>
    </section>
  )
}
