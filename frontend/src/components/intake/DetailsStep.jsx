import { useRef, useState } from 'react'
import { apiFetch, errorMessage } from '../../lib/api.js'
import { entryCover, entryTitle, WRITTEN_STATES } from '../../lib/intake.js'
import { removeEntry } from '../../lib/intakeRemove.js'
import CoverImage from '../CoverImage.jsx'
import KindFields from './KindFields.jsx'

const plural = (label, n) => {
  const word = label.toLowerCase()
  return n === 1 ? word : `${word}s`
}

/** A kind's "Set for all N": the fields a whole pass can share, and Apply. */
function SetForAll({ kind, entries, onApply, busy }) {
  const [values, setValues] = useState({})
  const shared = kind.fields.filter((field) => !field.per_item)
  if (!shared.length) return null
  const name = `Set for all ${entries.length} ${plural(kind.label, entries.length)}`
  return (
    <div role="group" aria-label={name} className="intake-setall">
      <p className="kicker">{name}</p>
      <div className="intake-setall-fields">
        <KindFields
          idPrefix={`all-${kind.key}`}
          fields={kind.fields}
          mode="all"
          values={values}
          onChange={(key, value) =>
            setValues((old) => ({ ...old, [key]: value }))
          }
        />
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => onApply(entries, values)}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

/**
 * Sitting step 3 (kinds that have one): one pass per kind present, in the
 * registry's order (spec D6). Each pass has "Set for all N" with the
 * kind's shared fields, then a compact row per entry with the fields that
 * differ per item. Edits are saved to the entry as they are made; a
 * commit's refusal shows the write path's message beside its field.
 *
 * @param {object} props
 * @param {object} props.sitting
 * @param {object[]} props.kinds From `GET /api/intake/kinds`, in order.
 * @param {(entry: object) => void} props.onEntry
 * @param {Record<string, Record<string, string>>} props.refusals By entry
 *   id, then field key (`''` for a refusal no single field owns).
 * @param {() => Promise<void>} props.onCommit
 * @param {() => void} props.onLater Finish later: back to the Add page.
 * @param {() => void} props.onBack Back to Check (the step is saved, so
 *   without it a sitting left in Details could never be checked again).
 * @param {boolean} props.committing
 * @param {string} props.target "the shelf" or "the closet".
 * @param {import('react').Ref<HTMLHeadingElement>} props.headingRef
 */
export default function DetailsStep({
  sitting,
  kinds,
  onEntry,
  refusals,
  onCommit,
  onLater,
  onBack,
  committing,
  target,
  headingRef,
}) {
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const saving = useRef(new Set())

  const written = sitting.entries.filter((e) =>
    WRITTEN_STATES.includes(e.state),
  )
  const passes = kinds
    .map((kind) => ({
      kind,
      entries: written.filter((e) => e.kind === kind.key),
    }))
    .filter((pass) => pass.entries.length)

  /** PATCHes an entry's payload, tracked so a commit waits for it. */
  function savePayload(entry, payload) {
    const request = (async () => {
      const response = await apiFetch(`/api/intake/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      })
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      onEntry(await response.json())
    })().catch(() => setError('The server did not answer; try again.'))
    saving.current.add(request)
    request.finally(() => saving.current.delete(request))
    return request
  }

  async function apply(entries, values) {
    const set = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== ''),
    )
    if (!Object.keys(set).length) return
    setBusy(true)
    setError(null)
    await Promise.all(
      entries.map((entry) => savePayload(entry, { ...entry.payload, ...set })),
    )
    setBusy(false)
  }

  /** Take a title out of the sitting: it is not written, nor listed again. */
  const remove = (entry) => removeEntry(entry, { onEntry, onError: setError })

  function saveField(entry, key) {
    const value = drafts[entry.id]?.[key]
    if (value === undefined || value === (entry.payload?.[key] ?? '')) return
    savePayload(entry, { ...entry.payload, [key]: value })
  }

  async function add() {
    // A field still saving from its blur goes in before the commit reads it.
    await Promise.all([...saving.current])
    await onCommit()
  }

  return (
    <section className="intake-step" aria-labelledby="intake-step-heading">
      <h2 id="intake-step-heading" ref={headingRef} tabIndex={-1}>
        Details
      </h2>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!passes.length && <p className="muted">Nothing is ready to add yet.</p>}
      {passes.map(({ kind, entries }) => (
        <div key={kind.key} className="intake-pass panel">
          <h3>{kind.label}</h3>
          <SetForAll
            kind={kind}
            entries={entries}
            onApply={apply}
            busy={busy}
          />
          <ul className="intake-rows">
            {entries.map((entry) => {
              const title = entryTitle(entry)
              const refused = refusals[entry.id] ?? {}
              const perItem = new Set(
                kind.fields.filter((f) => f.per_item).map((f) => f.key),
              )
              const loose = Object.entries(refused)
                .filter(([key]) => !perItem.has(key))
                .map(([, message]) => message)
              return (
                <li key={entry.id}>
                  <div role="group" aria-label={title} className="intake-row">
                    <CoverImage src={entryCover(entry)} type={entry.kind} />
                    <div>
                      <p className="intake-row-title">{title}</p>
                      <p className="muted">{entry.chosen?.year ?? ''}</p>
                      {loose.map((message) => (
                        <p key={message} className="intake-refusal">
                          {message}
                        </p>
                      ))}
                    </div>
                    <KindFields
                      idPrefix={`row-${entry.id}`}
                      fields={kind.fields}
                      mode="item"
                      values={{ ...entry.payload, ...drafts[entry.id] }}
                      refusals={refused}
                      onChange={(key, value) =>
                        setDrafts((old) => ({
                          ...old,
                          [entry.id]: { ...old[entry.id], [key]: value },
                        }))
                      }
                      onBlur={(key) => saveField(entry, key)}
                    />
                    <button
                      type="button"
                      className="btn sm ghost"
                      aria-label={`Remove ${title}`}
                      onClick={() => remove(entry)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <div className="intake-bar">
        <p className="muted">
          New rows are private until published. Finish later keeps the sitting.
        </p>
        <div className="intake-actions">
          <button type="button" className="btn" onClick={onBack}>
            <span aria-hidden="true">←</span> Back to Check
          </button>
          <button type="button" className="btn ghost" onClick={onLater}>
            Finish later
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={committing || !written.length}
            onClick={add}
          >
            {`Add ${written.length} to ${target}`}
          </button>
        </div>
      </div>
    </section>
  )
}
