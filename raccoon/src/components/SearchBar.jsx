import { useCallback, useState, useSyncExternalStore } from 'react'
import { MONTH_OPTIONS, STAY_OPTIONS } from '../lib/searchState'

/**
 * Tracks a media query so the month picker can switch to short labels ("Oct
 * 2026") at phone width, where the full name clips. Matches the 720px mobile
 * breakpoint in index.css. useSyncExternalStore subscribes to the MediaQueryList
 * directly — no effect-setState race, and it re-reads on every viewport change.
 */
function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false, // server snapshot — app is client-only, defaults to desktop
  )
}

/**
 * SearchBar — the product's single input (CLAUDE.md: "search-first hero").
 * Holds a local draft of the filters and only commits on submit, so the amber
 * "Show me where" button stays the one loud action the design calls for.
 *
 * Origin lives in the OriginPicker control above the widget, not here — these
 * four fields are budget, nights, month and stay tier.
 */
export default function SearchBar({ defaults, pending, onSearch }) {
  const [budget, setBudget] = useState(defaults.budget)
  const [nights, setNights] = useState(defaults.nights)
  const [month, setMonth] = useState(defaults.month)
  const [stay, setStay] = useState(defaults.stay)

  // Abbreviate months to fit the narrow single-line field on phones.
  const shortMonths = useMediaQuery('(max-width: 720px)')

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
    onSearch({
      budget,
      nights: nights === '' || nights < 1 ? 1 : nights,
      month,
      stay,
    })
  }

  return (
    <form className="rc-search" onSubmit={submit}>
      {/* Amber accent light tracing the border — the idle-state affordance.
          data-motion stills it under prefers-reduced-motion. */}
      <span className="rc-search__trace" data-motion="1" aria-hidden="true" />
      <label className="rc-field rc-field--budget">
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

      <label className="rc-field rc-field--nights">
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

      <label className="rc-field rc-field--when">
        <span className="rc-field__label">When</span>
        <div className="rc-field__control">
          <select
            aria-label="Travel month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {shortMonths ? m.short : m.label}
              </option>
            ))}
          </select>
          <span className="rc-field__caret" aria-hidden="true">
            ▾
          </span>
        </div>
      </label>

      <label className="rc-field rc-field--stay">
        <span className="rc-field__label">Stay</span>
        <div className="rc-field__control">
          <select
            aria-label="Stay tier"
            value={stay}
            onChange={(e) => setStay(e.target.value)}
          >
            {STAY_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="rc-field__caret" aria-hidden="true">
            ▾
          </span>
        </div>
      </label>

      <button type="submit" className="rc-search__submit" disabled={pending}>
        {pending ? 'Searching…' : 'Show me where →'}
      </button>
    </form>
  )
}
