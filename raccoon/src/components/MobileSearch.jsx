import { useEffect, useRef, useState } from 'react'
import {
  ORIGIN_OPTIONS,
  MONTH_OPTIONS,
  STAY_OPTIONS,
} from '../lib/searchState'

/**
 * MobileSearch — the phone (≤720px) search: a two-part natural-language
 * composer that replaces the desktop field grid. An eyebrow carries the origin
 * ("YOUR TRIP FROM · TORONTO") and a sentence carries the rest ("I want to go
 * for 3 nights in September, staying mid-range, under $1,500."). Every bold
 * value is a tappable pill that opens a bottom sheet of neumorphic option tiles;
 * picking a value commits and closes.
 *
 * Why this exists (handoff): the old mobile form was a stack of generic selects
 * and the stay tier was dropped entirely, so mobile searches silently ran on an
 * invisible default. Here every input that moves the ranking — origin, nights,
 * month, stay, budget — is visible and settable.
 *
 * Self-contained state: like SearchBar, it holds a local draft seeded from
 * `defaults` and only commits on the CTA, so the amber button stays the one loud
 * action. Origin is part of the draft here (the eyebrow pill owns it), and the
 * whole five-value object is handed to onSearch — origin included — so it flows
 * through the seam / URL exactly like the desktop path. Persistence lives in Home
 * (storeFilters on search), so this component doesn't touch localStorage.
 */

// Budget sheet presets — $500 … $4,000 in $500 steps (handoff §Total budget).
const BUDGET_STEPS = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000]

const ORIGINS = ORIGIN_OPTIONS.filter((o) => o.available)
const HAS_MORE_ORIGINS = ORIGIN_OPTIONS.some((o) => !o.available)

// Lowercase, in-sentence stay labels ("mid-range") mapped to the canonical
// dataset values ('mid'). The sentence and sheet read from here; the value that
// leaves the component is always the canonical one the ranking understands.
const STAY_CHOICES = STAY_OPTIONS.map((s) => ({
  value: s.value,
  label: s.label.toLowerCase(),
}))

const NIGHTS_MIN = 1
const NIGHTS_MAX = 30
// Quick-pick chips inside the nights sheet — the common trip lengths.
const NIGHTS_QUICK = [3, 5, 7, 10, 14]

const money = (n) => '$' + n.toLocaleString('en-US')

const SHEET_TITLES = {
  origin: 'Leaving from',
  nights: 'How many nights',
  month: 'Which month',
  stay: 'Where you stay',
  budget: 'Total budget',
}

/** A tappable value inside the sentence / eyebrow. Never wraps mid-pill. */
function Pill({ id, label, open, onOpen, variant, buttonRef }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`rc-pill${variant ? ` rc-pill--${variant}` : ''}${open ? ' is-open' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(e) => onOpen(id, e.currentTarget)}
    >
      {label}
      <span className="rc-pill__chev" aria-hidden="true">
        ▾
      </span>
    </button>
  )
}

/**
 * Bottom sheet: scrim (tap to dismiss) + a content-driven panel. Focus is
 * trapped inside while open, Escape closes, and focus returns to the triggering
 * pill (handled by the parent via the stored trigger element).
 */
function Sheet({ title, onClose, children }) {
  const panelRef = useRef(null)

  useEffect(() => {
    const panel = panelRef.current
    // Focus the first focusable control (falls back to the panel itself).
    const focusables = () =>
      panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
    const first = focusables()[0]
    ;(first || panel).focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = focusables()
      if (nodes.length === 0) return
      const firstEl = nodes[0]
      const lastEl = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    panel.addEventListener('keydown', onKey)
    return () => panel.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="rc-sheet__scrim" onClick={onClose} />
      <div
        className="rc-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        tabIndex={-1}
      >
        <span className="rc-sheet__handle" aria-hidden="true" />
        <h2 className="rc-sheet__title">{title}</h2>
        {children}
      </div>
    </>
  )
}

/** One neumorphic option tile. `size` sets how many sit per row. */
function Tile({ label, sub, selected, size, onClick }) {
  return (
    <button
      type="button"
      className={`rc-tile rc-tile--${size}${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="rc-tile__label">{label}</span>
      {sub && <span className="rc-tile__sub">{sub}</span>}
    </button>
  )
}

