import NightSky from './NightSky'
import SearchBar from './SearchBar'
import heroImg from '../assets/hero-base-warm.png'

/**
 * Hero — the search-first panel: night sky behind, the pitch stacked in the
 * upper middle, the search bar as the loudest thing on the screen, and the
 * landmark mural dropping to a quiet horizon band beneath it.
 */
export default function Hero({ defaults, pending, onSearch }) {
  return (
    <section className="rc-hero">
      <NightSky />

      <div className="rc-hero__content">
        <span className="rc-eyebrow">Departing Toronto · YYZ</span>
        <h1 className="rc-hero__title">
          Pick a week and a budget. We&rsquo;ll pick the window seat.
        </h1>
        <p className="rc-hero__sub">
          Every city ranked by what the whole trip costs — flight, bed, and the
          week you spend once you land.
        </p>
        <SearchBar defaults={defaults} pending={pending} onSearch={onSearch} />
      </div>

      <div className="rc-hero__image" data-motion="1">
        <img src={heroImg} alt="" />
      </div>
    </section>
  )
}
