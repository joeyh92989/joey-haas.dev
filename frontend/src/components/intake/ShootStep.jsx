import { useEffect, useRef, useState } from 'react'
import { apiFetch, errorMessage } from '../../lib/api.js'
import { PHOTO_ACCEPT } from '../../lib/closet.js'
import {
  CHECK_STATES,
  WRITTEN_STATES,
  entryTitle,
  refuseFile,
} from '../../lib/intake.js'
import {
  live,
  removeEntryRequest,
  removePhotoRequest,
} from '../../lib/intakeRemove.js'
import PhotoTile, { PendingTile } from './PhotoTile.jsx'
import ShootSearch from './ShootSearch.jsx'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The sitting's running line: titles so far and what is still to come.
 * The title parts partition the total exactly (ignored entries, removed or
 * unticked, are in neither). Photos not yet read are counted in their own
 * words after the parts. Zero parts are dropped.
 */
function runningLine(sitting, budgetSpent, noun) {
  const entries = sitting.entries.filter((e) => e.state !== 'ignored')
  const count = (states) =>
    entries.filter((e) => states.includes(e.state)).length
  const waiting = sitting.photos.filter((p) =>
    ['uploaded', 'reading'].includes(p.state),
  ).length
  const parts = [
    [count(WRITTEN_STATES), (n) => `${n} ready`],
    [count(CHECK_STATES), (n) => `${n} to check`],
    [count(['reading']), (n) => `${n} reading`],
    [count(['owned']), (n) => `${n} on the shelf`],
    [
      waiting,
      (n) =>
        `${plural(n, 'photo')} waiting to be read${
          budgetSpent ? ': today’s model budget is used up' : ''
        }`,
    ],
  ]
    .filter(([n]) => n > 0)
    .map(([n, say]) => say(n))
  return [`${plural(entries.length, noun)} so far`, ...parts].join(' · ')
}

/**
 * Sitting step 1: take or choose photos. Each photo is refused before
 * upload when the server would refuse it (type, size: named) and uploaded
 * on its own request; the page's reader (`useReadNext`) reads it, and keeps
 * reading while Check is shown. The nightly reads whatever is left.
 *
 * A shelf photo waits in the queue when the day's model budget is spent and
 * says so; a closet photo becomes an untagged garment at once and is never
 * read here (the Closet's tag queue names it).
 *
 * A shelf sitting also offers "Search instead" (`ShootSearch`): a title
 * found by the add bar's search joins the sitting as an entry.
 *
 * @param {object} props
 * @param {object} props.sitting The sitting with its photos and entries.
 * @param {(update: (sitting: object) => object) => void} props.onChange
 * @param {{remaining: number, enforced: boolean}|null} props.budget
 * @param {ReturnType<typeof import('../../lib/useReadNext.js').useReadNext>}
 *   props.reader The page's reader: drive, merge, budget and error.
 * @param {object[]} [props.kinds] Every kind, for Search instead.
 * @param {() => void} props.onNext Start checking.
 * @param {(entry: object) => void} [props.onEntry] An entry the API answered with.
 * @param {(photoId: string) => void} [props.onPhotoRemoved] A photo and its
 *   titles were removed.
 * @param {import('react').Ref<HTMLHeadingElement>} props.headingRef
 */
