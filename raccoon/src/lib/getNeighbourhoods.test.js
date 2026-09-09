import { describe, it, expect } from 'vitest'
import { getNeighbourhoods } from './getNeighbourhoods'
import { LEAN, FRICTION_LABEL, guideKind } from './neighbourhoodVocab'

/** Every author-written string the module can put on screen, as one blob. */
function allCopy() {
  return JSON.stringify(
    ['hav', 'lax', 'sjo'].map((id) => {
      const c = getNeighbourhoods(id)
      return [c.note, ...(c.areas || []).map((a) => [a.character, a.summary, a.stayIf, a.skipIf])]
    }),
  )
}

// The seam contract (acceptance #1): every neighbourhood read goes through this
// one accessor, which returns the city object or null. It does not editorialise
// — tier logic lives in the module, not here.
describe('getNeighbourhoods', () => {
  it('returns the full-tier Havana object with its areas', () => {
    const hav = getNeighbourhoods('hav')
    expect(hav).not.toBeNull()
    expect(hav.cityId).toBe('hav')
    expect(hav.tier).toBe('full')
    expect(hav.anchor.name).toBe('Parque Central')
    expect(hav.areas.length).toBeGreaterThanOrEqual(3)
    expect(hav.areas.length).toBeLessThanOrEqual(5)
  })

  it('uses the spec enums exactly — lean below|near|above, three friction bands', () => {
    // The schema is about to be frozen for a 130+ entry content pass, so these
    // are the spec's keys verbatim. Note the middle band's key is `near` while
    // the label users see reads "About your estimate".
    expect(Object.keys(LEAN)).toEqual(['below', 'near', 'above'])
    expect(LEAN.near.label).toBe('About your estimate')
    expect(Object.keys(FRICTION_LABEL)).toEqual(['walkable', 'short-ride', 'taxi-reliant'])
  })

  it('every full-tier area carries a lean in the three allowed buckets and a friction band', () => {
    for (const id of ['hav', 'lax']) {
      for (const a of getNeighbourhoods(id).areas) {
        // The lean bucket must be one the renderer has a colour for, and the
        // friction one of exactly three coarse bands — never a duration.
        expect(Object.keys(LEAN)).toContain(a.lean)
        expect(Object.keys(FRICTION_LABEL)).toContain(a.friction)
        expect(a.polygon.type).toBe('Polygon')
      }
    }
  })

  it('renders no precise times or percentages anywhere in the copy', () => {
    const copy = allCopy()
    expect(copy).not.toMatch(/%/)
    // Precise travel times are always minutes ("15 min walk", "25–35 minutes to
    // Downtown") or distances — those are the falsifiable claims the friction
    // bands exist to avoid. "24-hour cafés" is an opening time, not a duration.
    expect(copy).not.toMatch(/\d[\d\s–-]*(?:min\b|minutes?\b)/i)
    expect(copy).not.toMatch(/\d[\d\s–-]*(?:km\b|miles?\b)/i)
  })

  it('carries no risk or safety language anywhere in the copy', () => {
    // The feature describes transport need, never area risk: "you'll want a taxi
    // back at night" is logistics; "caution after dark" and its equivalents are
    // prohibited. Note "avoid" is deliberately not banned outright — "you'd
    // rather avoid the crowds" is traveller fit; "avoid this area" is not.
    const copy = allCopy()
    for (const term of [
      /caution/i, /after dark/i, /sketch/i, /unsafe/i, /dangerous/i,
      /\bsafety\b/i, /\bcrime\b/i, /dodgy/i, /seedy/i, /no-go/i,
      /avoid (?:this|the) (?:area|neighbourhood|district|part)/i,
    ]) {
      expect(copy).not.toMatch(term)
    }
  })

  it('LA carries the district layer that drives the drill-down; Havana does not', () => {
    const lax = getNeighbourhoods('lax')
    expect(lax.districts.length).toBe(5)
    // Every area belongs to a declared district, or the drill-down would strand it.
    const ids = new Set(lax.districts.map((d) => d.id))
    for (const a of lax.areas) expect(ids.has(a.district)).toBe(true)
    // A full-tier city without districts still renders (single-level read).
    expect(getNeighbourhoods('hav').districts).toBeUndefined()
    expect(guideKind(getNeighbourhoods('hav'))).toBe('full')
  })

  it('returns the minimal-tier seed as a note-only object with no areas', () => {
    const sjo = getNeighbourhoods('sjo')
    expect(sjo.tier).toBe('minimal')
    expect(sjo.note).toBeTruthy()
    expect(sjo.areas).toEqual([])
  })

  it('returns null for an unknown city or a falsy id (→ the module renders nothing)', () => {
    expect(getNeighbourhoods('nope')).toBeNull()
    expect(getNeighbourhoods('')).toBeNull()
    expect(getNeighbourhoods(undefined)).toBeNull()
    expect(guideKind(getNeighbourhoods('nope'))).toBeNull()
    expect(guideKind({ tier: 'none' })).toBeNull()
  })
})
