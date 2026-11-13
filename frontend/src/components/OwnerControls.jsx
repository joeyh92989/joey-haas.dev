import { useState } from 'react'
import { spine } from '../content/spine.js'
import { setMark, toggleSkip } from '../lib/comicEdits.js'

const COPY = spine.comics.issue.owner

/**
 * The owner's buttons on an issue page, drawn only when signed in. Owned and
 * read write through the one mark route (the same data a tap on the series
 * page's cover writes); Skip stays here and edits the stored ranges
 * (`lib/comicEdits.js`). `onChanged` reloads the public page. The status
 * line under the buttons names the change and offers Undo. A refusal from
 * the API is shown in its own words.
 *
 * `stored` is the owner's own row, which is the only place a skip exists:
 * it never reaches the public page.
 *
 * @param {object} props
 * @param {string} props.id - The series' item id.
 * @param {number} props.n - This issue.
 * @param {'missing'|'owned'|'read'|'not-out'} props.state - From the public page.
 * @param {{ownedSet: Set<number>, skippedSet: Set<number>}} props.stored
 * @param {{label: string}|null} [props.edition] - The edition holding it.
 * @param {() => Promise<void>} props.onChanged
 */
export default function OwnerControls({
  id,
  n,
  state,
  stored,
  edition = null,
  onChanged,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [last, setLast] = useState(null)

  const held = state === 'read' || state === 'owned'
  const read = state === 'read'
  const skipped = stored.skippedSet.has(n)
  // Held only through an edition: it can't be made missing from here.
  const editionOnly = held && !stored.ownedSet.has(n) && edition !== null

  async function run(action, done) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
      setLast(done)
    } catch (failure) {
      setError(failure?.message || COPY.failed)
    } finally {
      setBusy(false)
    }
  }

  const mark = (next) =>
    run(() => setMark(id, n, next), { now: next, was: held ? (read ? 'read' : 'owned') : 'missing' })

  const undo = () => {
    const { was } = last
    run(() => setMark(id, n, was), null)
  }

  return (
    <div className="comic-issue-owner">
      <p className="comic-issue-owner-note">{COPY.note}</p>
      <div className="comic-issue-owner-buttons">
        <button
          type="button"
          className="btn sm"
          aria-pressed={held}
          disabled={busy || editionOnly}
          onClick={() => mark(held ? 'missing' : 'owned')}
        >
          {held ? COPY.owned : COPY.own}
        </button>
        <button
          type="button"
          className="btn sm"
          aria-pressed={read}
          disabled={busy}
          onClick={() => mark(read ? 'owned' : 'read')}
        >
          {read ? COPY.readDone : COPY.read}
        </button>
        {!held && (
          <button
            type="button"
            className="btn sm"
            aria-pressed={skipped}
            disabled={busy}
            onClick={() => run(() => toggleSkip(id, n), null)}
          >
            {skipped ? COPY.skipped : COPY.skip}
          </button>
        )}
      </div>
      {editionOnly && (
        <p className="comic-issue-owner-note">{COPY.inEdition(edition.label)}</p>
      )}
      <p className="comic-issue-saved" role="status">
        {error ? (
          <span className="admin-error" role="alert">
            {error}
          </span>
        ) : last ? (
          <>
            {COPY.marked[last.now]}{' '}
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={undo}
            >
              {COPY.undo}
            </button>
          </>
        ) : null}
      </p>
    </div>
  )
}
