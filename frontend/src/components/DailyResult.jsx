import { Link } from 'react-router'
import CoverImage from './CoverImage.jsx'
import { daily } from '../content/daily.js'
import { shortGenre, shortPlatform, yearOf } from '../lib/daily.js'
import { sizeLabel } from '../lib/sizeBand.js'
import { itemPath } from '../lib/spinePaths.js'

const copy = daily.result

/**
 * The card under the board once the day is over: the answer's cover and
 * facts, the outcome in a line, Share and the link to the item page.
 *
 * @param {object} props
 * @param {object} props.answer The day's pool item.
 * @param {boolean} props.won Whether the last guess was the answer.
 * @param {number} props.guesses Guesses made.
 * @param {() => void} props.onShare Opens the share sheet.
 */
export default function DailyResult({ answer, won, guesses, onShare }) {
  const facts = [
    shortPlatform(answer.platform),
    yearOf(answer),
    answer.genres.map(shortGenre).join(', '),
    sizeLabel(answer.time_to_beat_hours),
    copy.hours(Math.round(answer.time_to_beat_hours)),
  ]
  return (
    <section className="daily-result" aria-labelledby="daily-result-title">
      <div className="daily-result-cover">
        <CoverImage src={answer.cover_url} type="game" />
      </div>
      <div className="daily-result-body">
        <h3 id="daily-result-title">
          {won ? copy.gotIt(guesses) : copy.notToday(answer.title)}
        </h3>
        <p className="daily-result-name">
          <Link to={itemPath(answer.id)}>{answer.title}</Link>
        </p>
        <p className="daily-result-facts muted">{facts.join(' · ')}</p>
        <div className="daily-result-acts">
          <button type="button" className="btn primary" onClick={onShare}>
            {copy.share}
          </button>
          <Link className="btn" to={itemPath(answer.id)}>
            {copy.onShelf}
          </Link>
        </div>
      </div>
    </section>
  )
}
