import { useEffect, useRef, useState } from 'react'
import NightSky from './NightSky'

/**
 * Blind — the "How it works" roller blind. Instead of routing to a separate
 * page, the header link lowers this over the top 80vh of the homepage while the
 * page behind it blurs (the blur + scroll-lock live in Home.jsx, which owns the
 * open state and the /how-it-works history entry). Metaphor: the homepage is a
 * window, this is the blind.
 *
 * The blind is always mounted so the drop can transition; `open` toggles the
 * `is-open` class that drives the transform. Two ways out: click the backdrop
 * (anywhere outside the panel) or hit "Find my trip" — both call `onClose`;
 * Escape and Back do too (Home.jsx). Clicking the "somewhere" mark resets to a
 * fresh homepage via `onHome`.
 *
 * Inside the panel the content explains the ranking engine and opens with a
 * compass-rose intro: a large, fast-spinning rose flies up-left into the header
 * slot to become the brand mark, and the copy rises in behind it. The intro is
 * pure CSS keyframes (see the rc-travel / rc-whirl / rc-rise / rc-fade rules in
 * index.css); it replays each time the blind opens by re-keying the scroll layer
 * (`introKey`), which also resets the internal scroll to the heading. The sky
 * layer sits outside that keyed subtree, so it never re-seeds or stalls on reopen.
 */

