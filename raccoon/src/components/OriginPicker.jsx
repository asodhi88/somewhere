import Menu from './Menu'
import ArrowFillButton from './ui/ArrowFillButton'
import { ORIGIN_OPTIONS } from '../lib/searchState'

// Selectable departure cities become listbox rows ("Toronto · YYZ"); the rest
// collapse into one quiet "coming soon" line below them.
const ORIGIN_MENU = ORIGIN_OPTIONS.filter((o) => o.available).map((o) => ({
  value: o.value,
  label: `${o.city} · ${o.code}`,
}))
const HAS_COMING_SOON = ORIGIN_OPTIONS.some((o) => !o.available)

/**
 * OriginPicker — the "Leaving from" kicker plus the origin listbox that sits
 * directly above the search widget. The chosen origin is a real search
 * parameter, applied with the rest of the filters on the next "Show me where".
 * Uses the shared Menu (handoff §1) so it inherits the ambient surfaces and the
 * session accent; the "coming soon" note rides along as the panel footer.
 *
 * The row's right-hand slot is Scout's (Ask somewhere design 1c). It holds the
 * quiet "ask Scout" entry button until a reading exists, and after that it is
 * usually empty — the "Read as" card above is the way back in.
 *
 * `tag` is the one exception: "adjusted", when the departure city the traveller
 * named isn't one we fly from. The row used to narrate every outcome
 * ("assumed · tap to change", "from your words"); both were removed as noise.
 * See `originTag()` for why this one is different.
 */
export default function OriginPicker({
  value,
  onChange,
  tag = null,
  ring = false,
  onAsk = null,
  askActive = false,
}) {
  return (
    <div className={`rc-originbar${ring ? ' rc-originbar--adj' : ''}`}>
      <span className="rc-eyebrow">Leaving from</span>
      <Menu
        variant="origin"
        ariaLabel="Departure city"
        value={value}
        onChange={onChange}
        options={ORIGIN_MENU}
        placeholder="Toronto · YYZ"
        footer={
          HAS_COMING_SOON ? (
            <p className="rc-menu__note">Other departure cities coming soon.</p>
          ) : null
        }
      />
      {tag && <span className="rc-orig-tag">{tag}</span>}
      {onAsk && (
        <ArrowFillButton
          label="Ask AI"
          active={askActive}
          onClick={onAsk}
          aria-expanded={askActive}
        />
      )}
    </div>
  )
}