export default function MobileSearch({ defaults, pending, onSearch }) {
  const [origin, setOrigin] = useState(defaults.origin)
  const [nights, setNights] = useState(defaults.nights)
  const [month, setMonth] = useState(defaults.month)
  const [stay, setStay] = useState(defaults.stay)
  // A desktop link can carry budget=null ("no limit"); mobile expresses a
  // concrete amount, so fall back to the default when none is set.
  const [budget, setBudget] = useState(defaults.budget ?? 2000)

  const [openSheet, setOpenSheet] = useState(null)
  // The nights sheet edits a numeric draft (stepper + chips), committed on Done.
  const [nightsDraft, setNightsDraft] = useState(NIGHTS_MIN)
  // The pill that opened the current sheet, so focus can return to it on close.
  const triggerRef = useRef(null)

  const openMonth = MONTH_OPTIONS.find((o) => o.value === month) || MONTH_OPTIONS[0]
  const selectedOrigin = ORIGINS.find((o) => o.value === origin) || ORIGINS[0]
  const stayLabel = STAY_CHOICES.find((s) => s.value === stay)?.label || stay

  const open = (id, el) => {
    triggerRef.current = el
    if (id === 'nights') setNightsDraft(nights)
    setOpenSheet(id)
  }

  const close = () => {
    setOpenSheet(null)
    // Restore focus to the pill that opened the sheet (after it unmounts).
    const el = triggerRef.current
    requestAnimationFrame(() => el && el.focus())
  }

  // Lock background scroll while a sheet is down (mirrors the Blind / Lightbox).
  useEffect(() => {
    if (!openSheet) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [openSheet])

  const clampNights = (n) => Math.min(NIGHTS_MAX, Math.max(NIGHTS_MIN, n))

  const commitNights = () => {
    setNights(clampNights(nightsDraft))
    close()
  }

  const draftUnit = nightsDraft === 1 ? 'night' : 'nights'

  const submit = () => {
    onSearch({ origin, budget, nights, month, stay })
  }

  const nightsLabel = `${nights} night${nights === 1 ? '' : 's'}`

  return (
    <div className="rc-msearch">
      <div className="rc-msearch__main">
        {/* Eyebrow: static label + origin pill at the eyebrow's own type scale. */}
        <p className="rc-msearch__eyebrow">
          <span className="rc-msearch__eyebrow-label">Your trip from</span>
          <Pill
            id="origin"
            variant="eyebrow"
            label={selectedOrigin.city.toUpperCase()}
            open={openSheet === 'origin'}
            onOpen={open}
          />
        </p>

        {/* Sentence: static muted words + value pills. Punctuation belongs to the
            static run and sits tight against the preceding pill (no leading
            space before a comma / period). */}
        <p className="rc-msearch__sentence">
          <span className="rc-msearch__static">I want to go for</span>{' '}
          <Pill id="nights" label={nightsLabel} open={openSheet === 'nights'} onOpen={open} />{' '}
          <span className="rc-msearch__static">in</span>{' '}
          <Pill id="month" label={openMonth.name} open={openSheet === 'month'} onOpen={open} />
          <span className="rc-msearch__static">, staying</span>{' '}
          <Pill id="stay" label={stayLabel} open={openSheet === 'stay'} onOpen={open} />
          <span className="rc-msearch__static">, under</span>{' '}
          <Pill id="budget" label={money(budget)} open={openSheet === 'budget'} onOpen={open} />
          <span className="rc-msearch__static">.</span>
        </p>

        <p className="rc-msearch__helper">
          Tap any raised word to change it — we remember what you pick.
        </p>
      </div>

      <div className="rc-msearch__cta-wrap">
        <button
          type="button"
          className="rc-msearch__cta"
          onClick={submit}
          disabled={pending}
        >
          {pending ? 'Searching…' : 'Show me where →'}
        </button>
      </div>

      {openSheet && (
        <Sheet title={SHEET_TITLES[openSheet]} onClose={close}>
          {openSheet === 'origin' && (
            <>
              <div className="rc-tiles">
                {ORIGINS.map((o) => (
                  <Tile
                    key={o.value}
                    size="full"
                    label={o.city}
                    sub={o.code}
                    selected={o.value === origin}
                    onClick={() => {
                      setOrigin(o.value)
                      close()
                    }}
                  />
                ))}
              </div>
              {HAS_MORE_ORIGINS && (
                <div className="rc-sheet__well">More cities coming soon</div>
              )}
            </>
          )}

          {openSheet === 'nights' && (
            <div className="rc-sheet__nights">
              {/* Keyboard-free entry: a stepper flanking a large live value, then
                  quick-pick chips. No <input> — nothing raises the OS keypad. */}
              <div className="rc-stepper">
                <button
                  type="button"
                  className="rc-stepper__btn"
                  aria-label="One fewer night"
                  disabled={nightsDraft <= NIGHTS_MIN}
                  onClick={() => setNightsDraft((n) => clampNights(n - 1))}
                >
                  −
                </button>
                <span className="rc-stepper__value" aria-live="polite">
                  <span className="rc-stepper__num">{nightsDraft}</span>
                  <span className="rc-stepper__unit">{draftUnit}</span>
                </span>
                <button
                  type="button"
                  className="rc-stepper__btn"
                  aria-label="One more night"
                  disabled={nightsDraft >= NIGHTS_MAX}
                  onClick={() => setNightsDraft((n) => clampNights(n + 1))}
                >
                  +
                </button>
              </div>
              <div className="rc-nights-chips">
                {NIGHTS_QUICK.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`rc-nights-chip${q === nightsDraft ? ' is-selected' : ''}`}
                    aria-pressed={q === nightsDraft}
                    onClick={() => setNightsDraft(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <button type="button" className="rc-sheet__done" onClick={commitNights}>
                Done
              </button>
            </div>
          )}

          {openSheet === 'month' && (
            <div className="rc-tiles">
              {MONTH_OPTIONS.map((o) => (
                <Tile
                  key={o.value}
                  size="third"
                  label={o.abbr}
                  sub={o.year}
                  selected={o.value === month}
                  onClick={() => {
                    setMonth(o.value)
                    close()
                  }}
                />
              ))}
            </div>
          )}

          {openSheet === 'stay' && (
            <div className="rc-tiles">
              {STAY_CHOICES.map((s) => (
                <Tile
                  key={s.value}
                  size="half"
                  label={s.label}
                  selected={s.value === stay}
                  onClick={() => {
                    setStay(s.value)
                    close()
                  }}
                />
              ))}
            </div>
          )}

          {openSheet === 'budget' && (
            <div className="rc-tiles">
              {BUDGET_STEPS.map((b) => (
                <Tile
                  key={b}
                  size="half"
                  label={money(b)}
                  selected={b === budget}
                  onClick={() => {
                    setBudget(b)
                    close()
                  }}
                />
              ))}
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}
