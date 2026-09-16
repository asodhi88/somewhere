import { useId, useRef, useState } from 'react'
import { ASK_EXAMPLES, resolveExample } from '../lib/askExamples'
import { isParse, readParse } from '../lib/askNotes'

/**
 * AskBox — "Scout", the natural-language way into the existing search form.
 *
 * Scout reads, fills, and discloses. It does not rank, price, pick or recommend
 * anything: it POSTs the traveller's words to /api/ask, which returns the five
 * form inputs plus what it assumed and what it couldn't map, and the untouched
 * ranking engine runs on the form exactly as if the fields had been typed.
 *
 * Because of that, Scout is a label, not a persona — no avatar, no voice, no
 * chat bubbles, no history, no follow-up turns. One box, one fill.
 *
 * What lives here vs. in the form:
 *   - here  — the disclosures about the QUERY: an unsupported departure city, a
 *             party of more than one, and the "couldn't use" sentence
 *   - form  — the disclosures about a FIELD: the brief highlight on the fields
 *             Scout set, and the "· assumed, tap to change" note under each
 *             field the form filled itself (SearchBar / MobileSearch)
 *
 * The form never depends on this component. Every failure path here ends in one
 * neutral line and a form that still works.
 */

// Mirrors MAX_QUERY_CHARS in api/_lib/askSchema.js. The endpoint refuses
// anything longer before it spends a token; the input stops it before that.
const MAX_CHARS = 200
// Only start counting down near the cap — a counter on an empty box is noise.
const COUNTER_FROM = 160

const EMPTY_NOTES = { origin: null, party: null, unused: null }

/** The app's compass mark, cut down to a single needle. Not an AI sparkle. */
function ScoutMark() {
  return (
    <svg viewBox="0 0 100 100" width="16" height="16" aria-hidden="true" className="rc-ask__mark">
      <path d="M50 8 L38 52 L50 50 Z" fill="var(--ac-hi)" />
      <path d="M50 8 L62 52 L50 50 Z" fill="var(--ac)" />
      <path d="M50 92 L62 48 L50 50 Z" fill="var(--ac-lo)" />
      <path d="M50 92 L38 48 L50 50 Z" fill="var(--ac)" opacity="0.55" />
    </svg>
  )
}

export default function AskBox({ onApply }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | filled | error
  const [error, setError] = useState('')
  const [notes, setNotes] = useState(EMPTY_NOTES)
  const inputRef = useRef(null)
  const uid = useId()

  const loading = status === 'loading'
  const trimmed = query.trim()
  // The curated examples are the empty state — they disappear the moment the
  // traveller starts writing their own.
  const showExamples = trimmed === ''
  const left = MAX_CHARS - query.length

  /** Hand a parse to the form and keep the query-level disclosures here. */
  const apply = (parse) => {
    const read = readParse(parse)
    setNotes(read.notes)
    setStatus('filled')
    setError('')
    onApply(read)
  }

  // A curated example is already verified (src/lib/askExamples.js), so clicking
  // one fills the form with no request, no cost, and no chance of a bad parse.
  const fillFromExample = (example) => {
    setQuery(example.query)
    apply(resolveExample(example))
    inputRef.current?.focus()
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!trimmed || loading) return
    setStatus('loading')
    setError('')
    // The notes are NOT cleared here. They describe the values currently in the
    // form, and those stay until a new parse replaces them — clearing them now
    // would strip an origin-fallback or party disclosure off numbers that are
    // still on screen.
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !isParse(data)) {
        // The endpoint's own messages are already neutral and already point the
        // traveller back at the form (see api/ask.js), so they are used as
        // written. Only a failure with no message of its own — a network drop, a
        // proxy error page — falls back to this one.
        throw new Error(
          data?.error || 'Couldn’t read that just now — the form still works.',
        )
      }
      apply(data)
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  return (
    <section className="rc-ask" aria-labelledby={`${uid}-t`}>
      <div className="rc-ask__head">
        <h2 className="rc-ask__title" id={`${uid}-t`}>
          <ScoutMark />
          Scout
        </h2>
        <p className="rc-ask__lede" id={`${uid}-l`}>
          Describe the trip in your own words and Scout fills the form above. It only
          reads your words into the inputs — the search does the rest.
        </p>
      </div>

      <form className="rc-ask__form" onSubmit={submit}>
        <div className="rc-ask__field">
          <input
            ref={inputRef}
            type="text"
            className="rc-ask__input"
            value={query}
            maxLength={MAX_CHARS}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="a week somewhere warm in February, under $2,000"
            aria-label="Describe your trip"
            aria-describedby={`${uid}-l`}
            enterKeyHint="go"
          />
          {left <= MAX_CHARS - COUNTER_FROM && (
            <span className="rc-ask__count tnum" aria-hidden="true">
              {left}
            </span>
          )}
        </div>
        <button type="submit" className="rc-ask__go" disabled={loading || !trimmed}>
          {loading ? 'Reading…' : 'Fill the form'}
        </button>
      </form>

      {showExamples && (
        <div className="rc-ask__examples">
          <span className="rc-ask__exlabel">For example</span>
          <ul className="rc-ask__exlist">
            {ASK_EXAMPLES.map((ex) => (
              <li key={ex.query}>
                <button
                  type="button"
                  className="rc-ask__ex"
                  onClick={() => fillFromExample(ex)}
                >
                  {ex.query}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* One live region for every outcome, so a screen reader hears the result
          of a fill in the order the page shows it. */}
      <div className="rc-ask__out" aria-live="polite">
        {status === 'error' && <p className="rc-ask__error">{error}</p>}

        {/* Prominent: both of these change what the numbers mean. */}
        {notes.origin && (
          <p className="rc-ask__flag">
            <span className="rc-ask__flag-mark" aria-hidden="true" />
            {notes.origin}
          </p>
        )}
        {notes.party && (
          <p className="rc-ask__flag">
            <span className="rc-ask__flag-mark" aria-hidden="true" />
            {notes.party}
          </p>
        )}

        {/* Quiet, and a sentence rather than chips: the model's wording varies
            between identical queries, so chips would look unstable. */}
        {notes.unused && <p className="rc-ask__unused">{notes.unused}</p>}

        {status === 'filled' && (
          <p className="rc-ask__ok">
            Form filled. Change anything that&rsquo;s wrong, then search.
          </p>
        )}
      </div>
    </section>
  )
}
