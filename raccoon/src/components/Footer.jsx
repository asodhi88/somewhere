import FeedbackForm from './FeedbackForm'

/**
 * Footer — a quiet build tag on the left, a quiet feedback affordance on the
 * right (same shared component as the blind's CTA row).
 */
export default function Footer() {
  return (
    <footer className="rc-footer">
      <div className="rc-footer__left">
        <span className="rc-footer__meta tnum">somewhere · v1</span>
        <span className="rc-footer__meta">designed &amp; built by Aman in Toronto</span>
      </div>
      <FeedbackForm placement="footer" />
    </footer>
  )
}
