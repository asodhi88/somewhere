import { useEffect, useRef, useState } from 'react'
import {
  ORIGIN_OPTIONS,
  MONTH_OPTIONS,
  STAY_OPTIONS,
  DEFAULT_FILTERS,
  DEFAULT_MONTH,
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

/**
 * A tappable value inside the sentence / eyebrow. Never wraps mid-pill.
 *
 * `assumed` marks a value the form filled itself after a Scout fill, and
 * `askset` one Scout read out of the traveller's own words — the sentence
 * layout has no room for a note beside each pill, so the pill carries the mark
 * and the note list below the sentence carries the words (see the notes row).
 */
function Pill({ id, label, open, onOpen, variant, buttonRef, assumed, askset }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`rc-pill${variant ? ` rc-pill--${variant}` : ''}${open ? ' is-open' : ''}${
        assumed ? ' is-assumed' : ''
      }${askset ? ' is-askset' : ''}`}
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

export default function MobileSearch({
  defaults,
  pending,
  onSearch,
  askFilled = [],
  askNotes = {},
}) {
  const [origin, setOrigin] = useState(defaults.origin || DEFAULT_FILTERS.origin)
  // The mobile composer is a sentence, so it can't rest on empty field names the
  // way the desktop bar does — a blank landing (BLANK_FILTERS) would read
  // "for  nights in ...". Every value falls back to the default so the sentence
  // always reads whole; a search from here still commits concrete picks.
  const [nights, setNights] = useState(defaults.nights || DEFAULT_FILTERS.nights)
  const [month, setMonth] = useState(defaults.month || DEFAULT_MONTH)
  const [stay, setStay] = useState(defaults.stay || DEFAULT_FILTERS.stay)
  // A desktop link can carry budget=null ("no limit"); mobile expresses a
  // concrete amount, so fall back to the default when none is set.
  const [budget, setBudget] = useState(defaults.budget ?? DEFAULT_FILTERS.budget)

  const [openSheet, setOpenSheet] = useState(null)
  // The nights sheet edits a numeric draft (stepper + chips), committed on Done.
  const [nightsDraft, setNightsDraft] = useState(NIGHTS_MIN)
  // The pill that opened the current sheet, so focus can return to it on close.
  const triggerRef = useRef(null)
  // Values the traveller has changed since Scout filled the sentence. Once a
  // value is theirs, there is nothing left for the form to disclose about it.
  const [touched, setTouched] = useState(() => new Set())
  const touch = (field) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)))
  const noteFor = (field) => (touched.has(field) ? null : askNotes[field] || null)
  const setByAsk = (field) => !touched.has(field) && askFilled.includes(field)
  // The assumption notes, in sentence order. Each one is a button that opens the
  // sheet for its own value, so the note IS the correction affordance.
  const assumedNotes = ['origin', 'nights', 'month', 'stay', 'budget']
    .map((field) => ({ field, text: noteFor(field) }))
    .filter((n) => n.text)

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
    touch('nights')
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
            assumed={!!noteFor('origin')}
            askset={setByAsk('origin')}
          />
        </p>

        {/* Sentence: static muted words + value pills. Punctuation belongs to the
            static run and sits tight against the preceding pill (no leading
            space before a comma / period). */}
        <p className="rc-msearch__sentence">
          <span className="rc-msearch__static">I want to go for</span>{' '}
          <Pill
            id="nights"
            label={nightsLabel}
            open={openSheet === 'nights'}
            onOpen={open}
            assumed={!!noteFor('nights')}
            askset={setByAsk('nights')}
          />{' '}
          <span className="rc-msearch__static">in</span>{' '}
          <Pill
            id="month"
            label={openMonth.name}
            open={openSheet === 'month'}
            onOpen={open}
            assumed={!!noteFor('month')}
            askset={setByAsk('month')}
          />
          <span className="rc-msearch__static">, staying</span>{' '}
          <Pill
            id="stay"
            label={stayLabel}
            open={openSheet === 'stay'}
            onOpen={open}
            assumed={!!noteFor('stay')}
            askset={setByAsk('stay')}
          />
          <span className="rc-msearch__static">, under</span>{' '}
          <Pill
            id="budget"
            label={money(budget)}
            open={openSheet === 'budget'}
            onOpen={open}
            assumed={!!noteFor('budget')}
            askset={setByAsk('budget')}
          />
          <span className="rc-msearch__static">.</span>
        </p>

        {assumedNotes.length > 0 && (
          <ul className="rc-msearch__notes">
            {assumedNotes.map((n) => (
              <li key={n.field}>
                <button
                  type="button"
                  className="rc-asknote rc-asknote--tap"
                  onClick={(e) => open(n.field, e.currentTarget)}
                >
                  {n.text}
                </button>
              </li>
            ))}
          </ul>
        )}

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
                      touch('origin')
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
                    touch('month')
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
                    touch('stay')
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
                    touch('budget')
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
