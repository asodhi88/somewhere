/**
 * ambient.js — day vs night resolution AFTER the first paint.
 *
 * The initial paint is decided by the inline pre-paint script in index.html (kept
 * inline so there's no flash of the wrong theme). That script runs once and is
 * never re-evaluated, so a session that loaded at night stays dark even after the
 * clock moves past dawn. This module re-applies the exact same rule on demand —
 * used when the "somewhere" brand resets the app (Home.resetToHome), so clicking
 * the brand re-syncs the theme to the current time (night → day, or day → night).
 *
 * The day-window rule and the top-of-sky colours here MUST match index.html.
 */

// [DAY_START_H:00, DAY_END_H:00) is the day ambient; everything else is night.
const DAY_START_H = 6
const DAY_END_H = 19

// Top-of-sky colour per ambient — equals the hero gradient's start colour and the
// html background in index.css, so the browser-chrome (theme-color) has no seam.
// Keep in sync with index.html's pre-paint script.
const TOP_OF_SKY = { day: '#8ec6e6', night: '#081123' }

/**
 * Resolve 'day' | 'night' from the client clock. On localhost only, a
 * ?theme=dark|light query forces night|day (the same dev override index.html
 * honours), so both ambients can be checked without changing the system clock.
 */
export function resolveAmbient() {
  const h = new Date().getHours()
  let mode = h >= DAY_START_H && h < DAY_END_H ? 'day' : 'night'

  const host = typeof location !== 'undefined' ? location.hostname : ''
  const isLocalDev =
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === ''
  if (isLocalDev) {
    const forced = new URLSearchParams(location.search).get('theme')
    if (forced === 'dark' || forced === 'night') mode = 'night'
    else if (forced === 'light' || forced === 'day') mode = 'day'
  }
  return mode
}

/**
 * Apply an ambient to <html> and the browser chrome, exactly as the pre-paint
 * script does at load. Defaults to the freshly-resolved mode. Returns the mode.
 */
export function applyAmbient(mode = resolveAmbient()) {
  if (typeof document === 'undefined') return mode
  document.documentElement.setAttribute('data-ambient', mode)
  const tc = document.querySelector('meta[name="theme-color"]')
  if (tc) tc.setAttribute('content', TOP_OF_SKY[mode] || TOP_OF_SKY.night)
  return mode
}
