import { useState } from 'react'
import Menu from './Menu'
import { MONTH_OPTIONS, STAY_OPTIONS, DEFAULT_FILTERS } from '../lib/searchState'

// Month rows read as the month name under a year group header (handoff §1); the
// trigger still shows the full "October 2026". Stay rows are the plain labels.
const MONTH_MENU = MONTH_OPTIONS.map((m) => ({
  value: m.value,
  label: m.name,
  group: String(m.year),
}))
// Nothing selected → empty trigger, so the resting floating label ("when") is the
// only text in the field. Once a month is picked it reads "October 2026".
const monthTriggerLabel = (opt) => (opt ? `${opt.label} ${opt.group}` : '')

/**
 * SearchBar — the product's single input (CLAUDE.md: "search-first hero").
 * Holds a local draft of the filters and only commits on submit, so the amber
 * "Show me where" button stays the one loud action the design calls for.
 *
 * Origin lives in the OriginPicker control above the widget, not here — these
 * four fields are budget, nights, month and stay tier. Month and stay use the
 * shared Menu listbox (handoff §1) rather than native selects.
 *
 * Scout fills this form rather than searching on its own. One prop carries what
 * it did, per field (Ask somewhere design 1c):
 *   askFilled — fields taken from the traveller's own words. They carry the
 *               design's `.is-ai` accent ring, so the change is visible where it
 *               happened.
 * Fields the form filled itself carry NO mark. The per-field assumption notes
 * ("Mid-range · assumed, tap to change") were removed along with their
 * `.is-assumed` styling and the space the widget reserved for them, so the bar
 * sits clean with nothing below it. The parse still derives `assumed` — the form
 * simply no longer discloses it per field.
 *
 * Editing a field retires the ring: once the value is the traveller's, the form
 * has nothing left to say about it. Scout re-mounts this component on each fill
 * (Hero keys it), so that state resets with the new values.
 */
export default function SearchBar({ defaults, pending, onSearch, askFilled = [] }) {
  const [budget, setBudget] = useState(defaults.budget)
  const [nights, setNights] = useState(defaults.nights)
  const [month, setMonth] = useState(defaults.month)
  const [stay, setStay] = useState(defaults.stay)
  // Fields the traveller has touched since Scout filled the form.
  const [touched, setTouched] = useState(() => new Set())

  const budgetText = budget == null ? '' : budget.toLocaleString('en-US')

  const touch = (field) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)))

  const setByAsk = (field) => !touched.has(field) && askFilled.includes(field)

  // `mod` is the existing CSS modifier, which is not always the field name — the
  // month field has been `.rc-field--when` since the Trip Search Bar handoff.
  const fieldClass = (field, filled, mod = field) =>
    `rc-field rc-field--${mod}${filled ? ' is-filled' : ''}${
      setByAsk(field) ? ' is-ai' : ''
    }`

  const onBudgetChange = (e) => {
    touch('budget')
    const digits = e.target.value.replace(/[^0-9]/g, '')
    setBudget(digits === '' ? null : Math.min(100000, Number(digits)))
  }

  const onNightsChange = (e) => {
    touch('nights')
    const digits = e.target.value.replace(/[^0-9]/g, '')
    if (digits === '') return setNights('')
    setNights(Math.min(30, Number(digits)))
  }

  const submit = (e) => {
    e.preventDefault()
    // Resolve any field left blank (the composer can start empty — see BLANK_FILTERS)
    // to its sensible default, then reflect those back into the fields so the
    // composer shows exactly what the search ran with. Budget stays as-is: an empty
    // budget is a real choice ("no limit"), not a blank to fill.
    const resolvedNights = nights === '' || nights < 1 ? DEFAULT_FILTERS.nights : nights
    const resolvedMonth = month || DEFAULT_FILTERS.month
    const resolvedStay = stay || DEFAULT_FILTERS.stay
    if (resolvedNights !== nights) setNights(resolvedNights)
    if (resolvedMonth !== month) setMonth(resolvedMonth)
    if (resolvedStay !== stay) setStay(resolvedStay)
    onSearch({
      budget,
      nights: resolvedNights,
      month: resolvedMonth,
      stay: resolvedStay,
    })
  }

  return (
    <form className="rc-search" onSubmit={submit}>
      {/* Amber accent light tracing the border — the idle-state affordance.
          data-motion stills it under prefers-reduced-motion. */}
      <span className="rc-search__trace" data-motion="1" aria-hidden="true" />

      <label className={fieldClass('budget', budget != null)}>
        <span className="rc-field__label">Budget</span>
        <div className="rc-field__control">
          <span className="rc-field__prefix">$</span>
          <input
            inputMode="numeric"
            aria-label="Total budget in Canadian dollars"
            placeholder="no limit"
            value={budgetText}
            onChange={onBudgetChange}
          />
        </div>
      </label>

      <label className={fieldClass('nights', nights !== '')}>
        <span className="rc-field__label">Nights</span>
        <div className="rc-field__control">
          <input
            inputMode="numeric"
            aria-label="Number of nights"
            value={nights}
            onChange={onNightsChange}
          />
        </div>
      </label>

      <div className={fieldClass('month', !!month, 'when')}>
        <span className="rc-field__label">When</span>
        <div className="rc-field__control">
          <Menu
            variant="field"
            ariaLabel="Travel month"
            value={month}
            onChange={(v) => {
              touch('month')
              setMonth(v)
            }}
            options={MONTH_MENU}
            formatValue={monthTriggerLabel}
            scrollable
          />
        </div>
      </div>

      <div className={fieldClass('stay', !!stay)}>
        <span className="rc-field__label">Stay</span>
        <div className="rc-field__control">
          <Menu
            variant="field"
            ariaLabel="Stay tier"
            value={stay}
            onChange={(v) => {
              touch('stay')
              setStay(v)
            }}
            options={STAY_OPTIONS}
            placeholder=""
          />
        </div>
      </div>

      <button type="submit" className="rc-search__submit" disabled={pending}>
        {pending ? 'Searching…' : 'Show me where →'}
      </button>
    </form>
  )
}
