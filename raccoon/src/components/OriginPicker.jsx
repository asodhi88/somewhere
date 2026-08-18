import Menu from './Menu'
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
 */
export default function OriginPicker({ value, onChange }) {
  return (
    <div className="rc-originbar">
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
    </div>
  )
}
