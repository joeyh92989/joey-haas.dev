import CoverImage from './CoverImage.jsx'

// Mirrors FORMAT_WORDS in backend/physical_sources/limits.py.
export const FORMAT_WORDS = {
  game_card: 'Full game on cartridge',
  game_key_card: 'Game-Key Card',
  code_in_box: 'Code in a box',
  disc: 'Disc',
}

/** The answers Radar offers; Discover adds Already own. */
export const RADAR_ACTIONS = ['want', 'dismiss', 'skip']
export const DISCOVER_ACTIONS = ['want', 'dismiss', 'own', 'skip']

const ACTION_WORDS = {
  want: { label: 'Want', named: (title) => `Want ${title}` },
  dismiss: {
    label: 'Not interested',
    named: (title) => `Not interested in ${title}`,
  },
  own: { label: 'Already own', named: (title) => `Already own ${title}` },
  skip: { label: 'Skip', named: (title) => `Skip ${title}` },
}

const DAY = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A date-only ISO string as a UTC Date, so formatting never shifts a day. */
export function utc(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** How a date-only ISO string reads on a card: "Nov 8, 2026". */
export function dayWords(isoDate) {
  return DAY.format(utc(isoDate))
}

function StoreLine({ line }) {
  // Only a pre-order line has a window worth naming.
  const closes =
    line.availability === 'preorder' && line.preorder_closes_at
      ? `, pre-orders close ${dayWords(line.preorder_closes_at)}`
      : ''
  return (
    <li>
      <a href={line.url} target="_blank" rel="noreferrer">
        {line.store}
      </a>
      {line.price ? ` · ${line.price} ${line.currency}` : ''}
      {closes}
    </li>
  )
}

/**
 * One suggestion from Radar or Discover: cover, title, when · platform ·
 * format, the reasons, what it is based on, the store lines, and the
 * owner's answers, each button named for its game.
 */
export default function RecommendationCard({
  row,
  when,
  busy,
  onAnswer,
  actions = RADAR_ACTIONS,
  level = 3,
}) {
  const Title = `h${level}`
  const format = row.physical_format
    ? FORMAT_WORDS[row.physical_format]
    : row.format_note
  const basedOn = row.based_on_titles ?? []
  const genres = row.genres ?? []
  return (
    <article className="radar-card">
      <span className="radar-cover">
        <CoverImage src={row.cover_url} type="game" alt="" />
      </span>
      <div className="radar-body">
        <Title>{row.title}</Title>
        <p className="muted">
          {[when, row.platform, format].filter(Boolean).join(' · ')}
        </p>
        {row.reasons.length > 0 && (
          <ul className="radar-reasons">
            {row.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {basedOn.length > 0 && (
          <p className="muted">Based on: {basedOn.join(', ')}</p>
        )}
        {genres.length > 0 && (
          <ul className="rec-genres" aria-label="Genres">
            {genres.map((genre) => (
              <li key={genre}>{genre}</li>
            ))}
          </ul>
        )}
        {row.store_lines.length > 0 && (
          <ul className="radar-stores">
            {row.store_lines.map((line, index) => (
              <StoreLine key={`${line.url}-${index}`} line={line} />
            ))}
          </ul>
        )}
        <div className="radar-actions">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              aria-label={ACTION_WORDS[action].named(row.title)}
              onClick={() => onAnswer(row, action)}
            >
              {ACTION_WORDS[action].label}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}
