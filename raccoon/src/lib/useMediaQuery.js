import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribe to a CSS media query as React state. useSyncExternalStore reads the
 * MediaQueryList directly — no effect-setState race — and re-renders on every
 * viewport change. The server snapshot is `false` (desktop): the app is
 * client-only (createRoot, not hydrate), so the first client paint already reads
 * the real value.
 *
 * Used by Hero to pick the mobile sentence composer vs the desktop field grid at
 * the 720px breakpoint. (SearchBar keeps its own inline copy so the desktop
 * search path stays literally untouched.)
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export default useMediaQuery
