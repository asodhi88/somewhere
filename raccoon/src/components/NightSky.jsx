import { useMemo, useState } from 'react'

/**
 * NightSky — the hero's ambient background: a seeded star field, a moon drawn
 * at tonight's real phase (with a hover tooltip), drifting shooting stars, and
 * a single satellite pass. Ported from the "4a" direction of the Raccoon
 * Directions design doc.
 *
 * Motion is opt-out: every animated node carries data-motion, and transient
 * one-shots carry data-motion="transient" so `prefers-reduced-motion: reduce`
 * stills the twinkle and removes the shooters/satellite entirely (see index.css).
 *
 * `starsOnly` renders just the seeded field — no moon, shooters, or satellite —
 * for the How-it-works blind, which reuses the exact same star build at reduced
 * opacity rather than duplicating it (Blind.jsx). `fullField` (blind only) spreads
 * the field across the whole panel instead of reserving the hero's headline gap.
 *
 * The day ambient (data-ambient="day", desktop only) swaps the starfield/moon for
 * a sun disc + drifting cloud band. Both the night and day layers are always
 * rendered here; index.css decides which is visible per data-ambient and viewport,
 * scoped to the hero — so the blind (starsOnly) and the mobile hero always keep
 * the stars, and a resize can't strand the wrong sky. The sun/cloud only exist on
 * the full hero build, not the blind's starsOnly one.
 */

// Deterministic star field — same seed every render so the sky doesn't reshuffle.
// `fullField` scatters stars across the whole area (full-height bands, no reading
// gap) for the How-it-works blind; the default reserves the hero's headline space.
function buildStars(fullField = false) {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const out = []
  // Blind: three full-height bands cover the whole panel. Hero: bands hug the
  // edges and leave the centre for the headline (see `blocked` below).
  const bands = fullField
    ? [
        { x: [0, 22], y: [0, 100], n: 78 },
        { x: [78, 100], y: [0, 100], n: 78 },
        { x: [20, 80], y: [0, 100], n: 96 },
      ]
    : [
        { x: [0, 22], y: [3, 76], n: 72 },
        { x: [78, 100], y: [3, 76], n: 72 },
        { x: [20, 80], y: [1, 16], n: 38 },
        { x: [22, 78], y: [56, 78], n: 24 },
      ]
  const anims = ['rc-twinkleA', 'rc-twinkleB', 'rc-twinkleC']
  // Keep stars out of the headline's reading area (hero only).
  const blocked = (x, y) => x > 6 && x < 94 && y > 13 && y < 38
  bands.forEach((b, bi) => {
    for (let i = 0; i < b.n; i++) {
      const x = b.x[0] + rnd() * (b.x[1] - b.x[0])
      const y = b.y[0] + rnd() * (b.y[1] - b.y[0])
      if (!fullField && blocked(x, y)) continue
      const r = rnd()
      const size = r < 0.06 ? 4 : r < 0.24 ? 3 : r < 0.58 ? 2 : 1
      const edge = bi < 2 ? 1 : 0.88
      out.push({
        left: x.toFixed(2) + '%',
        top: y.toFixed(2) + '%',
        size: size + 'px',
        opacity: (0.3 + rnd() * 0.55 * edge).toFixed(2),
        anim: anims[Math.floor(rnd() * 3)],
        dur: (3.5 + rnd() * 3).toFixed(1) + 's',
        delay: (-rnd() * 7).toFixed(1) + 's',
      })
    }
  })
  return out
}

// Real lunar phase for "now": age within the synodic month → illuminated
// fraction → a terminator-ellipse SVG path, flipped for waxing vs waning.
function computeMoon() {
  const SYN = 29.530588853
  const ref = Date.UTC(2000, 0, 6, 18, 14) // a known new moon
  const age = ((((Date.now() - ref) / 86400000) % SYN) + SYN) % SYN
  const f = (1 - Math.cos((2 * Math.PI * age) / SYN)) / 2
  const waxing = age < SYN / 2
  const R = 24
  const cx = 25
  const top = cx - R
  const bot = cx + R
  const rx = Math.max(0.001, R * Math.abs(1 - 2 * f))
  // Crescent (< half lit): terminator bows toward the lit limb, carving the disc
  // down to a sliver. Gibbous (≥ half): it bows the other way, leaving most lit.
  const sweep = f < 0.5 ? 0 : 1
  const path = `M ${cx} ${top} A ${R} ${R} 0 0 1 ${cx} ${bot} A ${rx} ${R} 0 0 ${sweep} ${cx} ${top} Z`
  let name
  if (f < 0.02) name = 'New moon'
  else if (f < 0.46) name = waxing ? 'Waxing crescent' : 'Waning crescent'
  else if (f < 0.54) name = waxing ? 'First quarter' : 'Last quarter'
  else if (f < 0.98) name = waxing ? 'Waxing gibbous' : 'Waning gibbous'
  else name = 'Full moon'
  return {
    path,
    flip: waxing ? 'translate(0,0)' : 'translate(50,0) scale(-1,1)',
    label: `${name} · ${Math.round(f * 100)}% illuminated`,
  }
}

