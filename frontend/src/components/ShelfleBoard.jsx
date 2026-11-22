import { daily } from '../content/daily.js'
import { GRADE_KEYS, MAX_GUESSES } from '../lib/daily.js'
import {
  SHELFLE,
  SHELFLE_CELL,
  SHELFLE_EMPTY_CELLS,
  SHELFLE_EMPTY_TD,
  SHELFLE_HINT,
  SHELFLE_TD_TITLE,
  SHELFLE_TH_CENTER,
  SHELFLE_TH_TITLE,
  TH_FULL_HIDDEN,
  TH_SHORT,
} from './dailyClasses.js'

const copy = daily

/** A header too wide for its column on a 320px phone has a short form, shown
 *  there only; the full word stays for a screen reader (see `.th-short`). */
const SHORT = { platform: 'Plat.' }

/**
 * One graded cell: the value, the arrow and its word on a second line when
 * the answer lies one way, and the state as hidden text so a screen reader
 * hears what the colour and the outline show.
 */
function GradedCell({ cell }) {
  return (
    <td className={`shelfle-cell ${SHELFLE_CELL}`} data-state={cell.state}>
      <span className="shelfle-value">{cell.value}</span>
      {cell.arrow && (
        <small className={`shelfle-hint ${SHELFLE_HINT}`} aria-hidden="true">
          {cell.arrow} {cell.word}
        </small>
      )}
      <span className="visually-hidden">
        , {copy.states[cell.state]}
        {cell.word ? `, ${cell.word}` : ''}
      </span>
    </td>
  )
}

/**
 * The Shelfle board: six rows of Guess · Platform · Year · Genre · Size as a
 * real table, so the column headers and each cell's state are read in
 * order. An unused row is one cell saying so, with the five dashed boxes
 * drawn for sighted visitors only.
 *
 * @param {object} props
 * @param {{ title: string, grades: ReturnType<typeof import('../lib/daily.js').grade> }[]} props.rows
 *   The guesses made so far, in order.
 */
export default function ShelfleBoard({ rows }) {
  const empty = Math.max(0, MAX_GUESSES - rows.length)
  return (
    <table className={`shelfle ${SHELFLE}`}>
      <caption className="visually-hidden">
        {copy.board.caption(rows.length, MAX_GUESSES)}
      </caption>
      <thead>
        <tr>
          <th scope="col" className={`shelfle-title ${SHELFLE_TH_TITLE}`}>
            <span className="kicker">{copy.columns.title}</span>
          </th>
          {GRADE_KEYS.map((key) => (
            <th scope="col" key={key} className={SHELFLE_TH_CENTER}>
              <span
                className={`kicker th-full ${SHORT[key] ? TH_FULL_HIDDEN : ''}`}
              >
                {copy.columns[key]}
              </span>
              {SHORT[key] && (
                <span
                  className={`kicker th-short ${TH_SHORT}`}
                  aria-hidden="true"
                >
                  {SHORT[key]}
                </span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <td className={`shelfle-title ${SHELFLE_TD_TITLE}`}>{row.title}</td>
            {GRADE_KEYS.map((key) => (
              <GradedCell key={key} cell={row.grades[key]} />
            ))}
          </tr>
        ))}
        {Array.from({ length: empty }, (_, index) => (
          <tr key={`empty-${index}`} className="shelfle-empty">
            <td colSpan={GRADE_KEYS.length + 1} className={SHELFLE_EMPTY_TD}>
              <span className="visually-hidden">{copy.board.emptyRow}</span>
              <span
                className={`shelfle-empty-cells ${SHELFLE_EMPTY_CELLS}`}
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
