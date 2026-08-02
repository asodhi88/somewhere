import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import ResultsList from './components/ResultsList'
import Footer from './components/Footer'
import { getDestinations, getAvailableMonths } from './lib/getDestinations'
import {
  filtersFromSearch,
  searchFromFilters,
  hasSearchParams,
  monthKeyOf,
  MONTH_OPTIONS,
} from './lib/searchState'

// The grid shows up to six (CLAUDE.md §6.2 mockup); the ranking's per-region
// cap and diversification still apply underneath.
const RESULT_LIMIT = 6

// A brief, deliberate pause on each search so the loading state is real UI and
// not a flash. The data is static/synchronous today; when it moves behind
// Supabase (the §7 seam) this becomes the genuine fetch wait with no UI change.
const SEARCH_DELAY_MS = 380

export default function App() {
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const [filters, setFilters] = useState(() => filtersFromSearch(search))
  // Results stay hidden until an explicit search. A bare visit shows the prompt;
  // a shared/bookmarked link (query present) counts as that search, so the link
  // still lands on results (CLAUDE.md §4.3 — the share link is the prize).
  const [searched, setSearched] = useState(() => hasSearchParams(search))
  const [pending, setPending] = useState(false)
  // Bumped only on browser back/forward so the search bar re-reads the URL.
  const [resetKey, setResetKey] = useState(0)
  const timer = useRef(null)
  const resultsRef = useRef(null)

  const availableMonths = useMemo(() => getAvailableMonths(), [])

  const results = useMemo(
    () => getDestinations({ ...filters, limit: RESULT_LIMIT }),
    [filters],
  )

  const monthKey = monthKeyOf(filters.month)
  const monthHasData = availableMonths.has(monthKey)
  const monthLabel = MONTH_OPTIONS.find((o) => o.value === filters.month)?.label || filters.month

  const scrollToResults = useCallback(() => {
    requestAnimationFrame(() => {
      const el = resultsRef.current
      if (!el) return
      const reduce =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    })
  }, [])

  const runSearch = useCallback(
    (next) => {
      window.clearTimeout(timer.current)
      window.history.pushState({}, '', searchFromFilters(next))
      setPending(true)
      scrollToResults()
      timer.current = window.setTimeout(() => {
        setFilters(next)
        setSearched(true)
        setPending(false)
      }, SEARCH_DELAY_MS)
    },
    [scrollToResults],
  )

  useEffect(() => {
    const onPop = () => {
      window.clearTimeout(timer.current)
      setFilters(filtersFromSearch(window.location.search))
      setSearched(hasSearchParams(window.location.search))
      setPending(false)
      setResetKey((k) => k + 1)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <div className="rc-app">
      <Header />
      <Hero key={resetKey} defaults={filters} pending={pending} onSearch={runSearch} />
      <div id="results" ref={resultsRef}>
        <ResultsList
          results={results}
          nights={filters.nights}
          pending={pending}
          searched={searched}
          monthLabel={monthLabel}
          monthHasData={monthHasData}
        />
      </div>
      <Footer />
    </div>
  )
}
