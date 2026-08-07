/**
 * Header — brand + light nav. The shortlist/comparison flow is post-MVP
 * (CLAUDE.md §7b), so the "Shortlist" pill is present but inert for now.
 */
export default function Header() {
  return (
    <header className="rc-header">
      <div className="rc-brand">
        <div className="rc-brand__mark" aria-hidden="true">
          🦝
        </div>
        <span className="rc-brand__name">somewhere</span>
      </div>
      <nav className="rc-nav">
        {/* Plain text, not a link: there's no "how it works" page yet, and a
            nav item that looks clickable but does nothing is worse than none.
            Restore the <a href> once the page exists. */}
        <span className="rc-nav__text">How it works</span>
        <span className="rc-pill">Shortlist · 0</span>
      </nav>
    </header>
  )
}
