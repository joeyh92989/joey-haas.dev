import { useEffect, useRef, useState } from 'react'
import { spine } from '../content/spine.js'
import { buttonVariants } from './ui/button-variants.js'
import { OWNER_BOX, OWNER_NOTE, PHONE_TARGET } from './detail-classes.js'
import { PRESSED_FILL } from './shelf-classes.js'
import { cx } from '../lib/cx.js'
import { restoreSeries, setMark, toggleSkip } from '../lib/comicEdits.js'

const COPY = spine.comics.issue.owner

// An owned/read/skip toggle is a chip button; pressed is the ink fill and
// weight (docs/design-system.md → Shelf lists → Pressed state), 44px tall on a
// phone.
const TOGGLE = cx(
  buttonVariants({ variant: 'chip', size: 'chip' }),
  PRESSED_FILL,
  PHONE_TARGET,
)

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
  const ownRef = useRef(null)
  const refocus = useRef(false)

  // After Undo the Owned button takes focus back, once it is enabled again.
  useEffect(() => {
    if (!busy && refocus.current) {
      refocus.current = false
      ownRef.current?.focus()
    }
  })

  const held = state === 'read' || state === 'owned'
  const read = state === 'read'
  const skipped = stored.skippedSet.has(n)
  // Held only through an edition: it can't be made missing from here.
  const editionOnly = held && !stored.ownedSet.has(n) && edition !== null

  async function run(action, done) {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      await onChanged()
      setLast(done && { ...done, previous: result?.previous ?? null })
    } catch (failure) {
      setError(failure?.message || COPY.failed)
    } finally {
      setBusy(false)
    }
  }

  const mark = (next) =>
    run(() => setMark(id, n, next), {
      now: next,
      was: held ? (read ? 'read' : 'owned') : 'missing',
      // Owning a skipped issue clears the skip; Undo puts it back.
      skipped: skipped && next !== 'missing',
    })

  const undo = () => {
    const { was, previous, skipped: wasSkipped } = last
    refocus.current = true
    run(async () => {
      await setMark(id, n, was)
      if (wasSkipped) await toggleSkip(id, n)
      if (previous) await restoreSeries(id, previous)
    }, null)
  }

  return (
    <div className={cx('comic-issue-owner', OWNER_BOX)}>
      <p className={cx('comic-issue-owner-note', OWNER_NOTE)}>{COPY.note}</p>
      <div className="comic-issue-owner-buttons flex flex-wrap gap-2">
        <button
          type="button"
          className={TOGGLE}
          ref={ownRef}
          aria-pressed={held}
          disabled={busy || editionOnly}
          onClick={() => mark(held ? 'missing' : 'owned')}
        >
          {held ? COPY.owned : COPY.own}
        </button>
        <button
          type="button"
          className={TOGGLE}
          aria-pressed={read}
          disabled={busy}
          onClick={() => mark(read ? 'owned' : 'read')}
        >
          {read ? COPY.readDone : COPY.read}
        </button>
        {!held && (
          <button
            type="button"
            className={TOGGLE}
            aria-pressed={skipped}
            disabled={busy}
            onClick={() => run(() => toggleSkip(id, n), null)}
          >
            {skipped ? COPY.skipped : COPY.skip}
          </button>
        )}
      </div>
      {editionOnly && (
        <p className={cx('comic-issue-owner-note', OWNER_NOTE)}>
          {COPY.inEdition(edition.label)}
        </p>
      )}
      <p
        className="comic-issue-saved mt-2 mb-0 min-h-[1.4rem] text-[0.8125rem] text-muted-foreground"
        role="status"
      >
        {error ? (
          <span className="admin-error" role="alert">
            {error}
          </span>
        ) : last ? (
          <>
            {COPY.marked[last.now]}{' '}
            <button
              type="button"
              className={buttonVariants({ variant: 'link', size: 'bare' })}
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
