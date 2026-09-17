/**
 * ScoutIcon — the mark from the Ask somewhere design (1c), used on the entry
 * button, the panel header and the "Read as" card.
 *
 * Deliberately not an AI sparkle: two lines of text on the left, a chevron, and
 * a single filled cell on the right. It reads as "words go in, a field comes
 * out" — which is the whole of what Scout does.
 */
export default function ScoutIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="3" y="6" width="9" height="2.3" rx="1.15" fill="currentColor" />
      <rect x="3" y="11" width="6" height="2.3" rx="1.15" fill="currentColor" opacity="0.55" />
      <path
        d="M14.5 9.5 L17.5 12 L14.5 14.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="19.3" y="10.9" width="2.4" height="2.3" rx="1.15" fill="currentColor" />
    </svg>
  )
}
