import { Link } from 'react-router'
import CoverImage from './CoverImage.jsx'
import SizePill from './SizePill.jsx'
import { spine } from '../content/spine.js'
import { dayWords } from '../lib/releaseWords.js'
import { daysAgo } from '../lib/relativeDay.js'

const copy = spine.next.tonight

/** Journal hours as the card says them: "2.5" under ten, whole above. */
function hoursWords(hours) {
  return hours >= 10 ? String(Math.round(hours)) : String(hours)
}

/**
 * Tonight's Continue card: the game being played, leading the section
 * while a game is `active` (Tonight continue spec). The lead card's chrome
 * with the Now Playing band's left rule, the playing-since line, and, for
 * the owner, the night's question with its buttons. Stale (no session in
 * three weeks) turns "last played" amber and asks a different question,
 * leading with "Finished it": the spec led with Pause, on the reasoning that
 * a quiet game has drifted rather than ended, but the owner reached a stale
 * card wanting to finish it and the filled button said Pause (2026-11-09).
 * Visitors see the card and the line, nothing else.
 *
 * Rendered as a list item so a skipped card's toast can stand in its place.
 *
 * @param {object} props
 * @param {object} props.card - A `ContinuingCard` from the API.
 * @param {string} props.to - Where the title links (item page or edit page).
 * @param {boolean} [props.signedIn]
 * @param {boolean} [props.loggedToday] - A session for today exists.
 * @param {(card: object, preselect: string) => void} [props.onWrapUp]
 * @param {(card: object) => void} [props.onLogTonight]
 * @param {(card: object) => void} [props.onSkip]
 */
export default function ContinueCard({
  card,
  to,
  signedIn = false,
  loggedToday = false,
  onWrapUp,
  onLogTonight,
  onSkip,
}) {
  const titleId = `continue-${card.item_id}`
  const line = []
  if (card.playing_since) {
    line.push(
      <span key="since">
        {copy.playingSince} {dayWords(card.playing_since)}
      </span>,
    )
  }
  if (card.sessions > 0 && card.journal_hours != null) {
    line.push(
      <span key="hours">
        <b>
          {hoursWords(card.journal_hours)} {copy.hours}
        </b>{' '}
        {copy.over} {copy.sessions(card.sessions)}
      </span>,
    )
  }
  if (card.last_played_on) {
    line.push(
      <span key="last">
        {copy.lastPlayed}{' '}
        <b className={card.stale ? 'late' : undefined}>
          {daysAgo(card.last_played_on)}
        </b>
      </span>,
    )
  }
  return (
    <li>
      <article
        className={
          card.stale ? 'tonight-lead continue stale' : 'tonight-lead continue'
        }
        aria-labelledby={titleId}
      >
        <span className="tonight-lead-cover">
          <CoverImage src={card.cover_url} type={card.type} alt="" />
        </span>
        <div className="tonight-lead-text">
          <span className="tonight-playing">{copy.continue}</span>
          <Link
            to={to}
            id={titleId}
            className="tonight-title"
            data-tonight-title={card.item_id}
          >
            {card.title}
          </Link>
          <span className="tonight-meta">
            {card.platform && <span>{card.platform}</span>}
            <SizePill hours={card.time_to_beat_hours} />
          </span>
          {line.length > 0 && (
            <p className="tonight-sessions">
              {line.map((part, index) => (
                <span key={part.key}>
                  {index > 0 && ' · '}
                  {part}
                </span>
              ))}
            </p>
          )}
        </div>
        {signedIn && (
          <div className="tonight-acts ask">
            <span className="tonight-ask">
              {card.stale ? copy.stillPlaying : copy.sittingDown}
            </span>
            {card.stale ? (
              <>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onWrapUp(card, 'finished')}
                >
                  {copy.finishedIt}
                  <span className="visually-hidden">: {card.title}</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => onWrapUp(card, 'paused')}
                >
                  {copy.pause}
                  <span className="visually-hidden">: {card.title}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onWrapUp(card, 'finished')}
                >
                  {copy.wrapUp}
                  <span className="visually-hidden">: {card.title}</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={loggedToday}
                  onClick={() => onLogTonight(card)}
                >
                  {loggedToday ? copy.logged : copy.logTonight}
                  <span className="visually-hidden">: {card.title}</span>
                </button>
              </>
            )}
            <button
              type="button"
              className="btn ghost"
              onClick={() => onSkip(card)}
            >
              {copy.skip}
              <span className="visually-hidden">: {card.title}</span>
            </button>
          </div>
        )}
      </article>
    </li>
  )
}
