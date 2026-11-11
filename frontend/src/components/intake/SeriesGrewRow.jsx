import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { spine } from '../../content/spine.js'
import { countText, nearCells } from '../../lib/comicRun.js'
import CoverImage from '../CoverImage.jsx'

const PILL = spine.comics.series.pill

const numbers = (list) => list.map((n) => `#${n}`).join(', ')
const count = (model) => countText(model, ' of ')

/** "Up to date", "Complete run" or "n missing", as the series page says it. */
function StatePill({ model }) {
  const gaps = model.state === 'gaps'
  const words = gaps ? PILL.gaps(model.missing) : PILL[model.state]
  if (!words) return null
  return (
    <span className="series-pill" data-ok={gaps ? undefined : ''}>
      {words}
    </span>
  )
}

/** The sentence: what is added, the count before and after, the pill. */
function Sentence({ growth, typed }) {
  const { before, after, added, already } = growth
  if (added.length) {
    return (
      <p className="intake-grow-adds">
        adds <b>{numbers(added)}</b> ·{' '}
        <span className="mono">{count(before)}</span> →{' '}
        <span className="mono">{count(after)}</span> <StatePill model={after} />
        {already.length > 0 && (
          <span className="muted">
            {' '}
            · {numbers(already)} already on the shelf
          </span>
        )}
      </p>
    )
  }
  if (already.length) {
    return (
      <p className="intake-grow-adds muted">
        {numbers(already)} {already.length === 1 ? 'is' : 'are'} already on the
        shelf · nothing to add
      </p>
    )
  }
  return (
    <p className="intake-grow-adds muted">
      {typed
        ? 'nothing to add'
        : 'No issues typed yet · Edit issues to say which'}
    </p>
  )
}

/** The cells around the change; the sentence carries the same in words. */
function Strip({ growth }) {
  const tiles = nearCells(growth.after, growth.added, growth.already)
  if (!tiles.length) return null
  return (
    <div className="run-box-frame intake-grow-strip" aria-hidden="true">
      <div className="run-box">
        {tiles.map((tile) =>
          tile.type === 'gap' ? (
            <i key={`gap-${tile.after}`} className="run-cell" data-gap="">
              …
            </i>
          ) : (
            <i key={tile.n} className="run-cell" data-k={tile.k}>
              {tile.k === 'new' ? `+${tile.n}` : tile.n}
            </i>
          ),
        )}
      </div>
    </div>
  )
}

/**
 * One series already on the shelf that a sitting adds issues to (comic
 * series display spec, "Intake: adds to an existing series"): its cover,
 * title, what was read from the photo, the sentence ("adds #3, #4 · 2 of 4
 * → 4 of 4" and the state pill) and the cells around the change, the
 * added ones in `--ok` with a "+". On Check it has a checkbox and an
 * *Edit issues* action; a row with nothing to add has its checkbox
 * disabled. On Done the title links to the series page.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string|null} [props.coverUrl]
 * @param {string|null} [props.to] - The series page; the title links there.
 * @param {string|null} [props.read] - What was read from the photo.
 * @param {ReturnType<import('../../lib/comicRun.js').seriesGrowth>} props.growth
 * @param {boolean} [props.typed] - Whether any issue was typed for the row.
 * @param {{checked: boolean, onChange: (ticked: boolean) => void}} [props.tick]
 * @param {string} [props.issuesText] - The row's issues as typed, for Edit issues.
 * @param {(text: string) => Promise<boolean>} [props.onSaveIssues]
 * @param {boolean} [props.busy]
 */
export default function SeriesGrewRow({
  title,
  coverUrl = null,
  to = null,
  read = null,
  growth,
  typed = true,
  tick,
  issuesText = '',
  onSaveIssues,
  busy = false,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(issuesText)
  const inputRef = useRef(null)
  const editRef = useRef(null)
  const refocus = useRef(null)
  const inputId = useId()
  const nothing = growth.added.length === 0 && growth.already.length > 0

  useEffect(() => {
    if (refocus.current === 'input') inputRef.current?.focus()
    if (refocus.current === 'edit') editRef.current?.focus()
    refocus.current = null
  }, [editing])

  function open() {
    setDraft(issuesText)
    refocus.current = 'input'
    setEditing(true)
  }

  function close() {
    refocus.current = 'edit'
    setEditing(false)
  }

  async function save(event) {
    event.preventDefault()
    if (await onSaveIssues(draft.trim())) close()
  }

  return (
    <li className="intake-grow" data-tick={tick ? '' : undefined}>
      {tick && (
        <input
          type="checkbox"
          className="intake-grow-tick"
          checked={tick.checked && !nothing}
          disabled={nothing || busy}
          aria-label={`Add to ${title}`}
          onChange={(event) => tick.onChange(event.target.checked)}
        />
      )}
      <span className="intake-grow-cover">
        <CoverImage src={coverUrl} type="comic" />
      </span>
      <div className="intake-grow-body">
        <p className="intake-grow-title">
          {to ? <Link to={to}>{title}</Link> : title}
        </p>
        {read && (
          <p className="intake-grow-read">read from the photo: {read}</p>
        )}
        <Sentence growth={growth} typed={typed} />
        <Strip growth={growth} />
        {editing && (
          <form className="intake-grow-form" onSubmit={save}>
            <label htmlFor={inputId}>Issues of {title} in this sitting</label>
            <input
              id={inputId}
              ref={inputRef}
              className="mono"
              value={draft}
              placeholder="58, 60-62"
              onChange={(event) => setDraft(event.target.value)}
            />
            <span className="intake-grow-form-actions">
              <button type="submit" className="btn primary" disabled={busy}>
                Save issues
              </button>
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
            </span>
          </form>
        )}
      </div>
      {onSaveIssues && !editing && (
        <button
          ref={editRef}
          type="button"
          className="btn ghost intake-grow-edit"
          aria-label={`Edit issues of ${title}`}
          onClick={open}
        >
          Edit issues
        </button>
      )}
    </li>
  )
}
