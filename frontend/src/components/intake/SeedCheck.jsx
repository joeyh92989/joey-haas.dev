import { useRef, useState } from 'react'
import { seedIntake as words } from '../../content/seedIntake.js'
import { API_URL, apiFetch, errorMessage } from '../../lib/api.js'
import {
  SEED_FIELD_KEYS,
  editedPayload,
  entryTitle,
  seedNeeds,
} from '../../lib/intake.js'
import { useSeedImages } from '../../lib/useSeedImages.js'
import KindFields from './KindFields.jsx'

/** The photo's state in words, for a piece that has none to show. */
function noPhotoWords(payload) {
  if (payload.image === 'failed') {
    return words.photoFailed(payload.image_error ?? 'it could not be fetched')
  }
  return words.noPhotoWhy[payload.image] ?? words.noPhoto
}

/**
 * One piece from the seed file: its product photo, what the store called it
 * (brand, name, store colour, size: the fields save when one is left), the
 * category and colour family when the file gave none, and "Don't own this".
 */
function SeedCard({ entry, fields, onSaved, onNotOwned }) {
  const [edits, setEdits] = useState({})
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Set once Don't own this starts: a save still on its way must not bring
  // the piece back when it answers.
  const leaving = useRef(false)
  const payload = entry.payload
  const values = {
    ...Object.fromEntries(fields.map((f) => [f.key, payload[f.key] ?? ''])),
    ...edits,
  }
  const title = entryTitle(entry)
  const needs = seedNeeds(fields, editedPayload(payload, edits))
  const seed = payload.seed ?? {}

  async function save() {
    if (Object.keys(edits).length === 0) return
    setError(null)
    const sent = edits
    try {
      const response = await apiFetch(`/api/intake/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: editedPayload(payload, sent) }),
      })
      if (leaving.current) return
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      const saved = await response.json()
      if (leaving.current) return
      onSaved(saved)
      setEdits((old) => {
        const rest = { ...old }
        for (const key of Object.keys(sent)) {
          if (rest[key] === sent[key]) delete rest[key]
        }
        return rest
      })
    } catch {
      setError(words.noAnswer)
    }
  }

  async function notOwned() {
    leaving.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/intake/entries/${entry.id}/not-owned`,
        { method: 'POST' },
      )
      if (!response.ok) {
        leaving.current = false
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      onNotOwned(await response.json(), title)
    } catch {
      leaving.current = false
      setError(words.noAnswer)
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }

  return (
    <li className="intake-seed-card">
      <div className="intake-seed-photo">
        {entry.photo_id ? (
          <img
            className="intake-garment-photo"
            src={`${API_URL}/api/intake/photos/${entry.photo_id}/image`}
            alt={title}
          />
        ) : (
          <p className="intake-seed-nophoto muted">{noPhotoWords(payload)}</p>
        )}
      </div>
      <div>
        <p className="kicker">{words.from(seed.source, seed.order_id)}</p>
        <form
          className="intake-garment-fields"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <KindFields
            kindKey="garment"
            fields={fields}
            values={values}
            onChange={(key, value) =>
              setEdits((old) => ({ ...old, [key]: value }))
            }
            onBlur={save}
            idPrefix={`seed-${entry.id}`}
          />
        </form>
        {needs.length > 0 && (
          <p className="intake-garment-missing">{words.needs(needs)}</p>
        )}
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        {asking ? (
          <div className="intake-actions quiet" role="group">
            <span>{words.dontOwnAsk(title)}</span>
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={notOwned}
            >
              {words.dontOwnYes}
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => setAsking(false)}
            >
              {words.dontOwnKeep}
            </button>
          </div>
        ) : (
          <div className="intake-actions quiet">
            <button
              type="button"
              className="btn ghost"
              aria-label={`${words.dontOwn}: ${title}`}
              onClick={() => setAsking(true)}
            >
              {words.dontOwn}
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * Clothes · Check for pieces made from a seed file: one card each, with the
 * product photo, the fields to correct and "Don't own this". The page also
 * drives the photos' fetching (`POST .../seed-images`, a few at a time, each
 * photo once) while the cards show, so a piece's photo appears as it
 * arrives. Nothing here reaches the closet; the commit does.
 *
 * @param {object} props
 * @param {object} props.sitting
 * @param {object} props.kind The garment kind from `GET /api/intake/kinds`.
 * @param {object[]} props.entries The sitting's live seed entries.
 * @param {(entry: object) => void} props.onEntry An entry the API answered with.
 * @param {{pending: number, failed: boolean}} [props.images] The photo
 *   fetching, when the page runs it once for every piece in the sitting.
 */
export default function SeedCheck({ sitting, kind, entries, onEntry, images }) {
  const [notice, setNotice] = useState('')
  const fields = SEED_FIELD_KEYS.map((key) =>
    kind.fields.find((field) => field.key === key),
  ).filter(Boolean)
  const own = useSeedImages(sitting, entries, onEntry, !images)
  const { pending, failed: photosFailed } = images ?? own

  return (
    <section className="intake-seed-check" aria-label="Pieces from the file">
      <p className="visually-hidden" role="status">
        {notice}
      </p>
      <h3 className="kicker">{words.head(entries.length)}</h3>
      <p className="muted">{words.lede}</p>
      {pending > 0 && !photosFailed && (
        <p className="muted">{words.photosLeft(pending)}</p>
      )}
      {photosFailed && (
        <p className="admin-error" role="alert">
          {words.photosFailed}
        </p>
      )}
      <ul className="intake-seed-list">
        {entries.map((entry) => (
          <SeedCard
            key={entry.id}
            entry={entry}
            fields={fields}
            onSaved={onEntry}
            onNotOwned={(updated, title) => {
              onEntry(updated)
              setNotice(words.dontOwnDone(title))
            }}
          />
        ))}
      </ul>
    </section>
  )
}
