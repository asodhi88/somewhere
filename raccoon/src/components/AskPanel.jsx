import { useEffect, useMemo, useRef, useState } from 'react'
import ScoutIcon from './ScoutIcon'
import { ASK_EXAMPLES } from '../lib/askExamples'
import { MAX_QUERY_CHARS } from '../lib/askClient'

/**
 * AskPanel — the query box, which opens INSIDE the search widget's own shell and
 * takes the place of the field grid (design 1c, states 1–3). Closing it returns
 * the form untouched; the form is never unmounted, so a half-typed budget
 * survives a trip through Scout.
 *
 * Presentational plus a local draft. It does not fetch, does not hold the parse,
 * and does not render any disclosure — Hero owns all of that, because the
 * disclosures outlive the panel (they sit above the filled form once it closes).
 *
 * Scout is a label, not a persona: no avatar, no voice, no history, no follow-up
 * turns. One box, one reading.
 */

/**
 * The closest curated example to what is being typed, by word overlap.
 *
 * This is string matching against three stored strings — NOT a parse. Nothing
 * here reads the trip; the label says "closest example" and means it. Returns
 * null until there is enough typed to be meaningful, so the chips stay a plain
 * menu while the box is empty.
 */
function closestExample(query) {
  const words = query.toLowerCase().match(/[a-z0-9$,]+/g) || []
  if (words.length < 2) return null
  let best = null
  let bestScore = 0
  for (const ex of ASK_EXAMPLES) {
    const exWords = new Set(ex.query.toLowerCase().match(/[a-z0-9$,]+/g) || [])
    const score = words.filter((w) => exWords.has(w)).length
    if (score > bestScore) {
      bestScore = score
      best = ex
    }
  }
  return bestScore >= 2 ? best : null
}

export default function AskPanel({
  initialQuery = '',
  loading = false,
  onSubmit,
  onClose,
  onUseExample,
}) {
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef(null)

  // Opening the panel puts the caret in the box — it is the only thing to do
  // here. Closing hands focus back to whatever opened it (the entry button, or
  // the "Read as" card), so a keyboard user is never dropped on <body>. The
  // trigger can be replaced while the panel is open — a fill swaps the entry
  // button for the card — so this checks the element is still in the document.
  useEffect(() => {
    const opener = document.activeElement
    const el = inputRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
    return () => {
      if (opener && opener !== document.body && document.contains(opener)) opener.focus()
    }
  }, [])

  const trimmed = query.trim()
  const closest = useMemo(() => (trimmed ? closestExample(trimmed) : null), [trimmed])
  const left = MAX_QUERY_CHARS - query.length

  const submit = (e) => {
    e.preventDefault()
    if (!trimmed || loading) return
    onSubmit(trimmed)
  }

  // Enter reads the trip and runs the search; Shift+Enter is a newline, and
  // Escape backs out to the form — the panel is a detour, never a trap.
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(e)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <form className="rc-search rc-search--ask" onSubmit={submit}>
      <span className="rc-search__trace" data-motion="1" aria-hidden="true" />

      <div className="rc-ask-head">
        <span className="rc-ask-title">
          <ScoutIcon size={17} />
          Describe your trip
        </span>
        <button
          type="button"
          className="rc-ask-close"
          onClick={onClose}
          aria-label="Close Ask AI and go back to the form"
        >
          ✕
        </button>
      </div>

      <div className="rc-ask-inputwrap">
        <textarea
          ref={inputRef}
          className="rc-ask-input"
          value={query}
          rows={2}
          maxLength={MAX_QUERY_CHARS}
          disabled={loading}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="A warm beach week in February under $2,000…"
          aria-label="Describe your trip in your own words"
        />
        {/* Only near the cap — a counter on an empty box is noise. */}
        {left <= 40 && (
          <span className="rc-ask-count tnum" aria-hidden="true">
            {left}
          </span>
        )}
      </div>

      {loading ? (
        <>
          <div className="rc-ask-prog" data-motion="1" aria-hidden="true" />
          <div className="rc-ask-foot rc-ask-foot--end">
            {/* Same pending word the form's CTA uses, so one press reads as one
                action: `rc-search__submit` lower-cases it to "searching…",
                exactly as it renders on the button behind the panel. */}
            <button type="submit" className="rc-search__submit rc-ask-go is-dim" disabled>
              Searching…
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="rc-ask-chipsrow">
            <span className="rc-ask-chipslab">
              {closest ? 'closest example' : 'try one of these'}
            </span>
            <div className="rc-ask-chips">
              {ASK_EXAMPLES.map((ex) => {
                const hot = closest && closest.query === ex.query
                const dim = closest && !hot
                return (
                  <button
                    key={ex.query}
                    type="button"
                    className={`rc-ask-chip${hot ? ' is-hot' : ''}${dim ? ' is-dim' : ''}`}
                    onClick={() => {
                      setQuery(ex.query)
                      onUseExample(ex)
                    }}
                  >
                    {ex.query}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rc-ask-foot rc-ask-foot--end">
            {/* This IS the search CTA, same label and same action as the one on
                the form behind it — reading the trip and running the search are
                one press, not two. */}
            <button
              type="submit"
              className={`rc-search__submit rc-ask-go${trimmed ? '' : ' is-dim'}`}
              disabled={!trimmed}
            >
              Show me where →
            </button>
          </div>
        </>
      )}
    </form>
  )
}
