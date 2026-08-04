import { useEffect, useRef, useState } from 'react'
import { ORIGIN_OPTIONS } from '../lib/searchState'

/**
 * OriginPicker — the "Departing" kicker plus a clickable origin control that
 * sits directly above the search widget. The control borrows the result tile's
 * price-CTA surface treatment so it reads as clearly tappable. v1 ships YYZ-only
 * (CLAUDE.md §10), so the popover offers Toronto as the one selectable city and
 * a single quiet "coming soon" line rather than a wall of dead rows.
 */
export default function OriginPicker() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = ORIGIN_OPTIONS.find((o) => o.available) || ORIGIN_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="rc-originbar">
      <span className="rc-eyebrow">Departing</span>
      <div className="rc-origin" ref={ref}>
        <button
          type="button"
          className="rc-origin__btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="rc-origin__value">
            {selected.city} · {selected.code}
          </span>
          <span className="rc-origin__chev" aria-hidden="true">
            ▾
          </span>
        </button>

        {open && (
          <div className="rc-origin__menu" role="listbox" aria-label="Departure city">
            <button
              type="button"
              role="option"
              aria-selected="true"
              className="rc-origin__opt"
              onClick={() => setOpen(false)}
            >
              <span>
                {selected.city} · {selected.code}
              </span>
              <span className="rc-origin__check" aria-hidden="true">
                ✓
              </span>
            </button>
            <p className="rc-origin__soon">Other departure cities coming soon.</p>
          </div>
        )}
      </div>
    </div>
  )
}
