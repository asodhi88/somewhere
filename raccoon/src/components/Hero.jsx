import { useCallback, useState } from 'react'
import Header from './Header'
import NightSky from './NightSky'
import SearchBar from './SearchBar'
import OriginPicker from './OriginPicker'
import MobileSearch from './MobileSearch'
import AskPanel from './AskPanel'
import AskSummary, { AskFailure } from './AskSummary'
import { resolveExample } from '../lib/askExamples'
import { readParse } from '../lib/askNotes'
import { requestParse } from '../lib/askClient'
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
 * Scout (Ask somewhere design 1c) is an alternate way IN to that same form, not
 * an alternate search. Hero owns the whole flow because the pieces outlive each
 * other: the panel opens in the widget's own shell and closes again, while the
 * "Read as" card and the banners stay above the form it filled. Nothing here
 * ranks or prices — the traveller still presses the same
 * amber button, and that button is still the loudest thing in the band.
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
  // Scout's state: the panel, the reading it produced, and the last failure.
  const [askOpen, setAskOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState('')
  // { query, parse, read } — the reading currently standing over the form.
  const [ask, setAsk] = useState(null)
  // Bumped on each fill so the form re-mounts, reseeds, and replays its rings.
  const [askKey, setAskKey] = useState(0)
  // True once a search has actually run on Scout's values. The origin's
  // "assumed · tap to change" tag is a prompt to correct something BEFORE
  // searching; once the traveller has looked at it and searched anyway, it has
  // served its purpose and keeping it on screen just nags.
  const [searchRan, setSearchRan] = useState(false)
  const [originTouched, setOriginTouched] = useState(false)
  const isMobile = useMediaQuery('(max-width: 720px)')

  const applyReading = useCallback((query, parse) => {
    // The query goes in too: the party disclosure falls back to the raw sentence
    // when the model omits the party wording from `unused`, which it does often
    // enough to matter (see askNotes.js).
    const read = readParse(parse, query)
    setAsk({ query, parse, read })
    setOrigin(read.filters.origin)
    setOriginTouched(false)
    setAskError('')
    setAskOpen(false)
    setAsking(false)
    setSearchRan(false) // a new reading brings its assumptions back with it
    setAskKey((k) => k + 1)
  }, [])

  // A curated example is verified up front (src/lib/askExamples.js), so it fills
  // the form with no request, no cost, and no chance of a bad parse.
  const useExample = useCallback(
    (example) => applyReading(example.query, resolveExample(example)),
    [applyReading],
  )

  const runAsk = useCallback(
    async (query) => {
      setAsking(true)
      setAskError('')
      const { parse, error } = await requestParse(query)
      if (parse) return applyReading(query, parse)
      // A failure leaves the form untouched and closes the panel with one
      // neutral line above it. Any earlier reading stays: it still describes the
      // values sitting in the form.
      setAsking(false)
      setAskOpen(false)
      setAskError(error)
    },
    [applyReading],
  )

  const openAsk = useCallback(() => {
    setAskError('')
    setAskOpen(true)
  }, [])

  const clearAsk = useCallback(() => {
    setAsk(null)
    setAskError('')
    setSearchRan(false)
    setAskKey((k) => k + 1)
  }, [])

  const chooseOrigin = useCallback((value) => {
    setOriginTouched(true)
    setOrigin(value)
  }, [])

  // Every search — from either composer — retires the origin's assumed tag.
  const runSearch = useCallback(
    (fields) => {
      setSearchRan(true)
      onSearch(fields)
    },
    [onSearch],
  )

  // The form's starting values: Scout's reading once it has filled the form,
  // otherwise whatever Home resolved from the URL (or the blank composer).
  const seed = ask ? ask.read.filters : defaults
  const askFilled = ask ? ask.read.filled : []
  // Fields the form filled itself are no longer disclosed per field — the
  // per-field "assumed, tap to change" notes are gone (and with them
  // `read.fieldNotes`). The `.is-ai` rings on fields Scout read from the
  // traveller's own words stay: those are a record of what happened.
  //
  // Origin sits outside the form, so its own disclosures resolve here. Its
  // "assumed · tap to change" tag retires once a search has run; "from your
  // words" and "adjusted" do not — they describe what became of the value, and
  // "adjusted" in particular is half of the origin-fallback disclosure.
  const originAssumed = !!ask?.read.assumed.includes('origin')
  const originTag =
    originTouched || (searchRan && originAssumed) ? null : ask?.read.originTag || null
  // The accent ring goes on an origin Scout actually set or adjusted — not on
  // one the form defaulted to, which the tag calls "assumed" instead.
  const originRing = !!originTag && !originAssumed

  const summary = ask && !askOpen && (
    <AskSummary
      query={ask.query}
      parse={ask.parse}
      notes={ask.read.notes}
      onEdit={openAsk}
      onClear={clearAsk}
    />
  )
  const failure = askError && !askOpen && (
    <AskFailure message={askError} onRetry={openAsk} />
  )

  return (
    <section className="rc-hero">
      <NightSky />

      <Header onNavigate={onNavigate} onHowItWorks={onHowItWorks} onHome={onHome} />

      {isMobile ? (
        <MobileSearch
          key={askKey}
          defaults={seed}
          pending={pending}
          onSearch={runSearch}
          askFilled={askFilled}
          askOpen={askOpen}
          asking={asking}
          askQuery={ask?.query || ''}
          summary={summary}
          failure={failure}
          onAskOpen={openAsk}
          onAskClose={() => setAskOpen(false)}
          onAskSubmit={runAsk}
          onAskExample={useExample}
        />
      ) : (
        <div className="rc-hero__content">
          <h1 className="rc-hero__title">find somewhere to go</h1>
          <p className="rc-hero__sub">
            Set your budget, month, and stay tier — we find places by what the
            whole trip costs.
          </p>

          <div className="rc-searchgroup">
            {summary}
            {failure}

            <OriginPicker
              value={origin}
              onChange={chooseOrigin}
              tag={originTag}
              ring={originRing}
              // The entry button is the way in until a reading exists; after
              // that the "Read as" card is (tap to edit), and the row shows what
              // Scout did to the origin instead.
              onAsk={ask ? null : openAsk}
              askActive={askOpen}
            />

            <div className="rc-ask-host">
              {/* The form is never unmounted while the panel is open, so a
                  half-typed budget survives a trip through Scout. */}
              <div className={`rc-ask-host__form${askOpen ? ' is-hidden' : ''}`}>
                <SearchBar
                  key={askKey}
                  defaults={seed}
                  pending={pending}
                  onSearch={(fields) => runSearch({ ...fields, origin })}
                  askFilled={askFilled}
                />
              </div>
              {askOpen && (
                <AskPanel
                  initialQuery={ask?.query || ''}
                  loading={asking}
                  onSubmit={runAsk}
                  onClose={() => setAskOpen(false)}
                  onUseExample={useExample}
                />
              )}
            </div>
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
