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
 * `is-open` class that drives the transform and the cord fade-in. A pull-cord
 * hangs below the bottom edge — click it, drag it up past the threshold, hit the
 * CTA, Escape, or Back all close it.
 *
 * Inside the panel the content explains the ranking engine and opens with a
 * compass-rose intro: a large, fast-spinning rose flies up-left into the header
 * slot to become the brand mark, and the copy rises in behind it. The intro is
 * pure CSS keyframes (see the rc-travel / rc-whirl / rc-rise / rc-fade rules in
 * index.css); it replays each time the blind opens by re-keying the scroll layer
 * (`introKey`), which also resets the internal scroll to the heading. The sky
 * layer sits outside that keyed subtree, so it never re-seeds or stalls on reopen.
 */

// How far up (as a fraction of the blind's height) a drag must travel to close.
const CLOSE_FRACTION = 0.18

export default function Blind({ open, onClose, cordHintSeen }) {
  const blindRef = useRef(null)
  // Live drag transients — a ref so pointer moves never re-render (README §State).
  const dragRef = useRef(null)
  // Bumped false→true on each open so the scroll layer remounts: the CSS intro
  // replays from its delays and scrollTop resets to the heading for free. The sky
  // and scrim live outside this subtree, so they persist across reopens.
  const [introKey, setIntroKey] = useState(0)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) setIntroKey((k) => k + 1)
    wasOpen.current = open
  }, [open])

  // Drag-to-close. pointerdown captures the start Y and the blind's height and
  // kills the transition so the blind tracks the pointer 1:1; pointermove writes
  // the offset to --rc-dy (consumed by the .is-open transform, so the CSS rule
  // keeps winning over any stale inline transform); pointerup either closes (if
  // travelled past the threshold) or springs back open. Listeners sit on window
  // so a drag that leaves the cord still tracks.
  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current
      const el = blindRef.current
      if (!drag || !el) return
      const dy = Math.min(0, e.clientY - drag.y)
      el.style.setProperty('--rc-dy', `${Math.max(-drag.h, dy)}px`)
    }
    const onUp = (e) => {
      const drag = dragRef.current
      const el = blindRef.current
      if (!drag || !el) return
      const travelled = drag.y - e.clientY
      dragRef.current = null
      // Restore the CSS-driven glide and clear the live offset before the state
      // flips, so both close and spring-back animate rather than snap.
      el.style.transition = ''
      el.style.removeProperty('--rc-dy')
      if (travelled > drag.h * CLOSE_FRACTION) onClose()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onClose])

  const startDrag = (e) => {
    if (!open) return
    const el = blindRef.current
    if (!el) return
    e.preventDefault()
    dragRef.current = { y: e.clientY, h: el.getBoundingClientRect().height }
    el.style.transition = 'none'
  }

  // A plain click on the cord (no meaningful drag) closes it. If a drag was in
  // flight, pointerup already resolved it, so ignore the click it synthesizes.
  const handleCordClick = (e) => {
    e.preventDefault()
    if (dragRef.current) return
    onClose()
  }

  return (
    <div
      ref={blindRef}
      className={`rc-blind${open ? ' is-open' : ''}`}
      aria-hidden={!open}
    >
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
              up-left to rest at 30px in the header slot and becomes the wordmark. */}
          <div className="rc-blind__brand" data-motion="1">
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
          </div>

          {/* Top-right header row. The shortlist pill is static (shortlist is not
              an MVP feature yet — CLAUDE.md §7b — so the count is always 0). */}
          <div className="rc-blind__headerrow" data-motion="1">
            <span className="rc-blind__headerrow-label">How it works</span>
            <span className="rc-blind__pill">Shortlist &middot; 0</span>
          </div>

          <div className="rc-blind__content">
            {/* Heading. Uppercased via CSS; sentence-case in markup for readers. */}
            <div className="rc-blind__heading" data-motion="1">
              <h2 className="rc-blind__h1">How it works</h2>
              <p className="rc-blind__lede">
                You set the criteria. <em>somewhere</em> returns the shortlisted
                destinations.
              </p>
            </div>

            <div className="rc-blind__divider" data-motion="1" aria-hidden="true" />

            {/* Stages 01 + 02 — two columns on the panel surface, no gap. */}
            <div className="rc-blind__stages" data-motion="1">
              <div className="rc-blind__stage">
                <span className="rc-blind__stage-num">01</span>
                <h3 className="rc-blind__stage-title">What you give us</h3>
                <p className="rc-blind__body">
                  You define the trip, not the destination: what you&rsquo;re
                  willing to spend, how long you want to go, when you want to go,
                  and your trip vibe.
                </p>
              </div>
              <div className="rc-blind__stage">
                <span className="rc-blind__stage-num">02</span>
                <h3 className="rc-blind__stage-title">Every destination gets a price</h3>
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
            </div>

            {/* Stage 03 — full width: score formula + three weighted columns. */}
            <div className="rc-blind__score" data-motion="1">
              <span className="rc-blind__stage-num">03</span>
              <h3 className="rc-blind__h2">Every price gets a score</h3>
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
                    clamp( (budget &minus; trip_typical) / budget , 0 , 1 )
                  </div>
                  <div className="rc-blind__bars">
                    <div className="rc-blind__bar-row">
                      <span>$1,400 of $2,000</span>
                      <span className="rc-blind__bar-val">0.30</span>
                    </div>
                    <div className="rc-blind__bar-track">
                      <div className="rc-blind__bar-fill" style={{ width: '30%' }} />
                    </div>
                    <div className="rc-blind__bar-row">
                      <span>$1,980 of $2,000</span>
                      <span className="rc-blind__bar-val">0.01</span>
                    </div>
                    <div className="rc-blind__bar-track">
                      <div className="rc-blind__bar-fill rc-blind__bar-fill--over" style={{ width: '1%' }} />
                    </div>
                    <span className="rc-blind__bar-caption">
                      Both fit. Only one leaves you room.
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

            {/* Stage 04 — two override rules. */}
            <div className="rc-blind__rules" data-motion="1">
              <span className="rc-blind__stage-num">04</span>
              <h3 className="rc-blind__h2">Two rules that override raw score</h3>
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

            {/* Footer — ranges note + amber CTA (wired to onClose, as today). */}
            <div className="rc-blind__footer" data-motion="1">
              <span className="rc-blind__footer-note">
                Estimates are always shown as ranges &mdash; they are not live
                inventory.
              </span>
              <button type="button" className="rc-blind__cta-btn" onClick={onClose}>
                Find my trip &rarr;
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>

      <div className="rc-blind__cord">
        <div
          className="rc-blind__cord-hit"
          onPointerDown={startDrag}
          onClick={handleCordClick}
          role="button"
          tabIndex={open ? 0 : -1}
          aria-label="Close How it works"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onClose()
            }
          }}
        >
          <div className="rc-blind__cord-line" />
          <div className="rc-blind__cord-ring" />
        </div>
        <span className={`rc-blind__hint${cordHintSeen ? ' is-hidden' : ''}`}>pull to close</span>
      </div>
    </div>
  )
}
