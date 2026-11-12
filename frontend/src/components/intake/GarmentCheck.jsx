import { useEffect, useMemo, useState } from 'react'
import { LOAD_ERROR } from '../../content/status.js'
import { removePhotoRequest } from '../../lib/intakeRemove.js'
import { apiFetch, errorMessage } from '../../lib/api.js'
import { imageUrl, tagResult } from '../../lib/closet.js'
import {
  fieldPayload,
  garmentNeedsCheck,
  missingFields,
} from '../../lib/intake.js'
import KindFields from './KindFields.jsx'

const NO_ANSWER = 'The server did not answer; try again.'

/** A garment's fields as the form holds them: text, blanks for nulls. */
function formValues(fields, garment) {
  return Object.fromEntries(
    fields.map((field) => [field.key, garment[field.key] ?? '']),
  )
}

/**
 * Clothes · Check: the sitting's pieces the tag queue gave up on, one at a
 * time (spec, screen "Clothes · Check"). The piece's photo, what the tagger
 * wrote (the garment kind's fields, the missing ones empty and named), then
 * Save and next (a hand save, as the garment page makes, so the queue never
 * takes it again), Tag again (back in the queue with its attempts reset,
 * then one batch of Tag now), Skip (this visit only) and Remove this photo
 * (the garment goes, and its entry with it). Pieces tagged cleanly, or
 * still queued, are never asked about. The garments are the Closet's own
 * (`GET /api/closet/garments`): a sitting's pieces are real from upload.
 *
 * @param {object} props
 * @param {object} props.sitting
 * @param {object} props.kind The garment kind from `GET /api/intake/kinds`.
 * @param {(entryId: string) => void} props.onRemoved An entry's garment was deleted.
 */
