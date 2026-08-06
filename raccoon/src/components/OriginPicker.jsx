import { useEffect, useRef, useState } from 'react'
import { ORIGIN_OPTIONS } from '../lib/searchState'

/**
 * OriginPicker — the "Departing" kicker plus a clickable origin control that
 * sits directly above the search widget. The control borrows the result tile's
 * price-CTA surface treatment so it reads as clearly tappable. Controlled: the
 * chosen origin is a real search parameter, applied with the rest of the filters
 * on the next "Show me where". Selectable cities come from ORIGIN_OPTIONS; the
 * rest collapse into one quiet "coming soon" line.
 */
export default function OriginPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selectable = ORIGIN_OPTIONS.filter((o) => o.available)
  const hasComingSoon = ORIGIN_OPTIONS.some((o) => !o.available)
  const selected = ORIGIN_OPTIONS.find((o) => o.value === value) || selectable[0]

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

  const pick = (v) => {
    onChange(v)
    setOpen(false)
  }

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
            {selectable.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === selected.value}
                className="rc-origin__opt"
                onClick={() => pick(o.value)}
              >
                <span>
                  {o.city} · {o.code}
                </span>
                {o.value === selected.value && (
                  <span className="rc-origin__check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}
            {hasComingSoon && (
              <p className="rc-origin__soon">Other departure cities coming soon.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
