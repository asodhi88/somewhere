import ResultCard from './ResultCard'

/**
 * ResultsList — the ranked grid plus its off-happy-path states (CLAUDE.md §7b):
 * the pre-search prompt (nothing has been searched yet), a loading shimmer, a
 * no-matches state that tells "no data for this month yet" apart from "filters
 * too tight", and a thin-results nudge when only one or two clear the filters.
 */
export default function ResultsList({
  results,
  nights,
  pending,
  searched,
  monthLabel,
  monthHasData,
  onOpenLightbox,
}) {
  if (pending) {
    return (
      <section className="rc-results">
        <div className="rc-results__head">
          <h2 className="rc-results__title">Finding your window seat…</h2>
        </div>
        <div className="rc-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rc-skeleton" data-motion="1" />
          ))}
        </div>
      </section>
    )
  }

  if (!searched) {
    return (
      <section className="rc-results">
        <div className="rc-empty">
          <div className="rc-empty__title">Where can you actually go?</div>
          <p className="rc-empty__text">
            Set a budget, a month, and a stay tier above, then hit{' '}
            <strong>Show me where</strong> — we&rsquo;ll rank every destination by
            what the whole trip really costs.
          </p>
        </div>
      </section>
    )
  }

  if (results.length === 0) {
    return (
      <section className="rc-results">
        <div className="rc-empty">
          {monthHasData ? (
            <>
              <div className="rc-empty__title">Nothing fits — yet</div>
              <p className="rc-empty__text">
                No destination cleared these filters for {monthLabel}. Try nudging
                the budget up or dropping to a cheaper stay tier.
              </p>
            </>
          ) : (
            <>
              <div className="rc-empty__title">No prices for {monthLabel} yet</div>
              <p className="rc-empty__text">
                We&rsquo;re still filling in that month&rsquo;s flight and climate
                data. Pick another month and it&rsquo;ll rank right away.
              </p>
            </>
          )}
        </div>
      </section>
    )
  }

  const thin = results.length <= 2

  return (
    <section className="rc-results">
      <div className="rc-results__head">
        <h2 className="rc-results__title">Few good options for you&hellip;</h2>
      </div>
      {thin && (
        <p className="rc-results__hint">
          Slim pickings for {monthLabel}. Loosen the budget or stay tier to see more
          of the map.
        </p>
      )}
      <div className="rc-list">
        {results.map((r) => (
          <ResultCard
            key={r.id}
            result={r}
            nights={nights}
            onOpenLightbox={onOpenLightbox}
          />
        ))}
      </div>
    </section>
  )
}
