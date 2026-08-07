/**
 * Header — brand + light nav. The shortlist/comparison flow is post-MVP
 * (CLAUDE.md §7b), so the "Shortlist" pill is present but inert for now.
 *
 * `onNavigate(path)` is the app's tiny router (App.jsx). "How it works" and the
 * brand are real anchors — so middle-click / open-in-new-tab and crawlers get a
 * true URL — but left-click SPA-navigates instead of doing a full reload.
 * `active` marks the current page so the matching nav item reads as current.
 */
export default function Header({ onNavigate, active }) {
  const go = (to) => (e) => {
    // Let modified clicks (new tab, etc.) fall through to the real navigation.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onNavigate?.(to)
  }

  return (
    <header className="rc-header">
      <a className="rc-brand" href="/" onClick={go('/')}>
        <div className="rc-brand__mark" aria-hidden="true">
          🦝
        </div>
        <span className="rc-brand__name">somewhere</span>
      </a>
      <nav className="rc-nav">
        <a
          className={`rc-nav__link${active === 'how-it-works' ? ' is-active' : ''}`}
          href="/how-it-works"
          onClick={go('/how-it-works')}
          aria-current={active === 'how-it-works' ? 'page' : undefined}
        >
          How it works
        </a>
        <span className="rc-pill">Shortlist · 0</span>
      </nav>
    </header>
  )
}
