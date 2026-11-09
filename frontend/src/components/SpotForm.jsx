import { useEffect, useId, useRef, useState } from 'react'
import { TAGS, denver, tagLabel } from '../content/denver.js'
import { apiFetch, errorMessage } from '../lib/api.js'

/** The form's fields for a spot, or blank ones for a new spot. */
function startingFields(spot) {
  return {
    name: spot?.name ?? '',
    coords: spot ? `${spot.lat}, ${spot.lng}` : '',
    neighbourhood: spot?.neighbourhood ?? '',
    blurb: spot?.blurb ?? '',
    tags: spot?.tags ?? [],
    anchor: spot?.anchor ?? false,
    is_public: spot?.is_public ?? false,
  }
}

/** The fields whose value differs from where the form started. */
function changedFields(initial, fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(initial[key]),
    ),
  )
}

/**
 * A refused save in words. The spots API's 409 is a slug race, not the
 * catalogue's lock that `errorMessage` words a 409 as, so its own sentence
 * is read here.
 */
async function saveError(response) {
  if (response.status === 401 || response.status === 403) {
    return denver.admin.sessionEnded
  }
  if (response.status === 409) {
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') return body.detail
    } catch {
      // Fall through to the status.
    }
  }
  return errorMessage(response)
}

/**
 * Add or edit one spot: name, pasted coordinates, neighbourhood, tags,
 * blurb, anchor and public. The API parses the coordinates and checks the
 * tags; whatever it refuses comes back as a sentence shown as it is.
 *
 * @param {object} props
 * @param {object|null} props.spot The spot to edit, or null to add one.
 * @param {(spot: object) => void} props.onSaved Called with the saved spot.
 * @param {() => void} props.onCancel Called when the form is closed unsaved.
 */
export default function SpotForm({ spot, onSaved, onCancel }) {
  const id = useId()
  const [initial] = useState(() => startingFields(spot))
  const [name, setName] = useState(initial.name)
  const [coords, setCoords] = useState(initial.coords)
  const [neighbourhood, setNeighbourhood] = useState(initial.neighbourhood)
  const [blurb, setBlurb] = useState(initial.blurb)
  const [tags, setTags] = useState(initial.tags)
  const [anchor, setAnchor] = useState(initial.anchor)
  const [isPublic, setIsPublic] = useState(initial.is_public)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const heading = useRef(null)

  // Opening the form moves focus to it, so a keyboard user lands on what
  // just appeared above the table rather than staying on the button.
  useEffect(() => {
    heading.current?.focus()
  }, [])

  function toggleTag(tag) {
    setTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : TAGS.filter((t) => t === tag || current.includes(t)),
    )
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const fields = {
      name,
      coords,
      neighbourhood,
      blurb,
      tags,
      anchor,
      is_public: isPublic,
    }
    // An edit sends only what changed, so a switch flipped in the table
    // while the form was open is not written back to its old value.
    const body = spot ? changedFields(initial, fields) : fields
    try {
      const response = await apiFetch(
        spot ? `/api/spots/${spot.id}` : '/api/spots',
        {
          method: spot ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!response.ok) {
        setError(await saveError(response))
        return
      }
      onSaved(await response.json())
    } catch {
      setError('The spot couldn’t be saved. Check your connection.')
    } finally {
      setSaving(false)
    }
  }

  const title = spot ? denver.form.editTitle : denver.form.addTitle
  return (
    <form
      className="item-detail-form spot-form"
      onSubmit={save}
      aria-label={title}
    >
      <h2 className="spot-form-title" ref={heading} tabIndex={-1}>
        {title}
      </h2>
      {error && (
        <p className="admin-error spot-form-error" role="alert">
          {error}
        </p>
      )}
      <label htmlFor={`${id}-name`}>Name</label>
      <input
        id={`${id}-name`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        maxLength={200}
      />
      <label htmlFor={`${id}-coords`}>Coordinates</label>
      <div>
        <input
          id={`${id}-coords`}
          value={coords}
          onChange={(event) => setCoords(event.target.value)}
          required
          aria-describedby={`${id}-coords-hint`}
          inputMode="text"
          autoComplete="off"
        />
        <p className="spot-form-hint" id={`${id}-coords-hint`}>
          {denver.form.coordsHint}
        </p>
      </div>
      <label htmlFor={`${id}-hood`}>Neighbourhood</label>
      <input
        id={`${id}-hood`}
        value={neighbourhood}
        onChange={(event) => setNeighbourhood(event.target.value)}
        maxLength={100}
      />
      <span className="spot-form-label" id={`${id}-tags`}>
        Tags
      </span>
      <div className="chip-row" role="group" aria-labelledby={`${id}-tags`}>
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            className="chip"
            aria-pressed={tags.includes(tag)}
            onClick={() => toggleTag(tag)}
          >
            {tagLabel(tag)}
          </button>
        ))}
      </div>
      <label htmlFor={`${id}-blurb`}>Blurb</label>
      <textarea
        id={`${id}-blurb`}
        value={blurb}
        onChange={(event) => setBlurb(event.target.value)}
        maxLength={500}
        rows={3}
      />
      <label htmlFor={`${id}-anchor`}>Anchor</label>
      <span className="spot-form-check">
        <input
          id={`${id}-anchor`}
          type="checkbox"
          checked={anchor}
          onChange={(event) => setAnchor(event.target.checked)}
          aria-describedby={`${id}-anchor-hint`}
        />
        <span className="spot-form-hint" id={`${id}-anchor-hint`}>
          {denver.form.anchorHint}
        </span>
      </span>
      <label htmlFor={`${id}-public`}>Public</label>
      <span className="spot-form-check">
        <input
          id={`${id}-public`}
          type="checkbox"
          checked={isPublic}
          onChange={(event) => setIsPublic(event.target.checked)}
          aria-describedby={`${id}-public-hint`}
        />
        <span className="spot-form-hint" id={`${id}-public-hint`}>
          {denver.form.publicHint}
        </span>
      </span>
      <div className="item-detail-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
