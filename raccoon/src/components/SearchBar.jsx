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
 */
export default function SearchBar({ defaults, pending, onSearch }) {
  const [budget, setBudget] = useState(defaults.budget)
  const [nights, setNights] = useState(defaults.nights)
  const [month, setMonth] = useState(defaults.month)
  const [stay, setStay] = useState(defaults.stay)

  const budgetText = budget == null ? '' : budget.toLocaleString('en-US')

  const onBudgetChange = (e) => {
    const digits = e.target.value.replace(/[^0-9]/g, '')
    setBudget(digits === '' ? null : Math.min(100000, Number(digits)))
  }

  const onNightsChange = (e) => {
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
      <label className={`rc-field rc-field--budget${budget != null ? ' is-filled' : ''}`}>
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

      <label className={`rc-field rc-field--nights${nights !== '' ? ' is-filled' : ''}`}>
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

      <div className={`rc-field rc-field--when${month ? ' is-filled' : ''}`}>
        <span className="rc-field__label">When</span>
        <div className="rc-field__control">
          <Menu
            variant="field"
            ariaLabel="Travel month"
            value={month}
            onChange={setMonth}
            options={MONTH_MENU}
            formatValue={monthTriggerLabel}
            scrollable
          />
        </div>
      </div>

      <div className={`rc-field rc-field--stay${stay ? ' is-filled' : ''}`}>
        <span className="rc-field__label">Stay</span>
        <div className="rc-field__control">
          <Menu
            variant="field"
            ariaLabel="Stay tier"
            value={stay}
            onChange={setStay}
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
