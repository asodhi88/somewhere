import Header from './Header'
import Footer from './Footer'
import NightSky from './NightSky'

/**
 * HowItWorks — the "5b" direction from the Raccoon Directions design doc: a
 * moonless starfield hero, a four-step vertical rail, and a side-by-side "why
 * total cost" comparison that makes the product's core argument (a cheap flight
 * is not a cheap trip — CLAUDE.md §3).
 *
 * Reached from the header's "How it works" link; the closing CTA routes back to
 * the search page via the app router (App.jsx).
 */

const STEPS = [
  {
    n: '1',
    title: 'Set a budget, not a destination',
    body: 'Total spend, nights, month, bed. Four inputs, no account, no email.',
  },
  {
    n: '2',
    title: 'We add up all three costs',
    body: "Fare, every night of bed, and what a day on the ground costs in that city. Ranges only — we'd rather be honest than precise.",
  },
  {
    n: '3',
    title: 'Six cities, two per region',
    body: 'Sorted by total trip cost, capped by region so the list is a real choice. Open any row for the breakdown.',
  },
  {
    n: '4',
    title: 'Then we get out of the way',
    tag: 'Coming soon',
    body: "We don't book, upsell, or hold your card. One tap sends you to Google Flights with the dates filled in.",
  },
]

// Two real results that invert once you price the whole week, not just the fare
// (mid-range, 7 nights, October — verifiable against their own result cards).
// segs are [flight, stay, ground] shares of the low-end breakdown, in percent.
const COMPARE = [
  { city: 'Bangkok', fare: '$1,200', total: '$1,760–2,565', segs: [68, 22, 10] },
  { city: 'Reykjavík', fare: '$650', total: '$2,330–3,700', segs: [28, 45, 27] },
]

const SEG_CLASSES = ['flight', 'stay', 'ground']

export default function HowItWorks({ onNavigate }) {
  const goHome = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onNavigate?.('/')
  }

  return (
    <div className="rc-app">
      <Header onNavigate={onNavigate} active="how-it-works" />

      <main className="rc-hiw">
        <section className="rc-hiw-hero">
          <NightSky showMoon={false} />
          <div className="rc-hiw-hero__content">
            <span className="rc-eyebrow">How it works</span>
            <h1 className="rc-hiw-hero__title">A cheap flight isn&rsquo;t a cheap trip.</h1>
            <p className="rc-hiw-hero__sub">
              So we stopped ranking flights. Four steps, one honest number, and a
              shortlist of places your trip actually fits.
            </p>
          </div>
        </section>

        <div className="rc-hiw-body">
          <div className="rc-hiw-intro">
            <span className="rc-eyebrow">The four steps</span>
            <h2 className="rc-hiw-intro__title">It&rsquo;s simple</h2>
          </div>

          <div className="rc-hiw-cols">
            <ol className="rc-hiw-rail">
              {STEPS.map((s, i) => {
                const last = i === STEPS.length - 1
                return (
                  <li className="rc-hiw-step" key={s.n}>
                    <div className="rc-hiw-step__marker">
                      <span className={`rc-hiw-step__num${last ? ' is-muted' : ''}`} aria-hidden="true">
                        {s.n}
                      </span>
                      {!last && <span className="rc-hiw-step__line" />}
                    </div>
                    <div className="rc-hiw-step__text">
                      <h3 className="rc-hiw-step__title">
                        {s.title}
                        {s.tag && <span className="rc-hiw-step__tag">{s.tag}</span>}
                      </h3>
                      <p className="rc-hiw-step__desc">{s.body}</p>
                    </div>
                  </li>
                )
              })}
            </ol>

            <aside className="rc-hiw-why">
              <span className="rc-eyebrow">Why total cost</span>
              <h3 className="rc-hiw-why__title">The $650 flight is the expensive one</h3>

              <div className="rc-hiw-why__rows">
                {COMPARE.map((c) => (
                  <div className="rc-hiw-compare" key={c.city}>
                    <div className="rc-hiw-compare__line">
                      <span className="rc-hiw-compare__muted">{c.city} · fare</span>
                      <span className="tnum">{c.fare}</span>
                    </div>
                    <div className="rc-hiw-bar" aria-hidden="true">
                      {c.segs.map((pct, si) => (
                        <span
                          key={SEG_CLASSES[si]}
                          className={`rc-hiw-bar__seg rc-hiw-bar__seg--${SEG_CLASSES[si]}`}
                          style={{ flex: `0 0 ${pct}%` }}
                        />
                      ))}
                    </div>
                    <div className="rc-hiw-compare__line">
                      <span className="rc-hiw-compare__muted">Whole trip</span>
                      <span className="rc-hiw-compare__total tnum">{c.total}</span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="rc-hiw-why__note">
                Half the fare, the costlier trip. Flight-first search hides the
                days that follow it.
              </p>
            </aside>
          </div>
        </div>

        <div className="rc-hiw-cta">
          <span className="rc-hiw-cta__note">
            Estimates, always as ranges. Departing Toronto · YYZ only, for now.
          </span>
          <a className="rc-hiw-cta__btn" href="/" onClick={goHome}>
            Find my trip →
          </a>
        </div>
      </main>

      <Footer />
    </div>
  )
}
