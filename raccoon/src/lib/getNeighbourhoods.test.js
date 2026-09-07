import { describe, it, expect } from 'vitest'
import { getNeighbourhoods } from './getNeighbourhoods'

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

  it('every full-tier area carries a lean in the three allowed buckets and a friction band', () => {
    const { areas } = getNeighbourhoods('hav')
    for (const a of areas) {
      expect(['below', 'near', 'above']).toContain(a.lean)
      expect(['walkable', 'short-ride', 'taxi-reliant']).toContain(a.friction)
      expect(a.polygon.type).toBe('Polygon')
    }
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
  })
})
