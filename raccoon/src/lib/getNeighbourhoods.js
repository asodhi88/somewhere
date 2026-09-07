/**
 * getNeighbourhoods — the single data-access seam for neighbourhood guidance.
 *
 * Parallel to getDestinations (CLAUDE.md §7): components MUST NOT import
 * neighbourhoods.json directly. Every read of neighbourhood data goes through
 * this one module, so swapping the v1 static JSON for Supabase (or any live
 * source) later stays a one-file change with no caller edits.
 *
 * The dataset is keyed by the SAME city ids as the destinations dataset
 * (e.g. 'hav', 'rek') so a result's `id` maps straight to its guide.
 *
 * @param {string} cityId - destination id, e.g. 'hav'
 * @returns {Object|null} the city's neighbourhood object, or null when the city
 *   has no entry. Callers treat a null (or a `tier: "none"` object) as "render
 *   no module"; the accessor itself does not editorialise — it only loads.
 */
import neighbourhoods from '../data/neighbourhoods.json' with { type: 'json' }

export function getNeighbourhoods(cityId) {
  if (!cityId) return null
  return neighbourhoods[cityId] ?? null
}

export default getNeighbourhoods
