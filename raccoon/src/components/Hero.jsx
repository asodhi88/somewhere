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
          {/* Desktop headline: each sentence is a nowrap clause so it only ever
              breaks between sentences, never mid-sentence ("Say how / much").
              Mobile swaps in a shorter single line (toggled in index.css). */}
          <span className="rc-hero__title-lg">
            <span className="rc-hero__clause">Say when.</span>{' '}
            <span className="rc-hero__clause">Say how much.</span>{' '}
            <span className="rc-hero__clause">We&rsquo;ll say where.</span>
          </span>
          <span className="rc-hero__title-sm">find somewhere to go</span>
        </h1>
        <p className="rc-hero__sub">
          <span className="rc-hero__sub-lg">
            Destinations ranked by what the whole trip costs — flight, bed, and
            everything on the ground… so you can go somewhere!
          </span>
          <span className="rc-hero__sub-sm">
            We rank destinations by what the whole trip costs — flight, bed &amp;
            everything on the ground.
          </span>
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
