/**
 * The season turn: "It's the autumn turn. 12 summer pieces close their
 * season until May", with Pack all and One by one. Shown from the turn date
 * until it is dismissed or emptied; the route decides that (`banner` is null
 * otherwise), so this only draws it.
 *
 * @param {object} props
 * @param {{turn: string, season: string, count: number, until: string}} props.banner
 * @param {boolean} props.busy
 * @param {() => void} props.onPackAll
 * @param {() => void} props.onOneByOne
 * @param {() => void} props.onDismiss
 */
export default function SeasonTurnBanner({
  banner,
  busy,
  onPackAll,
  onOneByOne,
  onDismiss,
}) {
  const pieces = banner.count === 1 ? 'piece closes its' : 'pieces close their'
  return (
    <section className="review-banner" aria-label="Season turn">
      <p>
        It’s the {banner.turn} turn. {banner.count} {banner.season} {pieces}{' '}
        season until {banner.until}.
      </p>
      <div className="review-banner-acts">
        <button
          type="button"
          className="btn primary sm"
          disabled={busy}
          onClick={onPackAll}
        >
          Pack all {banner.count}
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={busy}
          onClick={onOneByOne}
        >
          One by one
        </button>
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </section>
  )
}
