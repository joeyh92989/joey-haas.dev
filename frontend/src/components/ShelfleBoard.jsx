import { daily } from '../content/daily.js'
import { GRADE_KEYS, MAX_GUESSES } from '../lib/daily.js'

const copy = daily

/**
 * One graded cell: the value, the arrow and its word on a second line when
 * the answer lies one way, and the state as hidden text so a screen reader
 * hears what the colour and the outline show.
 */
function GradedCell({ cell }) {
  return (
    <td className="shelfle-cell" data-state={cell.state}>
      <span className="shelfle-value">{cell.value}</span>
      {cell.arrow && (
        <small className="shelfle-hint" aria-hidden="true">
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
    <table className="shelfle">
      <caption className="visually-hidden">
        {copy.board.caption(rows.length, MAX_GUESSES)}
      </caption>
      <thead>
        <tr>
          <th scope="col" className="shelfle-title">
            <span className="kicker">{copy.columns.title}</span>
          </th>
          {GRADE_KEYS.map((key) => (
            <th scope="col" key={key}>
              <span className="kicker">{copy.columns[key]}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <td className="shelfle-title">{row.title}</td>
            {GRADE_KEYS.map((key) => (
              <GradedCell key={key} cell={row.grades[key]} />
            ))}
          </tr>
        ))}
        {Array.from({ length: empty }, (_, index) => (
          <tr key={`empty-${index}`} className="shelfle-empty">
            <td colSpan={GRADE_KEYS.length + 1}>
              <span className="visually-hidden">{copy.board.emptyRow}</span>
              <span className="shelfle-empty-cells" aria-hidden="true">
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
