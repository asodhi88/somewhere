/**
 * Header — brand + light nav. The shortlist/comparison flow is post-MVP
 * (CLAUDE.md §7b), so the "Shortlist" pill is present but inert for now; the
 * nav links jump to the footer note that explains the total-cost approach.
 */
export default function Header() {
  return (
    <header className="rc-header">
      <div className="rc-brand">
        <div className="rc-brand__mark" aria-hidden="true">
          🦝
        </div>
        <span className="rc-brand__name">raccoon</span>
      </div>
      <nav className="rc-nav">
        <a className="rc-nav__link" href="#rc-how">
          How it works
        </a>
        <a className="rc-nav__link" href="#rc-how">
          Why total cost
        </a>
        <span className="rc-pill">Shortlist · 0</span>
      </nav>
    </header>
  )
}
