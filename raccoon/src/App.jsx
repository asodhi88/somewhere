import { useCallback, useEffect, useState } from 'react'
import Home from './Home'
import HowItWorks from './components/HowItWorks'

// Two pages, so no router library — the app already drives history.pushState by
// hand for search state (Home.jsx), and this keeps that same seam. `navigate`
// pushes a path; a popstate listener reflects back/forward. Deep links resolve
// because Vercel rewrites every path to index.html (vercel.json) and Vite's dev
// server does the SPA fallback on its own.
export default function App() {
  const [path, setPath] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )

  const navigate = useCallback((to) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to)
      setPath(to)
    }
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (path === '/how-it-works') {
    return <HowItWorks onNavigate={navigate} />
  }
  return <Home onNavigate={navigate} />
}