export default function Blind({ open, onClose, onHome }) {
  // Bumped false→true on each open so the scroll layer remounts: the CSS intro
  // replays from its delays and scrollTop resets to the heading for free. The sky
  // and scrim live outside this subtree, so they persist across reopens.
  const [introKey, setIntroKey] = useState(0)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) setIntroKey((k) => k + 1)
    wasOpen.current = open
  }, [open])

  // Clicking the "somewhere" mark resets to a clean homepage (Home.resetToHome).
  // Real anchor to "/", so middle-click / open-in-new-tab still work; plain
  // left-click resets in place instead of a full reload.
  const goHome = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onHome?.()
  }

  return (
    <>
      {/* Backdrop — a click anywhere outside the panel closes the blind. Only
          present while open, so a closed blind can't swallow clicks. It sits
          below the panel, so clicks on the panel itself don't reach it. */}
      {open && (
        <div className="rc-blind__backdrop" onClick={onClose} aria-hidden="true" />
      )}

      <div className={`rc-blind${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <div className="rc-blind__panel">
          {/* Sky + scrim sit outside the keyed scroll layer: fixed to the panel, so
              stars stay put as the copy scrolls and never re-seed on reopen. */}
          <div className="rc-blind__sky" aria-hidden="true">
            <NightSky starsOnly showMoon={false} fullField />
          </div>
          <div className="rc-blind__scrim" aria-hidden="true" />

          {/* Re-keyed on each open: replays the intro + resets scroll to the top. */}
          <div className="rc-blind__scroll" key={introKey}>
            {/* Radial glow under the rose; a transient one-shot that fades out. Kept
                a direct child of the scroll viewport so it's viewport-height, not
                content-height (the radial anchor stays near the top). */}
            <div className="rc-blind__glow" data-motion="transient" aria-hidden="true" />

            {/* Width-capped reading column; the absolute overlays below anchor to it
                so they align with the content inset on wide screens. */}
            <div className="rc-blind__page">
              {/* The single traveling mark: starts large + centred + spinning, flies
                  up-left to rest at 30px in the header slot and becomes the wordmark.
                  It's the home link — clicking it resets to a fresh homepage. */}
              <a
                href="/"
                className="rc-blind__brand"
                data-motion="1"
                onClick={goHome}
                aria-label="somewhere — back to homepage"
              >
                <svg
                  viewBox="0 0 100 100"
                  width="30"
                  height="30"
                  className="rc-blind__rose"
                  data-motion="1"
                  aria-hidden="true"
                >
                  <path d="M50 6 L39 39 L50 50 Z" fill="#7BC9B8" />
                  <path d="M50 6 L61 39 L50 50 Z" fill="#4B9A89" />
                  <path d="M97 50 L61 39 L50 50 Z" fill="#F2B65C" />
                  <path d="M97 50 L61 61 L50 50 Z" fill="#D8912C" />
                  <path d="M50 94 L61 61 L50 50 Z" fill="#D25E46" />
                  <path d="M50 94 L39 61 L50 50 Z" fill="#F28E78" />
                  <path d="M3 50 L39 61 L50 50 Z" fill="#8C71B6" />
                  <path d="M3 50 L39 39 L50 50 Z" fill="#BCA3DF" />
                </svg>
                <span className="rc-blind__wordmark" data-motion="1">somewhere</span>
              </a>

              {/* Close (X), top-right — the primary dismiss control, alongside
                  Escape, click-outside, and the CTA. */}
              <button
                type="button"
                className="rc-blind__close"
                data-motion="1"
                onClick={onClose}
                aria-label="Close How it works"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path
                    d="M6 6 L18 18 M18 6 L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <div className="rc-blind__content">
                {/* Intro block above the numbered sections. Heading uppercased via
                    CSS; sentence-case in markup for readers. */}
                <div className="rc-blind__intro" data-motion="1" style={{ animationDelay: '1.55s' }}>
                  <h2 className="rc-blind__h1">How it works</h2>
                </div>

                {/* One column of full-width numbered sections; the 96px spine holds
                    the section number (handoff §2.1). */}
                <section className="rc-blind__section" data-motion="1" style={{ animationDelay: '1.8s' }}>
                  <div className="rc-blind__num">01</div>
                  <div className="rc-blind__col">
                    <h3 className="rc-blind__section-title">What you give us</h3>
                    <p className="rc-blind__body">
                      You define the trip, not the destination: what you&rsquo;re
                      willing to spend, how long you want to go, when you want to go,
                      and how you want to stay.
                    </p>
                  </div>
                </section>

                <section className="rc-blind__section rc-blind__section--wide" data-motion="1" style={{ animationDelay: '1.9s' }}>
                  <div className="rc-blind__num">02</div>
                  <div className="rc-blind__col">
                    <h3 className="rc-blind__section-title">Every destination gets a price</h3>
                    <p className="rc-blind__body">
                      <em>somewhere</em> costs each destination against your criteria.
                    </p>
                    <div className="rc-blind__formula">
                      {'trip cost = '}<span className="rc-blind__var">airfare</span>{'\n'}
                      {'          + ('}<span className="rc-blind__var">nightly rate</span>{' × nights)\n'}
                      {'          + ('}<span className="rc-blind__var">ground</span>{' × nights)'}
                    </div>
                    <p className="rc-blind__body">
                      Each component is a range, so the total is a range. Nothing is
                      filtered at this stage &mdash; everything gets priced.
                    </p>
                    <div className="rc-blind__formula rc-blind__formula--muted">
                      {'low  = fare_low  + (rate_low  × n) + (ground_low  × n)\n'}
                      {'high = fare_high + (rate_high × n) + (ground_high × n)'}
                    </div>
                  </div>
                </section>

                <section className="rc-blind__section rc-blind__section--wide" data-motion="1" style={{ animationDelay: '2s' }}>
                  <div className="rc-blind__num">03</div>
                  <div className="rc-blind__col">
                    <h3 className="rc-blind__section-title">Every price gets a score</h3>
                    <p className="rc-blind__body rc-blind__body--wide">
                      Cost alone is a blunt instrument &mdash; the cheapest place in a
                      monsoon is not the best answer. <em>somewhere</em> scores each
                      destination on weighted components:
                    </p>
                    <div className="rc-blind__score-formula">
                      {'score = 100 × ( '}
                      <span className="rc-blind__w-headroom">0.444</span>{' × headroom  +  '}
                      <span className="rc-blind__w-weather">0.389</span>{' × weather  +  '}
                      <span className="rc-blind__w-flight">0.167</span>{' × flight )'}
                    </div>
                    <div className="rc-blind__cols">
                      <div className="rc-blind__col-card rc-blind__col-card--headroom">
                        <h4 className="rc-blind__col-title">Headroom</h4>
                        <p className="rc-blind__col-desc">
                          How comfortably the trip fits, not merely whether it does.
                        </p>
                        <div className="rc-blind__mono">
                          clamp( (budget &minus; trip_typical) / (0.25 &times; budget) , 0 , 1 )
                        </div>
                        <div className="rc-blind__bars">
                          <div className="rc-blind__bar-row">
                            <span>$1,500 of $2,000 &mdash; comfortable</span>
                            <span className="rc-blind__bar-val">1.00</span>
                          </div>
                          <div className="rc-blind__bar-track">
                            <div className="rc-blind__bar-fill" style={{ width: '100%' }} />
                          </div>
                          <div className="rc-blind__bar-row">
                            <span>$1,800 of $2,000 &mdash; getting tight</span>
                            <span className="rc-blind__bar-val">0.40</span>
                          </div>
                          <div className="rc-blind__bar-track">
                            <div className="rc-blind__bar-fill" style={{ width: '40%' }} />
                          </div>
                          <div className="rc-blind__bar-row">
                            <span>$1,980 of $2,000 &mdash; scraping the bottom</span>
                            <span className="rc-blind__bar-val">0.04</span>
                          </div>
                          <div className="rc-blind__bar-track">
                            <div className="rc-blind__bar-fill rc-blind__bar-fill--over" style={{ width: '4%' }} />
                          </div>
                          <span className="rc-blind__bar-caption">
                            Room to be comfortable, not the cheapest &mdash; among trips you
                            can afford, fit decides.
                          </span>
                        </div>
                      </div>
                      <div className="rc-blind__col-card rc-blind__col-card--weather">
                        <h4 className="rc-blind__col-title">Weather</h4>
                        <p className="rc-blind__col-desc">
                          Temperature and rainfall for the month you picked. Cheap and
                          warm loses to cheap, warm, and dry.
                        </p>
                      </div>
                      <div className="rc-blind__col-card rc-blind__col-card--flight">
                        <h4 className="rc-blind__col-title">Flight</h4>
                        <div className="rc-blind__mono">w_flight → 0   when no cap is set</div>
                        <p className="rc-blind__col-desc">
                          If you haven&rsquo;t capped travel time, a long flight isn&rsquo;t
                          a fault. The weight redistributes across the other components.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rc-blind__section rc-blind__section--wide" data-motion="1" style={{ animationDelay: '2.1s' }}>
                  <div className="rc-blind__num">04</div>
                  <div className="rc-blind__col">
                    <h3 className="rc-blind__section-title">Two rules that override raw score</h3>
                    <div className="rc-blind__rules-grid">
                      <div className="rc-blind__rule">
                        <h4 className="rc-blind__rule-title">Over budget is demoted, not deleted.</h4>
                        <p className="rc-blind__body">
                          Anything up to 15% above your number still appears, tagged with
                          the overage, ranked beneath everything that fits. The penalty
                          scales with distance:
                        </p>
                        <div className="rc-blind__formula rc-blind__formula--over">
                          {'score_final = − (overage / budget)\n'}
                          {'where overage ≤ 0.15 × budget'}
                        </div>
                        <p className="rc-blind__body">
                          A trip $40 over is worth your attention. One $600 over is not.
                          The gap between them should be visible, not hidden.
                        </p>
                      </div>
                      <div className="rc-blind__rule">
                        <h4 className="rc-blind__rule-title">No region dominates.</h4>
                        <p className="rc-blind__body">
                          Sorted purely by score, a cheap search returns the same answer
                          five times &mdash; five Caribbean beaches, technically correct,
                          practically useless. <em>somewhere</em> caps how many results
                          come from any one region.
                        </p>
                        <p className="rc-blind__body">
                          You get a shortlist you could genuinely choose between. Open any
                          row for the full breakdown, or drop the cap and see the raw
                          ranking.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Footer — honesty notes + amber CTA (wired to onClose, as today).
                    Three things every result card now implies get spelled out
                    here: the numbers are estimates, the outbound link hands off
                    to a calendar (not a fare), and — only when the site actually
                    carries one — that the link is an affiliate link. */}
                <div className="rc-blind__footer" data-motion="1" style={{ animationDelay: '2.2s' }}>
                  <div className="rc-blind__footer-notes">
                    <span className="rc-blind__footer-note">
                      Estimates are always shown as ranges &mdash; they come from a
                      curated dataset we hand-built, not a live fare feed.
                    </span>
                    <span className="rc-blind__footer-note">
                      &ldquo;See fares&rdquo; sends you to a Skyscanner month-price
                      calendar, where you pick your own dates. <em>somewhere</em>{' '}
                      doesn&rsquo;t choose dates or fares on your behalf.
                    </span>
                    {import.meta.env.VITE_SKYSCANNER_PARTNER_ID && (
                      <span className="rc-blind__footer-note">
                        That link is an affiliate link &mdash; we may earn a
                        commission if you book through it, at no extra cost to you.
                      </span>
                    )}
                  </div>
                  <button type="button" className="rc-blind__cta-btn" onClick={onClose}>
                    Find my trip &rarr;
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Scroll fade — cues that the panel scrolls (content used to cut mid-
              heading at the bottom edge). Decorative, pointer-events:none, so it
              never intercepts a click or hides the last focusable element; the
              footer's bottom padding clears it (handoff §2.6). */}
          <div className="rc-blind__fade" aria-hidden="true" />
        </div>
      </div>
    </>
  )
}
