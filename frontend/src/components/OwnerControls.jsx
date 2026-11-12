import { useState } from 'react'
import { spine } from '../content/spine.js'
import { setReadTo, toggleOwned, toggleSkip } from '../lib/comicEdits.js'

const COPY = spine.comics.issue.owner

/**
 * The owner's buttons on an issue page, drawn only when signed in. They
 * edit the stored row (`lib/comicEdits.js`) and `onChanged` reloads the
 * public page. A refusal from the API is shown in its own words.
 *
 * `stored` is the owner's own row, which is the only place a skip exists:
 * it never reaches the public page.
 *
 * @param {object} props
 * @param {string} props.id - The series' item id.
 * @param {number} props.n - This issue.
 * @param {{issues_owned: string|null, issues_skipped: string|null,
 *   read_to: number|null, ownedSet: Set<number>, skippedSet: Set<number>}} props.stored
 * @param {boolean} props.held - Held as a single or through an edition.
 * @param {() => Promise<void>} props.onChanged
 */
export default function OwnerControls({ id, n, stored, held, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (failure) {
      setError(failure?.message || COPY.failed)
    } finally {
      setBusy(false)
    }
  }

  const single = stored.ownedSet.has(n)
  const skipped = stored.skippedSet.has(n)
  const readHere = stored.read_to === n

  return (
    <div className="comic-issue-owner">
      <p className="comic-issue-owner-note">{COPY.note}</p>
      <div className="comic-issue-owner-buttons">
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() => run(() => toggleOwned(id, n))}
        >
          {single ? COPY.owned : COPY.own}
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() => run(() => setReadTo(id, n))}
        >
          {readHere ? COPY.readDone : COPY.readTo}
        </button>
        {!held && (
          <button
            type="button"
            className="btn sm"
            disabled={busy}
            onClick={() => run(() => toggleSkip(id, n))}
          >
            {skipped ? COPY.skipped : COPY.skip}
          </button>
        )}
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
