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
 */

// Deterministic star field — same seed every render so the sky doesn't reshuffle.
function buildStars() {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const out = []
  const bands = [
    { x: [0, 22], y: [3, 76], n: 72 },
    { x: [78, 100], y: [3, 76], n: 72 },
    { x: [20, 80], y: [1, 16], n: 38 },
    { x: [22, 78], y: [56, 78], n: 24 },
  ]
  const anims = ['rc-twinkleA', 'rc-twinkleB', 'rc-twinkleC']
  // Keep stars out of the headline's reading area.
  const blocked = (x, y) => x > 6 && x < 94 && y > 13 && y < 38
  bands.forEach((b, bi) => {
    for (let i = 0; i < b.n; i++) {
      const x = b.x[0] + rnd() * (b.x[1] - b.x[0])
      const y = b.y[0] + rnd() * (b.y[1] - b.y[0])
      if (blocked(x, y)) continue
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
  const sweep = f < 0.5 ? 1 : 0
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

export default function NightSky() {
  const stars = useMemo(() => buildStars(), [])
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

      {SHOOTERS.map((sh, i) => (
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

      <div data-motion="transient" className="rc-sat">
        <div className="rc-sat__dot" />
      </div>
    </div>
  )
}
