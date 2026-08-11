import { useCallback } from 'react'
import Home from './Home'

// Single-page app. Both "/" and "/how-it-works" render Home; the How-it-works
// content IS the blind overlay, so there is no separate page to route to. Home
// owns the blind's open state — it opens the blind when the header link is
// clicked and also when the app loads directly on /how-it-works (so the URL and
// the in-app link show the same, current version). `navigate` is kept for the
// header's fallback links (a middle-click still uses the real anchor href).
export default function App() {
  const navigate = useCallback((to) => {
    if (to !== window.location.pathname) window.history.pushState({}, '', to)
    window.scrollTo({ top: 0 })
  }, [])

  return <Home onNavigate={navigate} />
}
