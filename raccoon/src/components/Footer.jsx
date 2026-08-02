/**
 * Footer — the honesty line (estimates as ranges, no booking) and a build tag.
 * Anchored as #rc-how so the header nav links land here.
 */
export default function Footer() {
  return (
    <footer className="rc-footer" id="rc-how">
      <span>
        Estimates, always as ranges. We don&rsquo;t book anything — we hand you
        off to Google Flights.
      </span>
      <span className="rc-footer__meta tnum">raccoon · v1 · YYZ only</span>
    </footer>
  )
}