export default function ShootStep({
  sitting,
  onChange,
  budget,
  reader,
  kinds = [],
  onNext,
  onEntry = () => {},
  onPhotoRemoved = () => {},
  headingRef,
}) {
  const closet = sitting.area === 'closet'
  const [uploads, setUploads] = useState([])
  const [searching, setSearching] = useState(false)
  const [refusals, setRefusals] = useState([])
  const [removing, setRemoving] = useState(false)
  const { drive, merge, budgetSpent, error, setError } = reader
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  async function upload(files) {
    setError(null)
    const refused = []
    const accepted = []
    for (const file of files) {
      const reason = refuseFile(file)
      if (reason) refused.push(reason)
      else accepted.push(file)
    }
    setRefusals(refused)
    for (const file of accepted) {
      const key = `${file.name}-${Math.random()}`
      setUploads((old) => [...old, { key, name: file.name }])
      const form = new FormData()
      form.append('photo', file)
      try {
        const response = await apiFetch(
          `/api/intake/sittings/${sitting.id}/photos`,
          { method: 'POST', body: form },
        )
        if (!alive.current) return
        if (!response.ok) {
          const message = await errorMessage(response, { ownConflicts: true })
          setUploads((old) =>
            old.map((u) => (u.key === key ? { ...u, error: message } : u)),
          )
          continue
        }
        const photo = await response.json()
        setUploads((old) => old.filter((u) => u.key !== key))
        if (closet) {
          // The garment and its entry are made on upload; read them back.
          const again = await apiFetch(`/api/intake/sittings/${sitting.id}`)
          if (again.ok && alive.current) {
            const fresh = await again.json()
            onChange(() => fresh)
          }
        } else {
          merge(photo)
          drive()
        }
      } catch {
        setUploads((old) =>
          old.map((u) =>
            u.key === key ? { ...u, error: 'the upload did not finish' } : u,
          ),
        )
      }
    }
  }

  async function retry(photo) {
    setError(null)
    const response = await apiFetch(`/api/intake/photos/${photo.id}/retry`, {
      method: 'POST',
    })
    if (!response.ok) {
      setError(await errorMessage(response, { ownConflicts: true }))
      return
    }
    merge(await response.json())
    drive()
  }

  /** Runs one removal, saying why when the server refuses it. */
  async function removal(request, done) {
    setError(null)
    setRemoving(true)
    try {
      const response = await request()
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      done(response)
    } catch {
      setError('The server did not answer; try again.')
    } finally {
      if (alive.current) setRemoving(false)
    }
  }

  const removePhoto = (photo) =>
    removal(
      () => removePhotoRequest(sitting.id, photo.id),
      () => onPhotoRemoved(photo.id),
    )

  const removeTitle = (entry) =>
    removal(
      () => removeEntryRequest(entry),
      async (response) => onEntry(await response.json()),
    )

  const picked = (event) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    upload(files)
  }

  const titlesFrom = (photo) =>
    live(sitting.entries).filter((e) => e.photo_id === photo.id).length
  const line = runningLine(sitting, budgetSpent, closet ? 'piece' : 'title')
  // A searched or typed entry is something to check too.
  const typed = live(sitting.entries).filter((e) => !e.photo_id)
  const ready =
    live(sitting.entries).length > 0 ||
    (!closet && sitting.photos.some((p) => p.state === 'read'))

  return (
    <section className="intake-step" aria-labelledby="intake-step-heading">
      <h2 id="intake-step-heading" ref={headingRef} tabIndex={-1}>
        Shoot
      </h2>
      <div className="intake-drop">
        <p className="intake-drop-title">
          {closet
            ? 'Photograph each piece on its own'
            : 'Photograph the shelf, spines or covers facing you'}
        </p>
        <p className="muted">
          {closet
            ? 'Each photo becomes a piece at once; the Closet’s tag queue names it.'
            : '15 to 20 per photo reads best. Keep shooting: each photo is read as it lands.'}
        </p>
        {!closet && (
          <p className="muted">
            {budget?.enforced
              ? `About 1 model call per photo; ${budget.remaining} left today.`
              : 'About 1 model call per photo.'}
          </p>
        )}
        <div className="intake-drop-actions">
          <label className="btn primary intake-file">
            Take photos
            <input
              type="file"
              className="visually-hidden"
              accept={PHOTO_ACCEPT}
              capture="environment"
              multiple
              onChange={picked}
            />
          </label>
          <label className="btn intake-file">
            Choose files
            <input
              type="file"
              className="visually-hidden"
              accept={PHOTO_ACCEPT}
              multiple
              onChange={picked}
            />
          </label>
          {!closet && (
            <button
              type="button"
              className="btn"
              aria-expanded={searching}
              onClick={() => setSearching((open) => !open)}
            >
              Search instead
            </button>
          )}
        </div>
        {searching && (
          <ShootSearch
            sitting={sitting}
            kinds={kinds}
            onAdded={(added) =>
              onChange((old) => ({ ...old, entries: [...old.entries, added] }))
            }
          />
        )}
      </div>

      {refusals.length > 0 && (
        <div className="admin-error" role="alert">
          {refusals.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {(sitting.photos.length > 0 || uploads.length > 0) && (
        <ul className="intake-strip" aria-label="Photos">
          {sitting.photos.map((photo, index) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              number={index + 1}
              titles={titlesFrom(photo)}
              budgetSpent={budgetSpent}
              onRetry={retry}
              onRemove={removePhoto}
              busy={removing}
            />
          ))}
          {uploads.map((upload) => (
            <PendingTile key={upload.key} upload={upload} />
          ))}
        </ul>
      )}

      {typed.length > 0 && (
        <ul
          className="intake-typed"
          aria-label="Titles added by search or typing"
        >
          {typed.map((entry) => (
            <li key={entry.id}>
              <span>{entryTitle(entry)}</span>
              <button
                type="button"
                className="btn sm ghost"
                aria-label={`Remove ${entryTitle(entry)}`}
                disabled={removing}
                onClick={() => removeTitle(entry)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="intake-bar">
        <p>
          <strong>{line}</strong>
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={!ready}
          onClick={onNext}
        >
          Start checking <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
