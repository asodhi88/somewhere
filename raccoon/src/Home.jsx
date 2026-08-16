import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import ResultsList from './components/ResultsList'
import Footer from './components/Footer'
import Lightbox from './components/Lightbox'
import Blind from './components/Blind'
import { getDestinations, getAvailableMonths } from './lib/getDestinations'
import {
  filtersFromSearch,
  searchFromFilters,
  hasSearchParams,
  loadStoredFilters,
  storeFilters,
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

// The home view: search-first hero + ranked results. `onNavigate` routes to
// other pages (the How-it-works link in the header); search state stays on "/".
export default function Home({ onNavigate }) {
  const search = typeof window !== 'undefined' ? window.location.search : ''
  // A shared/bookmarked link (query present) always wins. On a bare "/", fall
  // back to the remembered last search so the composer opens on the user's own
  // picks (§4.3 layer 2) — this prefills only; results still wait for a search.
  const [filters, setFilters] = useState(
    () => (hasSearchParams(search) ? filtersFromSearch(search) : loadStoredFilters()) || filtersFromSearch(search),
  )
  // Results stay hidden until an explicit search. A bare visit shows the prompt;
  // a shared/bookmarked link (query present) counts as that search, so the link
  // still lands on results (CLAUDE.md §4.3 — the share link is the prize).
  const [searched, setSearched] = useState(() => hasSearchParams(search))
  const [pending, setPending] = useState(false)
  // Bumped only on browser back/forward so the search bar re-reads the URL.
  const [resetKey, setResetKey] = useState(0)
  // Bumped on every explicit search so ResultsList remounts the cards and the
  // rise-in animation replays (starts at 0 so an initial URL-param load animates).
  const [searchNonce, setSearchNonce] = useState(0)
  // The photo currently enlarged in the lightbox (null when closed).
  const [lightbox, setLightbox] = useState(null)
  // The "How it works" blind — the sole /how-it-works presentation. Home owns the
  // open state and the pushState; a direct hit / refresh on /how-it-works opens
  // the blind on load (App always renders Home), so the URL and the header link
  // show the same current version.
  const [blindOpen, setBlindOpen] = useState(
    () => typeof window !== 'undefined' && window.location.pathname === '/how-it-works',
  )
  // Did we push /how-it-works ourselves (vs. landing on it directly)? Decides
  // whether closing goes Back (restoring the search underneath) or replaces the
  // entry with "/" (a direct load has nothing to fall back to).
  const blindPushedRef = useRef(false)
  // Back-to-top affordance: only once the user has searched and scrolled into
  // the results.
  const [showTop, setShowTop] = useState(false)
  const timer = useRef(null)
  const resultsRef = useRef(null)

  const availableMonths = useMemo(() => getAvailableMonths(filters.origin), [filters.origin])

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

  // Lower the blind: push /how-it-works so Back closes it for free, but don't
  // route through App's navigate — Home stays mounted and shows the overlay.
  const openBlind = useCallback(() => {
    if (window.location.pathname === '/how-it-works') return
    window.history.pushState({}, '', '/how-it-works')
    blindPushedRef.current = true
    setBlindOpen(true)
  }, [])

  // Raise the blind. If we pushed /how-it-works ourselves, Back restores the
  // search URL underneath (pushState kept the query on the entry beneath). If the
  // user landed on /how-it-works directly, there's nothing to go back to, so we
  // replace the entry with a clean "/". The popstate handler keeps the flag honest.
  const closeBlind = useCallback(() => {
    setBlindOpen(false)
    if (window.location.pathname !== '/how-it-works') return
    if (blindPushedRef.current) {
      blindPushedRef.current = false
      window.history.back()
    } else {
      window.history.replaceState({}, '', '/')
    }
  }, [])

  // Reset to a clean homepage: clear the search, results, and any open blind, and
  // land on "/". Wired to every "somewhere" mark (header + blind), so the brand is
  // a uniform "start over" from anywhere in the app.
  const resetToHome = useCallback(() => {
    window.clearTimeout(timer.current)
    window.history.pushState({}, '', '/')
    setBlindOpen(false)
    setFilters(filtersFromSearch(''))
    setSearched(false)
    setPending(false)
    setResetKey((k) => k + 1)
    setSearchNonce(0)
    window.scrollTo({ top: 0 })
  }, [])

  const runSearch = useCallback(
    (next) => {
      window.clearTimeout(timer.current)
      window.history.pushState({}, '', searchFromFilters(next))
      storeFilters(next) // remember these picks for the next bare visit
      setPending(true)
      setSearchNonce((n) => n + 1)
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
      setPending(false)
      // Popping onto /how-it-works only re-opens the blind; leave the search
      // state untouched so the page behind it is preserved. Popping back to "/"
      // restores filters/results from the URL (the query rode the entry beneath
      // the pushed /how-it-works).
      const onHiw = window.location.pathname === '/how-it-works'
      setBlindOpen(onHiw)
      // Reached /how-it-works via history → there's an adjacent entry, so closing
      // can safely go Back.
      blindPushedRef.current = onHiw
      if (!onHiw) {
        setFilters(filtersFromSearch(window.location.search))
        setSearched(hasSearchParams(window.location.search))
        setResetKey((k) => k + 1)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.clearTimeout(timer.current)
    }
  }, [])

  // While the blind is down: lock page scroll and let Escape raise it (mirrors
  // the Lightbox pattern).
  useEffect(() => {
    if (!blindOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeBlind()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [blindOpen, closeBlind])

  // Reveal the back-to-top button once the results have scrolled up past the fold.
  useEffect(() => {
    const onScroll = () => {
      const el = resultsRef.current
      const show = searched && !!el && el.getBoundingClientRect().top < 80
      setShowTop((prev) => (prev === show ? prev : show))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [searched])

  const scrollToTop = useCallback(() => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }, [])

  return (
    <>
      {/* The homepage is the "window" — it blurs while the blind is down. The
          blind is a sibling, not a child, so its position:fixed stays anchored
          to the viewport (a filter on .rc-app would otherwise trap it). */}
      <div className={`rc-app${blindOpen ? ' rc-app--blurred' : ''}`}>
        <Header onNavigate={onNavigate} onHowItWorks={openBlind} onHome={resetToHome} />
        <Hero key={resetKey} defaults={filters} pending={pending} onSearch={runSearch} />
        <div id="results" ref={resultsRef}>
          <ResultsList
            results={results}
            nights={filters.nights}
            pending={pending}
            searched={searched}
            monthLabel={monthLabel}
            monthHasData={monthHasData}
            searchNonce={searchNonce}
            onOpenLightbox={setLightbox}
          />
        </div>
        <Footer />

        <button
          type="button"
          className={`rc-backtotop${showTop ? ' is-visible' : ''}`}
          onClick={scrollToTop}
          aria-label="Back to top"
          aria-hidden={!showTop}
          tabIndex={showTop ? 0 : -1}
        >
          <span aria-hidden="true">↑</span> Top
        </button>

        {lightbox && <Lightbox image={lightbox} onClose={() => setLightbox(null)} />}
      </div>

      <Blind open={blindOpen} onClose={closeBlind} onHome={resetToHome} />
    </>
  )
}
