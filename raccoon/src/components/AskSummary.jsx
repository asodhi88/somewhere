import ScoutIcon from './ScoutIcon'
import { annotateQuery } from '../lib/askNotes'

/**
 * AskSummary — everything Scout has to say about a reading, stacked above the
 * search widget (design 1c, states 4–7).
 *
 * In order:
 *   1. the "Read as" card — the traveller's own sentence, kept visible, with the
 *      words the parse couldn't carry struck through in place
 *   2. the banners — an unsupported departure city, and a party of more than
 *      one. Prominent, because both change what the numbers mean
 *   3. the quiet note — everything else the form has no input for, as a sentence
 *
 * The card is also the way back in: tapping it re-opens the panel with the same
 * words, and the ✕ clears the reading entirely.
 */

/** The map pin from the design's origin-fallback banner. */
const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
)

/** One traveller, not a party — the banner's own mark. */
const PersonIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
  </svg>
)

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" strokeLinecap="round" />
    <circle cx="12" cy="16.3" r="0.5" fill="currentColor" stroke="none" />
  </svg>
)

const UnplugIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 5v6a7 7 0 0 0 7 7M20 19v-6a7 7 0 0 0-7-7" strokeLinecap="round" />
    <path d="M4 5l3 1M20 19l-3-1" strokeLinecap="round" />
  </svg>
)

/** Bold the quoted fragments inside a sentence, per the design's note style. */
function emphasise(text) {
  return text
    .split(/(“[^”]*”)/)
    .map((part, i) =>
      part.startsWith('“') ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>,
    )
}

export function AskFailure({ message, onRetry }) {
  return (
    <div className="rc-ask-note rc-ask-note--fail" role="status">
      <span className="rc-ask-note__body">
        <UnplugIcon />
        {message}
      </span>
      <button type="button" className="rc-ask-note__retry" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

export default function AskSummary({ query, parse, notes, onEdit, onClear }) {
  const segments = annotateQuery(query, parse)

  return (
    <>
      <div className="rc-ask-summary">
        {/* The card itself re-opens the panel with these words still in it. */}
        <button type="button" className="rc-ask-summary__open" onClick={onEdit}>
          <span className="rc-ask-summary__ic">
            <ScoutIcon size={17} />
          </span>
          <span className="rc-ask-summary__body">
            <span className="rc-ask-summary__k">Read as</span>
            <span className="rc-ask-summary__q">
              {segments.map((seg, i) =>
                seg.dead ? (
                  <span className="rc-tok--dead" key={i}>
                    {seg.text}
                    <span className="rc-toklab">{seg.label}</span>
                  </span>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </span>
          </span>
          <span className="rc-ask-summary__edit">tap to edit</span>
        </button>
        <button
          type="button"
          className="rc-ask-summary__x"
          onClick={onClear}
          aria-label="Clear this reading"
        >
          ✕
        </button>
      </div>

      {notes.origin && (
        <div className="rc-ask-banner">
          <PinIcon />
          <div>
            <strong>{notes.origin.lead}</strong> {notes.origin.rest}
          </div>
        </div>
      )}

      {notes.party && (
        <div className="rc-ask-banner">
          <PersonIcon />
          <div>
            <strong>{notes.party.lead}</strong> {notes.party.rest}
          </div>
        </div>
      )}

      {notes.unused && (
        <div className="rc-ask-note">
          <InfoIcon />
          <span>{emphasise(notes.unused)}</span>
        </div>
      )}
    </>
  )
}
