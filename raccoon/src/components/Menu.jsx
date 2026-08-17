import { useEffect, useId, useMemo, useRef, useState } from 'react'

/**
 * Menu — the themed listbox that replaces the native <select>s across the app
 * (handoff: menus/HIW/hero §1): the search widget's stay + when fields, the
 * OriginPicker, and the feedback form's city field. A native select renders a
 * black-and-white OS list with a grey highlight — off-brand on either sky, and
 * unreadable on the day gradient — so we drive our own listbox that inherits the
 * ambient surfaces (--surface-solid etc.), shows the selected row in the session
 * accent, and stays keyboard- and touch-accessible.
 *
 * The trigger geometry differs per site (a search field, an origin pill, a form
 * field), so the panel + rows are shared and the trigger is switched by
 * `variant`. Listbox semantics throughout: trigger role="combobox", panel
 * role="listbox", rows role="option". ↑/↓/Home/End move the active row,
 * Enter/Space commit, Esc closes and returns focus to the trigger, click-outside
 * closes, and the selected row is scrolled into view on open. Selection commits
 * on click — there is no separate Apply.
 *
 * Props:
 *   value        current value
 *   onChange     (value) => void — commit on select
 *   options      [{ value, label, group? }] — group enables year headers (month menu)
 *   ariaLabel    accessible name for the trigger + listbox
 *   variant      'field' | 'origin' | 'form' — trigger chrome only
 *   formatValue  (option|null) => node for the trigger; defaults to the label
 *   placeholder  trigger text when nothing is selected (form: "No city")
 *   footer       node rendered below the rows (origin "coming soon" note)
 *   scrollable   caps the panel height, adds group headers + a bottom fade (month)
 */
export default function Menu({
  value,
  onChange,
  options,
  ariaLabel,
  variant = 'field',
  formatValue,
  placeholder = 'Select',
  footer = null,
  scrollable = false,
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Keyboard navigation gets a 2px accent focus ring on the active row; pointer
  // hover gets only the neutral wash. Tracked so the two never look alike (§1).
  const [kbd, setKbd] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const rowRefs = useRef([])
  const uid = useId()
  const listId = `${uid}-list`

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  )
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null
  const triggerLabel = formatValue
    ? formatValue(selected)
    : selected
      ? selected.label
      : placeholder

  const openMenu = (viaKeyboard = false) => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setKbd(viaKeyboard)
    setOpen(true)
  }
  const close = (returnFocus = true) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }
  const commit = (i) => {
    const opt = options[i]
    if (opt) onChange(opt.value)
    close()
  }

  // Click-outside closes (no focus return — the user is elsewhere).
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // On open, move focus into the listbox and scroll the selected/active row into
  // view so a long menu (months) opens on the current pick.
  useEffect(() => {
    if (!open) return
    listRef.current?.focus()
    const el = rowRefs.current[activeIndex >= 0 ? activeIndex : 0]
    el?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Keep the active row visible as the user arrows through.
  useEffect(() => {
    if (!open) return
    rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const onTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu(true)
    }
  }

  const onListKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setKbd(true)
        setActiveIndex((i) => Math.min(options.length - 1, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setKbd(true)
        setActiveIndex((i) => Math.max(0, i - 1))
        break
      case 'Home':
        e.preventDefault()
        setKbd(true)
        setActiveIndex(0)
        break
      case 'End':
        e.preventDefault()
        setKbd(true)
        setActiveIndex(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (activeIndex >= 0) commit(activeIndex)
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        close()
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        break
    }
  }

  return (
    <div className={`rc-menu rc-menu--${variant}${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`rc-menu__trigger rc-menu__trigger--${variant}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="rc-menu__value">{triggerLabel}</span>
        <span className="rc-menu__caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={`rc-menu__panel${scrollable ? ' rc-menu__panel--scroll' : ''}`}>
          <ul
            ref={listRef}
            id={listId}
            className={`rc-menu__list${kbd ? ' is-kbd' : ''}`}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={
              activeIndex >= 0 ? `${uid}-opt-${activeIndex}` : undefined
            }
            tabIndex={-1}
            onKeyDown={onListKeyDown}
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value
              const isActive = i === activeIndex
              // Year group header before the first row of each new group (month menu).
              const prevGroup = i > 0 ? options[i - 1].group : undefined
              const showGroup = opt.group && opt.group !== prevGroup
              return (
                <li key={opt.value} role="presentation" className="rc-menu__item">
                  {showGroup && (
                    <span className="rc-menu__group" role="presentation">
                      {opt.group}
                    </span>
                  )}
                  <div
                    ref={(el) => (rowRefs.current[i] = el)}
                    id={`${uid}-opt-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`rc-menu__opt${isSelected ? ' is-selected' : ''}${
                      isActive ? ' is-active' : ''
                    }`}
                    onMouseEnter={() => {
                      setKbd(false)
                      setActiveIndex(i)
                    }}
                    onClick={() => commit(i)}
                  >
                    <span className="rc-menu__opt-label">{opt.label}</span>
                    {isSelected && (
                      <span className="rc-menu__check" aria-hidden="true">✓</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {footer}
          {scrollable && <div className="rc-menu__fade" aria-hidden="true" />}
        </div>
      )}
    </div>
  )
}
