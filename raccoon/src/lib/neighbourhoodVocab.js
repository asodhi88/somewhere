/**
 * The shared vocabulary for neighbourhood guidance — the three lean bands, the
 * three friction bands, and the small helpers that read a city's entry.
 *
 * Pure module (no components), so both the light card parts and the lazy map
 * chunk can import it without dragging either into the other's bundle.
 */

// Colour = price lean only. A money scale, not a good/bad scale: below is cool
// (affordable), about is neutral, above is warm — and deliberately NOT alarm-red,
// so nothing reads as danger. These are the only three colours on the map.
export const LEAN = {
  below: { label: 'Below your estimate', color: '#2E9E8F', ink: '#1A6E62' },
  about: { label: 'About your estimate', color: '#7C8A94', ink: '#4C5A63' },
  above: { label: 'Above your estimate', color: '#C67A44', ink: '#96491C' },
}

export const LEAN_ORDER = ['below', 'about', 'above']

// friction → one of three coarse bands. Never a precise duration: the traveller
// is deciding *whether they'll be commuting*, not budgeting to the minute, and a
// "15 min walk" is a falsifiable claim that goes stale silently beside a
// deliberately qualitative price band.
export const FRICTION_LABEL = {
  walkable: 'Walkable to the centre',
  'short-ride': 'A short ride to the centre',
  'taxi-reliant': "You'll rely on taxis to reach the centre",
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-09" → "September 2026" for the disclosure line. */
export function formatReviewed(reviewedOn) {
  if (!reviewedOn) return null
  const [y, m] = String(reviewedOn).split('-')
  const name = MONTHS[Number(m) - 1]
  return name ? `${name} ${y}` : null
}

/**
 * 'full' | 'minimal' | null — what this city should render, if anything.
 * A city with no entry, tier "none", or a full tier with no areas renders
 * nothing at all, leaving the rest of the card untouched.
 */
export function guideKind(city) {
  if (!city || city.tier === 'none') return null
  if (city.tier === 'minimal') return 'minimal'
  if (city.tier === 'full' && city.areas?.length) return 'full'
  return null
}
