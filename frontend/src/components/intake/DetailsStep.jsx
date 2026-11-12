import { useRef, useState } from 'react'
import { apiFetch, errorMessage } from '../../lib/api.js'
import { entryCover, entryTitle, WRITTEN_STATES } from '../../lib/intake.js'
import { editionRows, parseEditionRows } from '../../lib/comics.js'
import { removeEntry } from '../../lib/intakeRemove.js'
import CoverImage from '../CoverImage.jsx'
import { EditionRows } from '../ItemForm.jsx'
import KindFields from './KindFields.jsx'

/** Shelf formats that hold collected editions; singles carry issues only. */
const COLLECTED = ['trades', 'omnibus']

/** Whether a row shows the editions editor (a comic on a collected format). */
const showsEditions = (entry) =>
  entry.kind === 'comic' && COLLECTED.includes(entry.payload?.shelf_format)

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
          kindKey={kind.key}
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
  // Edition rows being typed by entry id, and the shape error each one found.
  // Each is {rows, base}: `base` is the payload's editions (as JSON) when
  // the rows were last typed in, so a change from outside is told apart
  // from this row's own save.
  const [edits, setEdits] = useState({})
  const [editionErrors, setEditionErrors] = useState({})
  const saving = useRef(new Set())
  // The newest payload each entry is known to have, updated before a PATCH
  // goes out: two saves in a row build on each other, not on the render.
  const latest = useRef({})
  const inFlight = useRef({})
  const editors = useRef({})

  const written = sitting.entries.filter((e) =>
    WRITTEN_STATES.includes(e.state),
  )
  const passes = kinds
    .map((kind) => ({
      kind,
      entries: written.filter((e) => e.kind === kind.key),
    }))
    .filter((pass) => pass.entries.length)

  /** The entry's payload as last saved or sent, never an older render's. */
  const currentPayload = (entry) => latest.current[entry.id] ?? entry.payload

  /**
   * PATCHes an entry's payload, tracked so a commit waits for it. `change`
   * maps the latest known payload to the one to send.
   */
  function savePayload(entry, change) {
    const payload = change(currentPayload(entry) ?? {})
    latest.current[entry.id] = payload
    inFlight.current[entry.id] = (inFlight.current[entry.id] ?? 0) + 1
    const request = (async () => {
      const response = await apiFetch(`/api/intake/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      })
      if (!response.ok) {
        delete latest.current[entry.id]
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      onEntry(await response.json())
    })()
      .catch(() => {
        delete latest.current[entry.id]
        setError('The server did not answer; try again.')
      })
      .finally(() => {
        // Nothing newer is on its way: the entry prop is the truth again.
        if (!--inFlight.current[entry.id]) delete latest.current[entry.id]
      })
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
      entries.map((entry) =>
        savePayload(entry, (payload) => ({ ...payload, ...set })),
      ),
    )
    setBusy(false)
  }

  /** Take a title out of the sitting: it is not written, nor listed again. */
  const remove = (entry) => removeEntry(entry, { onEntry, onError: setError })

  function saveField(entry, key) {
    const value = drafts[entry.id]?.[key]
    if (value === undefined || value === (currentPayload(entry)?.[key] ?? ''))
      return
    savePayload(entry, (payload) => ({ ...payload, [key]: value }))
  }

  /** The editor's rows: what was typed, unless the payload moved under it. */
  function editorRows(entry) {
    const edit = edits[entry.id]
    const saved = entry.payload?.editions ?? null
    if (edit && edit.base !== JSON.stringify(saved)) {
      const { editions } = parseEditionRows(edit.rows)
      if (JSON.stringify(editions) !== JSON.stringify(saved)) return null
    }
    return edit?.rows ?? null
  }

  /** Reads one row's editor, records its shape error and returns it. */
  function readEditions(entry) {
    const rows = editorRows(entry)
    if (!rows) return { editions: undefined, error: null }
    const { editions, error: shape } = parseEditionRows(rows)
    setEditionErrors((old) => ({ ...old, [entry.id]: shape }))
    return { editions, error: shape }
  }

  /** Edition rows lose focus: the whole list is read and saved at once. */
  function saveEditions(entry) {
    const { editions, error: shape } = readEditions(entry)
    if (editions === undefined || shape) return
    const same =
      JSON.stringify(editions) ===
      JSON.stringify(currentPayload(entry)?.editions ?? null)
    if (same) return
    savePayload(entry, (payload) => {
      const rest = { ...payload }
      delete rest.editions
      return editions ? { ...rest, editions } : rest
    })
  }

  async function add() {
    // An editor left half filled stops the commit: say where, and go there.
    let blocked = null
    for (const entry of written) {
      if (!showsEditions(entry)) continue
      const { error: shape } = readEditions(entry)
      if (shape && !blocked) blocked = entry
    }
    if (blocked) {
      editors.current[blocked.id]?.querySelector('input')?.focus()
      return
    }
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
              const collected = showsEditions(entry)
              const loose = Object.entries(refused)
                .filter(
                  ([key]) =>
                    !perItem.has(key) && !(collected && key === 'editions'),
                )
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
                      kindKey={kind.key}
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
                    {collected && (
                      <div
                        className="intake-editions"
                        ref={(node) => {
                          if (node) editors.current[entry.id] = node
                          else delete editors.current[entry.id]
                        }}
                        onBlur={(event) => {
                          if (
                            !event.currentTarget.contains(event.relatedTarget)
                          )
                            saveEditions(entry)
                        }}
                      >
                        <EditionRows
                          idPrefix={`row-${entry.id}`}
                          rows={
                            editorRows(entry) ??
                            editionRows(entry.payload?.editions)
                          }
                          onChange={(rows) =>
                            setEdits((old) => ({
                              ...old,
                              [entry.id]: {
                                rows,
                                base: JSON.stringify(
                                  entry.payload?.editions ?? null,
                                ),
                              },
                            }))
                          }
                          error={
                            editorRows(entry)
                              ? editionErrors[entry.id]
                              : refused.editions
                          }
                        />
                      </div>
                    )}
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
