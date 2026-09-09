import { useCallback, useMemo, useRef, useState } from 'react'
import { LEAN_ORDER } from './neighbourhoodVocab'

/**
 * One state object for a city's map, lifted out of the view so the inline
 * section in the card and the full-screen overlay can share it: opening full
 * screen keeps whatever the reader had selected and filtered, and either view
 * can drive both cameras through the same token.
 */
export function useNeighbourhoodState(city) {
  const [selectedId, setSelectedId] = useState(null)
  const [off, setOff] = useState({})
  const [camera, setCamera] = useState(null)
  const nonce = useRef(0)

  const activeLeans = useMemo(() => LEAN_ORDER.filter((k) => !off[k]), [off])
  const selected = city.areas.find((a) => a.id === selectedId) || null
  const hasDistricts = (city.districts?.length ?? 0) > 0

  const move = useCallback((kind, id) => {
    nonce.current += 1
    setCamera({ kind, id, n: nonce.current })
  }, [])

  const selectArea = useCallback((areaId) => setSelectedId(areaId), [])
  const focusArea = useCallback(
    (areaId) => {
      setSelectedId(areaId)
      move('area', areaId)
    },
    [move],
  )
  const drillDistrict = useCallback(
    (districtId) => {
      const first = city.areas.find((a) => a.district === districtId)
      setSelectedId(first ? first.id : null)
      move('district', districtId)
    },
    [city.areas, move],
  )
  const clearSelection = useCallback(() => {
    setSelectedId(null)
    move('reset')
  }, [move])
  const toggleLean = useCallback((k) => setOff((p) => ({ ...p, [k]: !p[k] })), [])

  return {
    selectedId, off, camera, activeLeans, selected, hasDistricts,
    selectArea, focusArea, drillDistrict, clearSelection, toggleLean,
  }
}
