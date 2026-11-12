import { useRef, useState } from 'react'
import { apiFetch, errorMessage } from '../../lib/api.js'
import { seriesGrowth } from '../../lib/comicRun.js'
import { entryCover } from '../../lib/intake.js'
import CheckOne from './CheckOne.jsx'
import GarmentCheck from './GarmentCheck.jsx'
import SeriesGrewRow from './SeriesGrewRow.jsx'
import SkimGrid, { inSkim } from './SkimGrid.jsx'

/**
 * Whether an entry adds to a comic series already on the shelf: settled
 * (not asked one at a time, not still reading) and matched to a series
 * the API marked `on_shelf`. These leave the skim grid for their own
 * group, "Already on the shelf · adds issues".
 */
export function addsToSeries(entry) {
  return Boolean(entry.on_shelf) && inSkim(entry) && entry.kind === 'comic'
}

/**
 * What each entry brings to its series, in sitting order. A series with
 * several rows counts them in turn, as the commit joins them: the second
 * row starts where the first, if ticked, leaves the run.
 */
function growths(entries) {
  const sofar = new Map()
  return new Map(
    entries.map((entry) => {
      const shelf = entry.on_shelf
      const earlier = sofar.get(shelf.item_id) ?? []
      const growth = seriesGrowth({
        ownedText: [shelf.owned_text, ...earlier].filter(Boolean).join(', '),
        issues: entry.payload?.issues_owned ?? '',
        released: shelf.released,
        ongoing: shelf.ongoing,
      })
      if (entry.state !== 'ignored')
        sofar.set(shelf.item_id, [...earlier, ...growth.added])
      return [entry.id, growth]
    }),
  )
}

/**
 * Sitting step 2: the uncertain entries one at a time, then the trusted
 * ones as a grid to skim. A comic matched to a series already on the shelf
 * is not a new title, so it leaves the grid for "Already on the shelf ·
 * adds issues": a row saying what it adds, with Edit issues to type them
 * (photos never carry issue numbers). Only `check` entries are asked; Skip keeps one
 * for later (it stays in the sitting at commit, counted as kept). Every
 * answer is saved on the entry at once, so another device sees it (AC 3).
 *
 * @param {object} props
 * @param {object} props.sitting
 * @param {(entry: object) => void} props.onEntry An entry the API answered with.
 * @param {() => void} props.onBack Shoot more: back to Shoot (photos
 *   still being read keep landing here meanwhile).
 * @param {() => void} props.onNext
 * @param {import('react').ReactNode} props.next The next button's words.
 * @param {boolean} [props.nextBusy]
 * @param {import('react').ReactNode} [props.footer] Under the next button
 *   (a commit's refusal on a sitting with no Details step).
 * @param {import('react').Ref<HTMLHeadingElement>} props.headingRef
 * @param {Array<object>} [props.kinds] The registry, for Clothes · Check's
 *   garment fields.
 * @param {(entryId: string) => void} [props.onRemoved] Clothes · Check
 *   removed a photo, its garment and its entry.
 */
export default function CheckStep({
  sitting,
  onEntry,
  onBack,
  onNext,
  next,
  nextBusy = false,
  footer,
  headingRef,
  kinds = [],
  onRemoved = () => {},
}) {
  const [skipped, setSkipped] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const oneRef = useRef(null)
  const closet = sitting.area === 'closet'

  const checks = sitting.entries.filter((e) =>
    ['check', 'probable'].includes(e.state),
  )
  const left = checks.filter((e) => !skipped.has(e.id))
  const current = left[0] ?? null
  const grows = closet ? [] : sitting.entries.filter(addsToSeries)
  const growthOf = growths(grows)
  const skim = sitting.entries.filter(
    (entry) => inSkim(entry) && !grows.includes(entry),
  )
  const photoNumber = (entry) => {
    const index = sitting.photos.findIndex((p) => p.id === entry.photo_id)
    return index < 0 ? null : index + 1
  }

  async function patch(entry, body) {
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/intake/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return false
      }
      onEntry(await response.json())
      return true
    } catch {
      setError('The server did not answer; try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function answer(entry, change) {
    if (await patch(entry, change)) setTimeout(() => oneRef.current?.focus())
  }

  function skip(entry) {
    setSkipped((old) => new Set(old).add(entry.id))
    // The next entry renders in the same place; keep the reader there.
    setTimeout(() => oneRef.current?.focus())
  }

  function saveIssues(entry, text) {
    return patch(entry, {
      payload: { ...entry.payload, issues_owned: text || null },
    })
  }

  function toggle(entry, ticked) {
    if (ticked) {
      const payload = { ...entry.payload }
      const was = payload.was ?? 'exact'
      delete payload.unticked
      delete payload.was
      patch(entry, { state: was, payload })
    } else {
      patch(entry, {
        state: 'ignored',
        payload: { ...entry.payload, unticked: true, was: entry.state },
      })
    }
  }

  return (
    <section className="intake-step" aria-labelledby="intake-step-heading">
      <h2 id="intake-step-heading" ref={headingRef} tabIndex={-1}>
        Check
      </h2>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {closet ? (
        <GarmentCheck
          sitting={sitting}
          kind={
            kinds.find((kind) => kind.key === 'garment') ?? {
              key: 'garment',
              area: 'closet',
              label: 'Garment',
              fields: [],
            }
          }
          onRemoved={onRemoved}
        />
      ) : current ? (
        <CheckOne
          key={current.id}
          entry={current}
          photoNumber={photoNumber(current)}
          position={`${checks.length - left.length + 1} of ${checks.length}`}
          onAnswer={answer}
          onSkip={skip}
          busy={busy}
          headingRef={oneRef}
        />
      ) : (
        <p className="muted" ref={oneRef} tabIndex={-1}>
          Nothing left to check one at a time.
          {skipped.size > 0 &&
            ` ${skipped.size} skipped: kept in the sitting for later.`}
        </p>
      )}

      {grows.length > 0 && (
        <>
          <h3 className="kicker intake-skim-head">
            Already on the shelf · adds issues · {grows.length}
          </h3>
          <ul className="intake-grow-list">
            {grows.map((entry) => (
              <SeriesGrewRow
                key={entry.id}
                title={entry.on_shelf.title}
                coverUrl={entry.on_shelf.cover_url ?? entryCover(entry)}
                read={entry.payload?.detected_title ?? null}
                growth={growthOf.get(entry.id)}
                typed={Boolean(entry.payload?.issues_owned)}
                tick={{
                  checked: entry.state !== 'ignored',
                  onChange: (ticked) => toggle(entry, ticked),
                }}
                issuesText={entry.payload?.issues_owned ?? ''}
                onSaveIssues={(text) => saveIssues(entry, text)}
                busy={busy}
              />
            ))}
          </ul>
        </>
      )}

      {skim.length > 0 && (
        <>
          <h3 className="kicker intake-skim-head">
            Matched · {skim.length} · untick anything wrong
          </h3>
          <SkimGrid entries={skim} onToggle={toggle} />
        </>
      )}

      <div className="intake-bar">
        <p className="muted">
          {closet
            ? 'Only pieces the tagger could not finish are asked about.'
            : 'Only the uncertain ones are asked one at a time; exact matches are a grid to skim.'}
        </p>
        <span className="intake-bar-actions">
          <button type="button" className="btn" onClick={onBack}>
            <span aria-hidden="true">←</span> Shoot more
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={nextBusy}
            onClick={onNext}
          >
            {next}
          </button>
        </span>
      </div>
      {footer}
    </section>
  )
}
