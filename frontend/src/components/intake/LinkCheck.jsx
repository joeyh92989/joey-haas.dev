import { useId, useRef, useState } from 'react'
import { linkIntake as words } from '../../content/linkIntake.js'
import { API_URL, apiFetch, errorMessage } from '../../lib/api.js'
import {
  editedKeys,
  editedPayload,
  entryTitle,
  linkHost,
  seedNeeds,
} from '../../lib/intake.js'
import { useSeedImages } from '../../lib/useSeedImages.js'
import KindFields from './KindFields.jsx'

/** The fields a link piece's card edits; size is a choice when the store lists sizes. */
const LINK_FIELD_KEYS = [
  'name',
  'brand',
  'color_name',
  'category',
  'primary_color',
]

function noPhotoWords(payload) {
  if (payload.image === 'failed') {
    return words.photoFailed(payload.image_error ?? 'it could not be fetched')
  }
  return words.noPhotoWhy[payload.image] ?? words.noPhoto
}

/**
 * One pasted product link: the store's photo, the colours it offers as a
 * radio group (the server holds them as the entry's candidates), the size
 * chosen from the colour's sizes, and the fields to correct. A link the
 * store would not give up is kept as typed, and says why.
 */
function LinkCard({ entry, fields, sizeField, onSaved, onRemoved }) {
  const id = useId()
  const [edits, setEdits] = useState({})
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Set once Remove starts: a save still on its way must not bring the piece
  // back when it answers.
  const leaving = useRef(false)
  const payload = entry.payload
  const link = payload.link ?? {}
  const candidates = entry.candidates ?? []
  const chosenId = payload.seed?.row?.chosen ?? null
  const chosen = candidates.find((c) => c.external_id === chosenId) ?? null
  const sizes = (chosen?.sizes ?? []).filter((s) => s.size)
  const shown = fields.filter((f) => LINK_FIELD_KEYS.includes(f.key))
  const values = {
    ...Object.fromEntries(
      [...shown, ...(sizeField ? [sizeField] : [])].map((f) => [
        f.key,
        payload[f.key] ?? '',
      ]),
    ),
    ...edits,
  }
  const title = entryTitle(entry)
  const needs = seedNeeds(fields, editedPayload(payload, edits))
  if (candidates.length > 1 && !chosen) needs.unshift(words.needsColour)

  async function save(extra = {}) {
    const sent = { ...edits, ...extra }
    if (Object.keys(sent).length === 0) return true
    setError(null)
    try {
      const response = await apiFetch(`/api/intake/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: editedKeys(sent) }),
      })
      if (leaving.current) return false
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return false
      }
      const saved = await response.json()
      if (leaving.current) return false
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

  async function choose(externalId) {
    setError(null)
    setBusy(true)
    try {
      const response = await apiFetch(
        `/api/intake/entries/${entry.id}/choose`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ external_id: externalId }),
        },
      )
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      onSaved(await response.json())
    } catch {
      setError(words.noAnswer)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    leaving.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/intake/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'ignored' }),
      })
      if (!response.ok) {
        leaving.current = false
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      onRemoved(await response.json(), title)
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
        <p className="kicker">
          {words.from(linkHost(link.url), words.via[link.via])}{' '}
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {words.open}
          </a>
        </p>
        {link.state === 'kept' && (
          <p className="intake-garment-missing">
            <b>{words.kept}.</b> {words.keptWhy(link.message)}
          </p>
        )}
        {candidates.length > 1 && (
          <fieldset className="intake-link-colours">
            <legend>{words.colour}</legend>
            {candidates.map((candidate) => (
              <label key={candidate.external_id} className="intake-link-colour">
                <input
                  type="radio"
                  name={`${id}-colour`}
                  value={candidate.external_id}
                  checked={candidate.external_id === chosenId}
                  disabled={busy}
                  onChange={() => choose(candidate.external_id)}
                />{' '}
                {candidate.title}
              </label>
            ))}
          </fieldset>
        )}
        <form
          className="intake-garment-fields"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          {/* Disabled while a colour is being chosen, so no edit can race it. */}
          <fieldset className="intake-link-fields" disabled={busy}>
            <KindFields
              kindKey="garment"
              fields={
                sizes.length > 0 ? shown : [...shown, sizeField].filter(Boolean)
              }
              values={values}
              onChange={(key, value) =>
                setEdits((old) => ({ ...old, [key]: value }))
              }
              onBlur={() => save()}
              idPrefix={`link-${entry.id}`}
            />
            {sizes.length > 0 && (
              <div className="intake-field">
                <label htmlFor={`link-${entry.id}-size`}>{words.size}</label>
                <select
                  id={`link-${entry.id}-size`}
                  value={values.size ?? ''}
                  onChange={(event) => save({ size: event.target.value })}
                >
                  <option value="">{words.chooseSize}</option>
                  {sizes.map((size) => (
                    <option
                      key={size.variant_id ?? size.size}
                      value={size.size}
                    >
                      {size.size}
                      {size.available === false ? ` (${words.soldOut})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>
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
            <span>{words.removeAsk(title)}</span>
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={remove}
            >
              {words.removeYes}
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => setAsking(false)}
            >
              {words.removeKeep}
            </button>
          </div>
        ) : (
          <div className="intake-actions quiet">
            <button
              type="button"
              className="btn ghost"
              aria-label={`${words.remove}: ${title}`}
              onClick={() => setAsking(true)}
            >
              {words.remove}
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * Clothes · Check for pieces made from pasted product links: one card each
 * with the store's photo, a colour choice, a size choice and the fields to
 * correct. Also drives the photos' fetching while the cards show. Nothing
 * here reaches the closet; the commit does.
 *
 * @param {object} props
 * @param {object} props.sitting
 * @param {object} props.kind The garment kind from `GET /api/intake/kinds`.
 * @param {object[]} props.entries The sitting's live link entries.
 * @param {(entry: object) => void} props.onEntry An entry the API answered with.
 * @param {{pending: number, failed: boolean}} [props.images] The photo
 *   fetching, when the page runs it once for every piece in the sitting.
 */
export default function LinkCheck({ sitting, kind, entries, onEntry, images }) {
  const [notice, setNotice] = useState('')
  const fields = [...LINK_FIELD_KEYS, 'size']
    .map((key) => kind.fields.find((field) => field.key === key))
    .filter(Boolean)
  const sizeField = fields.find((field) => field.key === 'size')
  const own = useSeedImages(sitting, entries, onEntry, !images)
  const { pending, failed } = images ?? own

  return (
    <section className="intake-seed-check" aria-label="Pieces from links">
      <p className="visually-hidden" role="status">
        {notice}
      </p>
      <h3 className="kicker">{words.head(entries.length)}</h3>
      <p className="muted">{words.lede}</p>
      {pending > 0 && !failed && (
        <p className="muted">{words.photosLeft(pending)}</p>
      )}
      {failed && (
        <p className="admin-error" role="alert">
          {words.photosFailed}
        </p>
      )}
      <ul className="intake-seed-list">
        {entries.map((entry) => (
          <LinkCard
            key={entry.id}
            entry={entry}
            fields={fields}
            sizeField={sizeField}
            onSaved={onEntry}
            onRemoved={(updated, title) => {
              onEntry(updated)
              setNotice(words.removed(title))
            }}
          />
        ))}
      </ul>
    </section>
  )
}
