import { useState } from 'react'
import NightSky from './NightSky'
import SearchBar from './SearchBar'
import OriginPicker from './OriginPicker'
import heroImg from '../assets/hero-base-warm.png'

/**
 * Hero — the search-first panel: night sky behind, the pitch stacked in the
 * upper middle, then the origin control + search bar as one left-aligned group,
 * and the landmark mural dropping to a quiet horizon band beneath it.
 *
 * Origin lives here (not inside SearchBar): the picker sets it, and it's merged
 * into the filters the search bar submits, so it flows through the seam and URL
 * exactly like budget/nights/month/stay.
 */
export default function Hero({ defaults, pending, onSearch }) {
  const [origin, setOrigin] = useState(defaults.origin)

  return (
    <section className="rc-hero">
      <NightSky />

      <div className="rc-hero__content">
        <h1 className="rc-hero__title">
          Pick a week and a budget. We&rsquo;ll pick the window seat.
        </h1>
        <p className="rc-hero__sub">
          Every city ranked by what the whole trip costs — flight, bed, and the
          week you spend once you land.
        </p>

        <div className="rc-searchgroup">
          <OriginPicker value={origin} onChange={setOrigin} />
          <SearchBar
            defaults={defaults}
            pending={pending}
            onSearch={(fields) => onSearch({ ...fields, origin })}
          />
        </div>
      </div>

      <div className="rc-hero__image" data-motion="1">
        <img src={heroImg} alt="" />
      </div>
    </section>
  )
}
