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
          {/* Each sentence is a nowrap clause so the headline only ever breaks
              between sentences, never mid-sentence ("Say how / much"). */}
          <span className="rc-hero__clause">Say when.</span>{' '}
          <span className="rc-hero__clause">Say how much.</span>{' '}
          <span className="rc-hero__clause">We&rsquo;ll say where.</span>
        </h1>
        <p className="rc-hero__sub">
          Destinations ranked by what the whole trip costs — flight, bed, and
          everything on the ground.
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
