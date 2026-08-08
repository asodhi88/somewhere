import { useEffect, useRef } from 'react'
import NightSky from './NightSky'

/**
 * Blind — the "How it works" roller blind. Instead of routing to a separate
 * page, the header link lowers this over the top 80vh of the homepage while the
 * page behind it blurs (the blur + scroll-lock live in Home.jsx, which owns the
 * open state and the /how-it-works history entry). Metaphor: the homepage is a
 * window, this is the blind.
 *
 * The blind is always mounted so the drop can transition; `open` toggles the
 * `is-open` class that drives the transform, the staggered content reveal, and
 * the cord fade-in. A pull-cord hangs below the bottom edge — click it, drag it
 * up past the threshold, hit the CTA, Escape, or Back all close it.
 *
 * Copy is condensed from HowItWorks.jsx (the full page is too tall for 80vh);
 * the standalone route keeps the long form for deep links and crawlers.
 */

// Drop timing. The reveal delays were authored against a 1000ms reference drop
// (handoff README); at our 450ms drop each row still lands just after the blind
// settles when the reference delay is scaled by DROP_MS/1000. The 450ms transform
// itself, the ~0.9× blur, and the cord fade-in delay live in index.css.
const DROP_MS = 450
const REF_MS = 1000
const stagger = (refDelay) => ({ transitionDelay: `${Math.round((refDelay * DROP_MS) / REF_MS)}ms` })

// How far up (as a fraction of the blind's height) a drag must travel to close.
const CLOSE_FRACTION = 0.18

const STEPS = [
  {
    n: '1',
    title: 'Set a budget, not a destination',
    body: 'Total spend, nights, month, bed. Four inputs, no account, no email.',
    delay: 760,
  },
  {
    n: '2',
    title: 'We add up all three costs',
    body: 'Fare, every night of bed, and what a day on the ground costs. Ranges only.',
    delay: 840,
  },
  {
    n: '3',
    title: 'Six cities, two per region',
    body: 'Sorted by total trip cost, capped by region so the list is a real choice.',
    delay: 920,
  },
  {
    n: '4',
    title: 'Then we get out of the way',
    tag: 'Coming soon',
    body: "We don't book or hold your card. One tap sends you to Google Flights.",
    delay: 1000,
  },
]

export default function Blind({ open, onClose, cordHintSeen }) {
  const blindRef = useRef(null)
  // Live drag transients — a ref so pointer moves never re-render (README §State).
  const dragRef = useRef(null)

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
        <div className="rc-blind__sky" aria-hidden="true">
          <NightSky starsOnly showMoon={false} />
        </div>
        <div className="rc-blind__scrim" aria-hidden="true" />

        <div className="rc-blind__col">
          <div className="rc-blind__reveal rc-blind__brand" style={stagger(520)}>
            {/* Header covers the real logo, so it's repeated here at 26px. */}
            <svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
              <path d="M50 6 L39 39 L50 50 Z" fill="#7BC9B8" />
              <path d="M50 6 L61 39 L50 50 Z" fill="#4B9A89" />
              <path d="M97 50 L61 39 L50 50 Z" fill="#F2B65C" />
              <path d="M97 50 L61 61 L50 50 Z" fill="#D8912C" />
              <path d="M50 94 L61 61 L50 50 Z" fill="#D25E46" />
              <path d="M50 94 L39 61 L50 50 Z" fill="#F28E78" />
              <path d="M3 50 L39 61 L50 50 Z" fill="#8C71B6" />
              <path d="M3 50 L39 39 L50 50 Z" fill="#BCA3DF" />
            </svg>
            <span className="rc-blind__wordmark">somewhere</span>
          </div>

          <div className="rc-blind__hero">
            <span className="rc-blind__reveal rc-eyebrow" style={stagger(560)}>
              How it works
            </span>
            <h2 className="rc-blind__reveal rc-blind__title" style={stagger(620)}>
              A cheap flight isn&rsquo;t a cheap trip.
            </h2>
            <p className="rc-blind__reveal rc-blind__sub" style={stagger(700)}>
              So we stopped ranking flights. Four steps, one honest number, and a
              shortlist of places your trip actually fits.
            </p>
          </div>

          <div className="rc-blind__steps">
            {STEPS.map((s, i) => {
              const last = i === STEPS.length - 1
              return (
                <div className="rc-blind__reveal rc-blind__step" style={stagger(s.delay)} key={s.n}>
                  <span className={`rc-hiw-step__num${last ? ' is-muted' : ''}`} aria-hidden="true">
                    {s.n}
                  </span>
                  <h3 className="rc-blind__step-title">
                    {s.title}
                    {s.tag && <span className="rc-blind__tag">{s.tag}</span>}
                  </h3>
                  <p className="rc-blind__step-desc">{s.body}</p>
                </div>
              )
            })}
          </div>

          <div className="rc-blind__reveal rc-blind__cta" style={stagger(1080)}>
            <span className="rc-blind__cta-note">Estimates reflected as ranges only.</span>
            <button type="button" className="rc-blind__cta-btn" onClick={onClose}>
              Find my trip &rarr;
            </button>
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
