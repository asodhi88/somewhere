/**
 * Header — brand + light nav. The shortlist/comparison flow is post-MVP
 * (CLAUDE.md §7b), so the "Shortlist" pill is present but inert for now.
 *
 * `onNavigate(path)` is the app's tiny router (App.jsx). "How it works" and the
 * brand are real anchors — so middle-click / open-in-new-tab and crawlers get a
 * true URL — but left-click SPA-navigates instead of doing a full reload.
 * `active` marks the current page so the matching nav item reads as current.
 *
 * `onHowItWorks`, when passed (by Home), makes the "How it works" link lower the
 * blind overlay in place rather than route to the standalone page — same
 * `/how-it-works` URL, so middle-click, refresh, and crawlers still get the page.
 */
export default function Header({ onNavigate, active, onHowItWorks }) {
  const go = (to) => (e) => {
    // Let modified clicks (new tab, etc.) fall through to the real navigation.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onNavigate?.(to)
  }

  const goHowItWorks = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    if (onHowItWorks) onHowItWorks()
    else onNavigate?.('/how-it-works')
  }

  return (
    <header className="rc-header">
      <a className="rc-brand" href="/" onClick={go('/')}>
        {/* Four-point star: each arm is one of the four brand accents, split
            into a light and dark facet. Fixed colors — not the per-load accent. */}
        <svg
          viewBox="0 0 100 100"
          width="30"
          height="30"
          aria-hidden="true"
          style={{ display: 'block', flex: 'none' }}
        >
          <path d="M50 6 L39 39 L50 50 Z" fill="#7BC9B8" />
          <path d="M50 6 L61 39 L50 50 Z" fill="#4B9A89" />
          <path d="M97 50 L61 39 L50 50 Z" fill="#F2B65C" />
          <path d="M97 50 L61 61 L50 50 Z" fill="#D8912C" />
          <path d="M50 94 L61 61 L50 50 Z" fill="#D25E46" />
          <path d="M50 94 L39 61 L50 50 Z" fill="#F28E78" />
          <path d="M3 50 L39 61 L50 50 Z" fill="#8C71B6" />
          <path d="M3 50 L39 39 L50 50 Z" fill="#BCA3DF" />
        </svg>
        <span className="rc-brand__name">somewhere</span>
      </a>
      <nav className="rc-nav">
        <a
          className={`rc-nav__link${active === 'how-it-works' ? ' is-active' : ''}`}
          href="/how-it-works"
          onClick={goHowItWorks}
          aria-current={active === 'how-it-works' ? 'page' : undefined}
        >
          How it works
        </a>
        <span className="rc-pill">Shortlist · 0</span>
      </nav>
    </header>
  )
}
