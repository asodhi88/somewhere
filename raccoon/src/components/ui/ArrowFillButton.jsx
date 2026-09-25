/**
 * ArrowFillButton — a pill whose icon puck sweeps out to fill the whole button,
 * swapping the label and icon to their on-accent colours as it passes.
 *
 * Adapted from the Hyperiux Vault "arrow fill button" for this codebase:
 *   - Renders a <button> by default (an <a> only when `href` is passed), because
 *     the one place we use it toggles a panel rather than navigating.
 *   - Geometry is fixed px via --afb-* custom properties, not the original's
 *     viewport units, which are wrong for a button sitting inline in a text row
 *     inside a fixed-width column.
 *   - Colour routes through the cycling accent tokens, never hardcoded hex, so
 *     the button follows the per-load accent and the day/night ambient themes.
 *   - The icon is injectable and defaults to ScoutIcon, not a lucide arrow.
 *
 * Styling lives in index.css under `.rc-afb` (repo convention; also keeps the
 * var-driven inset/clip-path work out of reach of Tailwind's static scanner).
 * Hover is the trigger on pointer devices; touch has no hover, so a press
 * stands in for it via `data-filled`.
 */

import { useEffect, useRef, useState } from 'react'
import ScoutIcon from '../ScoutIcon'

// Must stay in step with --afb-dur in index.css: it is how long the press-held
// fill lingers on touch so the sweep is actually seen before it closes.
const DURATION_MS = 420

export default function ArrowFillButton({
  label,
  children,
  href,
  size = 'default',
  active = false,
  icon: Icon = ScoutIcon,
  className = '',
  ...props
}) {
  // Transitions are gated on data-ready so the button does not animate itself
  // into existence on mount.
  const [ready, setReady] = useState(false)
  const [pressed, setPressed] = useState(false)
  const hoverlessRef = useRef(false)
  const releaseRef = useRef(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(hover: none)')
    const sync = () => {
      hoverlessRef.current = mq.matches
      if (!mq.matches) setPressed(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => () => window.clearTimeout(releaseRef.current), [])

  const handlePointerDown = (event) => {
    props.onPointerDown?.(event)
    if (!hoverlessRef.current || event.pointerType === 'mouse') return
    window.clearTimeout(releaseRef.current)
    setPressed(true)
  }

  const handleRelease = (event, handler) => {
    handler?.(event)
    if (!hoverlessRef.current || event.pointerType === 'mouse') return
    window.clearTimeout(releaseRef.current)
    releaseRef.current = window.setTimeout(() => setPressed(false), DURATION_MS)
  }

  const text = label ?? children
  // `active` pins the filled state open — the panel-open button should read as
  // filled without the pointer being on it.
  const filled = active || pressed

  // The label is rendered twice (real + ghost clone). The clone is aria-hidden,
  // but naming the button explicitly means no assistive tech has to rely on that
  // to arrive at a single clean name. Spread before `props`, so a caller-supplied
  // aria-label still wins.
  const named = typeof text === 'string' ? { 'aria-label': text } : null

  const Tag = href ? 'a' : 'button'
  const classes = ['rc-afb', size === 'compact' && 'rc-afb--compact', className]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag
      {...(href ? { href } : { type: 'button' })}
      {...named}
      {...props}
      className={classes}
      data-ready={ready ? 'true' : 'false'}
      data-filled={filled ? 'true' : 'false'}
      onPointerDown={handlePointerDown}
      onPointerUp={(event) => handleRelease(event, props.onPointerUp)}
      onPointerCancel={(event) => handleRelease(event, props.onPointerCancel)}
    >
      <span className="rc-afb__label">{text}</span>

      {/* The sweeping fill: clipped to the puck at rest, growing to the full pill. */}
      <span className="rc-afb__fill" aria-hidden="true" />

      {/* The label again in the on-accent colour, clipped to the same box so it
          is revealed exactly as the fill passes over it. */}
      <span className="rc-afb__ghost" aria-hidden="true">
        <span>{text}</span>
      </span>

      {/* The puck: a quiet accent wash at rest so nothing competes with the
          amber CTA, going transparent as the fill arrives behind it. */}
      <span className="rc-afb__puck" aria-hidden="true">
        <span className="rc-afb__icon rc-afb__icon--in">
          <Icon size="100%" />
        </span>
        <span className="rc-afb__icon rc-afb__icon--out">
          <Icon size="100%" />
        </span>
      </span>
    </Tag>
  )
}