export default function GarmentCheck({ sitting, kind, onRemoved }) {
  const [garments, setGarments] = useState(null)
  const [failed, setFailed] = useState(false)
  const [skipped, setSkipped] = useState(() => new Set())
  // Removed here at once, whether or not the page has caught up yet.
  const [removed, setRemoved] = useState(() => new Set())
  const [edits, setEdits] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  // The garment whose removal is being asked about: removing deletes it.
  const [asking, setAsking] = useState(null)

  useEffect(() => {
    let live = true
    apiFetch('/api/closet/garments')
      .then(async (response) => {
        if (!response.ok) throw new Error('load')
        const body = await response.json()
        if (live) {
          setGarments(Object.fromEntries(body.garments.map((g) => [g.id, g])))
        }
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [])

  const pieces = useMemo(
    () =>
      sitting.entries
        .filter(
          (entry) =>
            entry.garment_id &&
            garments?.[entry.garment_id] &&
            !removed.has(entry.id),
        )
        .map((entry) => ({ entry, garment: garments[entry.garment_id] })),
    [sitting.entries, garments, removed],
  )
  const asked = pieces.filter(({ garment }) => garmentNeedsCheck(garment))
  const left = asked.filter(({ entry }) => !skipped.has(entry.id))
  const current = left[0] ?? null
  const clean = pieces.filter(({ garment }) => garment.status !== 'untagged')
  const queued = pieces.filter(
    ({ garment }) =>
      garment.status === 'untagged' &&
      garment.tag_source == null &&
      !garmentNeedsCheck(garment),
  )
  const currentId = current?.garment.id

  // Each piece starts from what the tagger wrote; edits are kept per piece.
  const values = current
    ? { ...formValues(kind.fields, current.garment), ...edits[currentId] }
    : {}

  function replace(garment) {
    setGarments((old) => ({ ...old, [garment.id]: garment }))
  }

  async function run(work) {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch {
      setError(NO_ANSWER)
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const response = await apiFetch(
        `/api/closet/garments/${current.garment.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fieldPayload(kind.fields, values)),
        },
      )
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      replace(await response.json())
      setNotice(`${values.name || 'The piece'} saved`)
    })

  const tagAgain = () =>
    run(async () => {
      const { entry, garment } = current
      const response = await apiFetch(
        `/api/intake/entries/${entry.id}/tag-again`,
        { method: 'POST' },
      )
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      replace({ ...garment, tag_attempts: 0 })
      const name = garment.name || 'The piece'
      const tagged = await apiFetch('/api/closet/tag', { method: 'POST' })
      const result =
        tagged.status === 409
          ? 'tagging is already running'
          : tagged.ok
            ? tagResult(await tagged.json())
            : await errorMessage(tagged)
      setNotice(`${name} is back in the tag queue · ${result}`)
      const fresh = await apiFetch(`/api/closet/garments/${garment.id}`)
      if (fresh.ok) replace(await fresh.json())
    })

  /**
   * Removes a piece: its photo, the garment and its entry go together. A
   * piece with a sitting photo goes by the sitting's route (so the photo
   * leaves Shoot too); one without goes by the Closet's.
   */
  const remove = ({ entry, garment }) =>
    run(async () => {
      const response = entry.photo_id
        ? await removePhotoRequest(sitting.id, entry.photo_id)
        : await apiFetch(`/api/closet/garments/${garment.id}`, {
            method: 'DELETE',
          })
      if (!response.ok && response.status !== 404) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      setNotice(`${garment.name || 'The photo'} removed`)
      setRemoved((old) => new Set(old).add(entry.id))
      onRemoved(entry.id)
    })

  function skip() {
    setSkipped((old) => new Set(old).add(current.entry.id))
  }

  const position = asked.length - left.length + 1
  const summary = [
    clean.length > 0 && `${clean.length} tagged cleanly`,
    queued.length > 0 && `${queued.length} in the tag queue`,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <section className="intake-garment-check" aria-label="Clothes to check">
      <p className="visually-hidden" role="status">
        {notice}
      </p>
      {failed && (
        <p className="admin-error" role="alert">
          {LOAD_ERROR}
        </p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="muted">{notice}</p>}
      {garments && !current && (
        <p className="muted">
          Nothing left to check one at a time.
          {skipped.size > 0 &&
            ` ${skipped.size} skipped: they stay untagged in the Closet.`}
          {summary && ` ${summary}.`}
        </p>
      )}
      {current && (
        <div className="intake-checkone">
          <div className="intake-checkone-source">
            <img
              className="intake-garment-photo"
              src={imageUrl(current.garment)}
              alt={current.garment.name || 'This piece'}
            />
            <p className="muted">
              <span className="intake-garment-missing">
                Check ·{' '}
                {missingFields(kind.fields, current.garment).join(' and ') ||
                  'nothing'}{' '}
                missing
              </span>
            </p>
          </div>
          <div>
            <h3 className="kicker">
              Check {position} of {asked.length}
              {summary && ` · ${summary}`}
            </h3>
            <p className="kicker">What the tagger wrote</p>
            <form
              className="intake-garment-fields"
              onSubmit={(event) => {
                event.preventDefault()
                save()
              }}
            >
              <KindFields
                fields={kind.fields}
                values={values}
                onChange={(key, value) =>
                  setEdits((old) => ({
                    ...old,
                    [currentId]: { ...old[currentId], [key]: value },
                  }))
                }
                idPrefix={`garment-${current.garment.id}`}
              />
              <div className="intake-actions">
                <button type="submit" className="btn primary" disabled={busy}>
                  Save and next
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={tagAgain}
                >
                  Tag again
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={skip}
                >
                  Skip
                </button>
              </div>
              {asking === current.garment.id ? (
                <div className="intake-actions quiet" role="group">
                  <span>
                    Remove {current.garment.name || 'this piece'}? The photo and
                    the piece go with it.
                  </span>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busy}
                    onClick={() => {
                      setAsking(null)
                      remove(current)
                    }}
                  >
                    Yes, remove
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => setAsking(null)}
                  >
                    Keep it
                  </button>
                </div>
              ) : (
                <div className="intake-actions quiet">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => setAsking(current.garment.id)}
                  >
                    Remove this photo
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
      {pieces.length > (current ? 1 : 0) && (
        <>
          <h3 className="kicker">Other photos in this sitting</h3>
          <ul className="intake-garment-others" aria-label="Other photos">
            {pieces
              .filter(({ garment }) => garment.id !== currentId)
              .map((piece) => {
                const name = piece.garment.name || 'this piece'
                return (
                  <li key={piece.entry.id}>
                    <img
                      src={imageUrl(piece.garment)}
                      alt={piece.garment.name || 'A piece'}
                    />
                    <span>{piece.garment.name || 'Untitled piece'}</span>
                    {asking === piece.garment.id ? (
                      <span className="intake-actions quiet" role="group">
                        <span>
                          Remove {name}? The photo and the piece go with it.
                        </span>
                        <button
                          type="button"
                          className="btn sm"
                          disabled={busy}
                          onClick={() => {
                            setAsking(null)
                            remove(piece)
                          }}
                        >
                          Yes, remove
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={() => setAsking(null)}
                        >
                          Keep it
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn sm ghost"
                        aria-label={`Remove ${piece.garment.name || 'photo'}`}
                        disabled={busy}
                        onClick={() => setAsking(piece.garment.id)}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                )
              })}
          </ul>
        </>
      )}
    </section>
  )
}