const SHOOTERS = [
  { top: '7%', left: '3%', dur: '17s', delay: '1s', rot: '27deg' },
  { top: '30%', left: '76%', dur: '19s', delay: '4s', rot: '39deg' },
  { top: '4%', left: '54%', dur: '16s', delay: '7s', rot: '21deg' },
  { top: '44%', left: '2%', dur: '18s', delay: '10s', rot: '33deg' },
  { top: '15%', left: '84%', dur: '20s', delay: '13s', rot: '46deg' },
  { top: '52%', left: '66%', dur: '21s', delay: '16s', rot: '25deg' },
]

// Three slow-blinking satellites drifting across the sky. Randomised top /
// duration / delay / rise, ~35% mirrored (right→left). The horizontal travel is
// 120vw so a dot always clears the panel regardless of viewport; the rise is fed
// to the keyframe as --sat-dy. data-motion="transient" removes them all under
// prefers-reduced-motion (the existing [data-motion='transient'] rule).
const SATS = [
  { top: '14%', dur: '15s', delay: '-3s', rise: -64, mirror: false },
  { top: '58%', dur: '22s', delay: '-11s', rise: -38, mirror: true },
  { top: '34%', dur: '18s', delay: '-7s', rise: -76, mirror: false },
]

export default function NightSky({ showMoon = true, starsOnly = false, fullField = false }) {
  const stars = useMemo(() => buildStars(fullField), [fullField])
  const moon = useMemo(() => computeMoon(), [])
  const [moonHover, setMoonHover] = useState(false)

  return (
    <div className="rc-sky" aria-hidden="true">
      {stars.map((s, i) => (
        <div
          key={i}
          data-motion="1"
          className="rc-star"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            animationName: s.anim,
            animationDuration: s.dur,
            animationDelay: s.delay,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
          }}
        />
      ))}

      {!starsOnly && showMoon && (
        <div
          className="rc-moon"
          onMouseEnter={() => setMoonHover(true)}
          onMouseLeave={() => setMoonHover(false)}
        >
          <svg viewBox="0 0 50 50" width="52" height="52">
            <circle
              cx="25"
              cy="25"
              r="24"
              fill="none"
              stroke="#F5F0E8"
              strokeOpacity=".16"
              strokeWidth="1"
            />
            <path d={moon.path} transform={moon.flip} fill="#F5F0E8" fillOpacity=".62" />
          </svg>
          {moonHover && <div className="rc-moon__tip">{moon.label}</div>}
        </div>
      )}

      {!starsOnly &&
        SHOOTERS.map((sh, i) => (
          <div
            key={i}
            data-motion="transient"
            className="rc-shooter"
            style={{
              left: sh.left,
              top: sh.top,
              rotate: sh.rot,
              animationDuration: sh.dur,
              animationDelay: sh.delay,
            }}
          />
        ))}

      {!starsOnly &&
        SATS.map((s, i) => (
          <div
            key={i}
            data-motion="transient"
            className={`rc-sat${s.mirror ? ' rc-sat--mirror' : ''}`}
            style={{
              top: s.top,
              animationDuration: s.dur,
              animationDelay: s.delay,
              // Travel direction flips for mirrored dots; --sat-dy is the rise.
              '--sat-dx': s.mirror ? '-120vw' : '120vw',
              '--sat-dy': `${s.rise}px`,
            }}
          >
            <div className="rc-sat__dot" />
          </div>
        ))}

      {/* Day layer — a glowing sun disc + drifting cloud band. Hidden by CSS
          except in the desktop day hero (index.css). Only on the full build, not
          the blind's starsOnly field. data-motion so reduced motion stills them. */}
      {!starsOnly && (
        <>
          <div className="rc-sun" data-motion="1" />
          <div className="rc-clouds" data-motion="1" />
        </>
      )}
    </div>
  )
}
