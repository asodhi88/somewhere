import { useCallback, useState } from 'react'
import Header from './Header'
import NightSky from './NightSky'
import SearchBar from './SearchBar'
import OriginPicker from './OriginPicker'
import MobileSearch from './MobileSearch'
import AskBox from './AskBox'
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
 *
 * Scout (AskBox) sits below whichever form is mounted, as an alternate way IN to
 * that same form — not an alternate search. It hands up a parse; Hero seeds the
 * form from it and re-keys the form so the new values mount with their
 * highlight. Nothing about the search path changes: the traveller still presses
 * the same amber button, and the amber button is still the loudest thing here.
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
  // The last parse Scout applied, or null when the traveller is driving the form
  // themselves. `askKey` re-mounts the form on each fill so it reseeds and the
  // highlight replays.
  const [ask, setAsk] = useState(null)
  const [askKey, setAskKey] = useState(0)
  // Origin lives outside the form on desktop, so its "assumed" note is retired
  // here rather than in SearchBar.
  const [originTouched, setOriginTouched] = useState(false)
  const isMobile = useMediaQuery('(max-width: 720px)')

  const applyAsk = useCallback((read) => {
    setOrigin(read.filters.origin)
    setOriginTouched(false)
    setAsk(read)
    setAskKey((k) => k + 1)
  }, [])

  const chooseOrigin = useCallback((value) => {
    setOriginTouched(true)
    setOrigin(value)
  }, [])

  // The form's starting values: Scout's parse once it has filled the form,
  // otherwise whatever Home resolved from the URL (or the blank composer).
  const seed = ask ? ask.filters : defaults
  const askFilled = ask ? ask.filled : []
  const askNotes = ask ? ask.fieldNotes : {}
  const originNote = originTouched ? null : askNotes.origin || null
  // Origin is not one of SearchBar's fields, so its highlight is applied here.
  const originSetByAsk = !originTouched && askFilled.includes('origin')

  const scout = <AskBox onApply={applyAsk} />

  return (
    <>
    <section className="rc-hero">
      <NightSky />

      <Header onNavigate={onNavigate} onHowItWorks={onHowItWorks} onHome={onHome} />

      {isMobile ? (
        <MobileSearch
          key={askKey}
          defaults={seed}
          pending={pending}
          onSearch={onSearch}
          askFilled={askFilled}
          askNotes={askNotes}
        />
      ) : (
        <div className="rc-hero__content">
          <h1 className="rc-hero__title">find somewhere to go</h1>
          <p className="rc-hero__sub">
            Set your budget, month, and stay tier — we find places by what the
            whole trip costs.
          </p>

          <div className="rc-searchgroup">
            <OriginPicker
              value={origin}
              onChange={chooseOrigin}
              note={originNote}
              highlight={originSetByAsk}
            />
            <SearchBar
              key={askKey}
              defaults={seed}
              pending={pending}
              onSearch={(fields) => onSearch({ ...fields, origin })}
              askFilled={askFilled}
              askNotes={askNotes}
            />
            <div className="rc-hero__ask">{scout}</div>
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

    {/* On the phone the hero is a full-height panel with the mural pinned behind
        the CTA, so Scout can't hang off the bottom of it without the mural
        floating over the box. It becomes its own band directly under the hero
        instead — the first thing past the fold, still feeding the same form. */}
    {isMobile && <div className="rc-askband">{scout}</div>}
    </>
  )
}
