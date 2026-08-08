import { useEffect, useId, useRef, useState } from 'react'
import { getDestinationOptions } from '../lib/getDestinations'

/**
 * FeedbackForm — a quiet feedback affordance shared by the home footer and the
 * blind's CTA row. A muted trigger opens a small popover that POSTs to the
 * /api/feedback serverless function (which emails the owner via Resend).
 *
 * Deliberately understated (CLAUDE.md: "keep it quiet"): the trigger is a plain
 * muted button, and the form's one accent — its focus rings and Send button —
 * rides the per-load --ac tokens, so it matches whatever session colour is
 * active rather than a hardcoded amber.
 *
 * Fields: a required message, an optional reply email, and an optional city tag
 * (so a cost correction arrives labelled with the destination). A visually
 * hidden `company` honeypot catches bots — real users never see or tab to it.
 *
 * `placement` ("footer" | "blind") is only a styling hook; behaviour is shared.
 */

// Loaded once through the data seam (§7); the component never reads the JSON.
const DESTINATIONS = getDestinationOptions()

export default function FeedbackForm({ placement = 'footer' }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | success | error
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [company, setCompany] = useState('') // honeypot — stays empty for humans
  const [errorMsg, setErrorMsg] = useState('')

  const rootRef = useRef(null)
  const textareaRef = useRef(null)
  const uid = useId()

  const busy = status === 'submitting'

  const close = () => {
    setOpen(false)
    setErrorMsg('')
    setStatus((s) => (s === 'submitting' ? s : 'idle'))
  }

  // Focus the message field when the popover opens.
  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus()
  }, [open])

  // Close on a click outside the widget. Listener runs only while open.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Auto-dismiss shortly after a successful send.
  useEffect(() => {
    if (status !== 'success') return
    const t = setTimeout(() => {
      setOpen(false)
      setStatus('idle')
    }, 2600)
    return () => clearTimeout(t)
  }, [status])

  // Escape closes the popover. Stop it here so it doesn't also reach the blind's
  // document-level Escape handler (which would raise the whole blind).
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      close()
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    const msg = message.trim()
    if (!msg) {
      setErrorMsg('Add a short message first.')
      setStatus('error')
      textareaRef.current?.focus()
      return
    }
    setStatus('submitting')
    setErrorMsg('')
    const dest = DESTINATIONS.find((d) => d.id === destinationId)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          email: email.trim(),
          destination: dest ? `${dest.city}, ${dest.country}` : '',
          destinationId: dest ? dest.id : '',
          company, // honeypot
        }),
      })
      if (!res.ok) throw new Error('bad status')
      setStatus('success')
      setMessage('')
      setEmail('')
      setDestinationId('')
      setCompany('')
    } catch {
      setStatus('error')
      setErrorMsg('Could not send — please try again.')
    }
  }

  return (
    <div
      className={`rc-fb rc-fb--${placement}`}
      ref={rootRef}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className="rc-fb__trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none">
          <path
            d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v8A1.5 1.5 0 0 1 18.5 15H9l-4 3.6V5.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        Feedback
      </button>

      {open && (
        <div className="rc-fb__panel" role="dialog" aria-label="Send feedback">
          {status === 'success' ? (
            <div className="rc-fb__done" role="status">
              <span className="rc-fb__done-title">Thanks — got it.</span>
              <span className="rc-fb__done-sub">We read every note.</span>
            </div>
          ) : (
            <form className="rc-fb__form" onSubmit={submit} noValidate>
              <label className="rc-fb__label" htmlFor={`${uid}-msg`}>
                Feedback or a cost correction
              </label>
              <textarea
                id={`${uid}-msg`}
                ref={textareaRef}
                className="rc-fb__textarea"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What worked, what didn't, or what a trip really cost…"
                maxLength={5000}
              />

              <div className="rc-fb__field">
                <label className="rc-fb__label" htmlFor={`${uid}-city`}>
                  Tag a city <span className="rc-fb__opt">optional</span>
                </label>
                <div className="rc-fb__selectwrap">
                  <select
                    id={`${uid}-city`}
                    className="rc-fb__select"
                    value={destinationId}
                    onChange={(e) => setDestinationId(e.target.value)}
                  >
                    <option value="">No city</option>
                    {DESTINATIONS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.city}, {d.country}
                      </option>
                    ))}
                  </select>
                  <span className="rc-fb__caret" aria-hidden="true">▾</span>
                </div>
              </div>

              <div className="rc-fb__field">
                <label className="rc-fb__label" htmlFor={`${uid}-email`}>
                  Email <span className="rc-fb__opt">optional, for a reply</span>
                </label>
                <input
                  id={`${uid}-email`}
                  className="rc-fb__input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  maxLength={200}
                  autoComplete="email"
                />
              </div>

              {/* Honeypot — off-screen, not announced, never a tab stop. */}
              <div className="rc-fb__hp" aria-hidden="true">
                <label htmlFor={`${uid}-company`}>Company</label>
                <input
                  id={`${uid}-company`}
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>

              {status === 'error' && errorMsg && (
                <p className="rc-fb__error" role="alert">
                  {errorMsg}
                </p>
              )}

              <div className="rc-fb__actions">
                <span className="rc-fb__hint">No account needed.</span>
                <button type="submit" className="rc-fb__submit" disabled={busy}>
                  {busy ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
