import { placesAdd } from '../../content/placesAdd.js'
import PasteFixForm from './PasteFixForm.jsx'
import PlaceFields from './PlaceFields.jsx'
import { addressOf, fromOf, lineOf, nameOf, setParts } from './pasteModel.js'

const words = placesAdd.paste

/** The id a row's own button has, so focus can come back to it. */
export const rowButtonId = (entry) => `paste-btn-${entry.id}`

/** The id of a row's first field, where focus lands when it opens. */
export const rowFieldId = (entry) => `paste-fix-${entry.id}`

/** The sentence under a to-check row's name. */
function whyOf(kind, entry) {
  if (kind === 'several') {
    return words.why.several(entry.payload?.candidates?.length ?? 0)
  }
  return words.why[kind] ?? ''
}

/** The candidates of a to-check entry, each with Pick. */
function Candidates({ entry, busy, onPick }) {
  const candidates = entry.payload?.candidates ?? []
  return (
    <div className="place-paste-cands">
      <ul aria-label={words.candidatesFor(lineOf(entry))}>
        {candidates.map((candidate, index) => (
          <li className="place-result" key={candidate.source_id ?? index}>
            <span className="place-result-text">
              <span className="place-result-title">{candidate.title}</span>
              {candidate.address && (
                <span className="muted">{candidate.address}</span>
              )}
            </span>
            {candidate.category && (
              <span className="place-result-kind">{candidate.category}</span>
            )}
            {candidate.owned_spot_id ? (
              <span className="place-paste-mark saved">{words.savedMark}</span>
            ) : (
              <button
                type="button"
                className="btn primary"
                id={`paste-pick-${entry.id}-${index}`}
                aria-label={words.pickLabel(candidate.title, candidate.address)}
                disabled={busy}
                onClick={() => onPick(index)}
              >
                {words.pick}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="place-credit">
        <p className="place-osm">
          <a href={placesAdd.osmCopyright}>{placesAdd.osmCredit}</a>
        </p>
      </div>
    </div>
  )
}

/** What an open row holds: details, candidates, or a name to search. */
function Body({
  entry,
  kind,
  busy,
  values,
  cities,
  onValues,
  onToggle,
  onPick,
  onSearch,
  onNameIt,
  onLeaveOut,
}) {
  const title = nameOf(entry)
  const fieldId = rowFieldId(entry)
  if (kind === 'ready') {
    return (
      <>
        <PlaceFields values={values} onChange={onValues} cities={cities} />
        <div className="intake-actions">
          <button type="button" className="btn" id={fieldId} onClick={onToggle}>
            {words.done}
          </button>
          <button type="button" className="btn ghost" onClick={onLeaveOut}>
            {words.leaveOut}
            <span className="visually-hidden"> {title}</span>
          </button>
        </div>
      </>
    )
  }
  const close = (
    <div className="intake-actions">
      <button type="button" className="btn ghost" onClick={onToggle}>
        {kind === 'failed' ? words.close : words.cancel}
      </button>
    </div>
  )
  if (kind === 'several') {
    return (
      <>
        <Candidates entry={entry} busy={busy} onPick={onPick} />
        <PasteFixForm
          inputId={fieldId}
          label={words.changeAndSearch}
          initial={nameOf(entry)}
          button={words.searchAgain}
          disabled={busy}
          onSubmit={onSearch}
        />
        {close}
      </>
    )
  }
  if (kind === 'coords') {
    return (
      <>
        <p className="place-paste-why">{words.coordsBody}</p>
        <PasteFixForm
          inputId={fieldId}
          label={placesAdd.name}
          initial=""
          button={words.useName}
          disabled={busy}
          onSubmit={onNameIt}
        />
        {close}
      </>
    )
  }
  if (kind === 'short') {
    return (
      <>
        <p className="place-paste-why">{words.shortBody}</p>
        <PasteFixForm
          inputId={fieldId}
          label={words.shortLabel}
          initial=""
          button={words.shortSubmit}
          hint={words.shortHint}
          disabled={busy}
          onSubmit={onSearch}
        />
        {close}
      </>
    )
  }
  if (kind === 'failed') {
    return (
      <>
        <p className="place-paste-why">{words.failedBody}</p>
        <PasteFixForm
          inputId={fieldId}
          label={placesAdd.name}
          initial={nameOf(entry)}
          button={words.searchAgain}
          hint={words.searchAgainHint}
          disabled={busy}
          onSubmit={onSearch}
        />
        {close}
      </>
    )
  }
  // none, unusable, long
  const body = {
    long: words.longBody,
    unusable: words.unusableBody,
    none: words.noneBody(nameOf(entry)),
  }[kind]
  return (
    <>
      <p className="place-paste-why">{body}</p>
      <PasteFixForm
        inputId={fieldId}
        label={placesAdd.name}
        initial={kind === 'long' ? '' : nameOf(entry)}
        button={words.searchAgain}
        disabled={busy}
        onSubmit={onSearch}
      />
      {kind === 'none' && (
        <div className="place-credit">
          <p className="place-osm">
            <a href={placesAdd.osmCopyright}>{placesAdd.osmCredit}</a>
          </p>
        </div>
      )}
      {close}
    </>
  )
}

/**
 * One row of the review list (the mockup's `rowA`): the place's name and
 * what is known of it, a mark or a one-line summary, the row's button, and,
 * when open, the details or the fix.
 *
 * @param {object} props
 * @param {object} props.entry The server's entry.
 * @param {string} props.kind From `kindOf`.
 * @param {boolean} props.open
 * @param {boolean} props.busy A request for this row is under way.
 * @param {object} props.values The row's owner fields (a ready row).
 * @param {string[]} props.cities
 * @param {() => void} props.onToggle Opens or closes the row.
 * @param {(values: object) => void} props.onValues
 * @param {(index: number) => void} props.onPick
 * @param {(name: string) => void} props.onSearch Search by this name.
 * @param {(name: string) => void} props.onNameIt Name a coordinate line.
 * @param {() => void} props.onRetry Look the line up again as it is.
 * @param {() => void} props.onLeaveOut
 * @param {() => void} props.onPutBack
 * @param {boolean} [props.canRetry] No walk is running, so a line still waiting
 *   offers Try again.
 */
export default function PasteRow({
  entry,
  kind,
  open,
  busy,
  values,
  cities,
  onToggle,
  onValues,
  onPick,
  onSearch,
  onNameIt,
  onRetry,
  onLeaveOut,
  onPutBack,
  canRetry = false,
}) {
  const title = nameOf(entry)
  const toCheck = !['ready', 'saved', 'same', 'wait'].includes(kind)
  let sub = ''
  if (toCheck) sub = busy ? words.searchingOsm : whyOf(kind, entry)
  else if (kind === 'ready') sub = addressOf(entry)
  else if (kind === 'same') sub = words.sameAs
  const from = kind === 'ready' || kind === 'saved' ? fromOf(entry, words) : ''
  const hidden = <span className="visually-hidden"> {title}</span>

  let mark = null
  if (kind === 'wait') {
    mark = busy ? (
      <span className="place-paste-mark wait">{words.looking1}</span>
    ) : null
  } else if (kind === 'saved') {
    mark = <span className="place-paste-mark saved">{words.savedMark}</span>
  } else if (kind === 'ready') {
    const parts = setParts(values)
    mark = (
      <span className="place-paste-set">
        {words.set(parts.city, parts.isPublic, parts.tags)}
      </span>
    )
  }

  let action = null
  if (busy && toCheck) {
    action = (
      <button type="button" className="btn" disabled>
        {placesAdd.searching}
      </button>
    )
  } else if (kind === 'ready') {
    action = (
      <button
        type="button"
        className="btn"
        id={rowButtonId(entry)}
        aria-expanded={open}
        onClick={onToggle}
      >
        {words.rowButton.details}
        {hidden}
      </button>
    )
  } else if ((kind === 'failed' && !open) || (kind === 'wait' && canRetry)) {
    action = (
      <button
        type="button"
        className="btn"
        id={rowButtonId(entry)}
        onClick={onRetry}
      >
        {kind === 'wait' && !entry.payload?.attempts
          ? words.rowButton.wait
          : words.rowButton.failed}
        {hidden}
      </button>
    )
  } else if (kind === 'left') {
    action = (
      <button
        type="button"
        className="btn"
        id={rowButtonId(entry)}
        onClick={onPutBack}
      >
        {words.rowButton.left}
        {hidden}
      </button>
    )
  } else if (toCheck && kind !== 'failed') {
    action = (
      <button
        type="button"
        className="btn"
        id={rowButtonId(entry)}
        aria-expanded={open}
        onClick={onToggle}
      >
        {words.rowButton[kind]}
        {hidden}
      </button>
    )
  }

  return (
    <li className={`place-result${open ? ' open' : ''}`}>
      <span className="place-result-text">
        <span className="place-result-title">{title}</span>
        {sub && <span className="muted">{sub}</span>}
        {from && <span className="place-paste-from">{from}</span>}
      </span>
      {mark}
      {action}
      {open && !busy && (
        <div
          className="place-form"
          id={`paste-form-${entry.id}`}
          role="group"
          aria-label={
            kind === 'ready' ? words.detailsFor(title) : words.fixFor(title)
          }
        >
          <Body
            entry={entry}
            kind={kind}
            busy={busy}
            values={values}
            cities={cities}
            onValues={onValues}
            onToggle={onToggle}
            onPick={onPick}
            onSearch={onSearch}
            onNameIt={onNameIt}
            onLeaveOut={onLeaveOut}
          />
        </div>
      )}
    </li>
  )
}
