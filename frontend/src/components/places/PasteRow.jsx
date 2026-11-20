import { placesAdd } from '../../content/placesAdd.js'
import { cityLabel } from '../../lib/cities.js'
import OutingDateForm from './OutingDateForm.jsx'
import PasteFixForm from './PasteFixForm.jsx'
import PlaceFields from './PlaceFields.jsx'
import {
  addressOf,
  chipOf,
  fromOf,
  isOuting,
  lineOf,
  nameOf,
  savedAddressOf,
  setParts,
} from './pasteModel.js'

const words = placesAdd.paste
const outingWords = words.outings

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
      <Credit />
    </div>
  )
}

/** The OpenStreetMap credit, under the form of a state that shows a search outcome. */
function Credit() {
  return (
    <div className="place-credit">
      <p className="place-osm">
        <a href={placesAdd.osmCopyright}>{placesAdd.osmCredit}</a>
      </p>
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
  if (kind === 'unreadable') {
    return (
      <>
        <p className="place-paste-why">{words.unreadableBody}</p>
        <PasteFixForm
          inputId={fieldId}
          label={words.shortLabel}
          initial=""
          button={words.shortSubmit}
          hint={words.unreadableHint}
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
        <Credit />
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
      {(kind === 'none' || kind === 'unusable') && <Credit />}
      {close}
    </>
  )
}

/** The date chip of a past-outing row: the label and how exact it is, or a
 *  dashed "Date not read". Words carry the state; the dashes are a second cue. */
function DateChip({ entry }) {
  const chip = chipOf(entry)
  if (!chip) {
    return (
      <span className="outing-date unread">
        <span>{outingWords.unread}</span>
      </span>
    )
  }
  return (
    <span className="outing-date">
      <span>
        <span className="visually-hidden">{outingWords.readAs}</span>
        {chip.label}
      </span>
      <small>
        {outingWords.precisionWord[chip.precision] ?? chip.precision}
      </small>
    </span>
  )
}

/**
 * One row of a Past outings list (story #350, mockup a-mode-switch.html): the
 * place, a date chip, and the row's buttons. The place's own fixes (pick,
 * rename, name it) are the place paste's; the date has its own form.
 */
function OutingRow({
  entry,
  kind,
  open,
  busy,
  values,
  cities,
  refusal,
  canRetry,
  onToggle,
  onValues,
  onPick,
  onSearch,
  onNameIt,
  onRetry,
  onFixDate,
  onSkip,
}) {
  const title = nameOf(entry)
  const hidden = <span className="visually-hidden"> {title}</span>
  const fieldId = rowFieldId(entry)
  const outing = entry.outing
  const placeCheck = ![
    'date',
    'refused',
    'ready',
    'wait',
    'logged',
    'out',
  ].includes(kind)

  let sub
  if (kind === 'date') sub = outingWords.whyDate(outing.date_text)
  else if (kind === 'refused') sub = refusal || outingWords.refusedRow
  else if (placeCheck) sub = busy ? words.searchingOsm : whyOf(kind, entry)
  else if (kind === 'wait') sub = busy ? words.searchingOsm : words.waiting
  else if (kind === 'out') sub = outingWords.leftOut
  else sub = entry.state === 'owned' ? savedAddressOf(entry) : addressOf(entry)

  const extra = []
  if (kind === 'ready' && entry.state === 'ready') {
    extra.push(outingWords.newPlace(cityLabel(entry.payload?.city ?? 'denver')))
  } else if (kind === 'ready' && entry.state === 'owned') {
    extra.push(outingWords.onList)
  }
  if (outing.repeat_of && kind !== 'out') extra.push(outingWords.repeatLine)
  if (outing.duplicate_of && outing.label && kind !== 'out') {
    extra.push(
      kind === 'ready'
        ? outingWords.alsoInHistory(outing.label)
        : outingWords.inHistory(outing.label),
    )
  }

  const button = (label, onClick, props = {}) => (
    <button
      type="button"
      className={props.primary ? 'btn primary' : 'btn'}
      id={props.id}
      aria-expanded={props.expanded}
      disabled={props.disabled}
      onClick={onClick}
    >
      {label}
      {hidden}
    </button>
  )
  let acts = null
  if (busy && (placeCheck || kind === 'wait')) {
    acts = <span className="place-paste-mark wait">{words.looking1}</span>
  } else if (kind === 'date') {
    acts = button(outingWords.rowButton.date, onToggle, {
      primary: true,
      id: rowButtonId(entry),
      expanded: open,
    })
  } else if (kind === 'ready') {
    acts = (
      <>
        {outing.duplicate_of &&
          button(outingWords.rowButton.skip, () => onSkip(true))}
        {button(outingWords.rowButton.ready, onToggle, {
          id: rowButtonId(entry),
          expanded: open,
        })}
      </>
    )
  } else if (kind === 'logged') {
    acts = button(outingWords.rowButton.logged, () => onSkip(false), {
      id: rowButtonId(entry),
    })
  } else if (kind === 'out') {
    acts = button(outingWords.rowButton.out, () => onSkip(false), {
      id: rowButtonId(entry),
    })
  } else if (kind === 'refused') {
    acts = button(outingWords.rowButton.refused, onToggle, {
      id: rowButtonId(entry),
      expanded: open,
    })
  } else if ((kind === 'failed' && !open) || (kind === 'wait' && canRetry)) {
    acts = button(
      kind === 'wait' && !entry.payload?.attempts
        ? words.rowButton.wait
        : words.rowButton.failed,
      onRetry,
      { id: rowButtonId(entry) },
    )
  } else if (placeCheck && kind !== 'failed') {
    acts = button(words.rowButton[kind], onToggle, {
      id: rowButtonId(entry),
      expanded: open,
    })
  }

  // While the date form is open it is the row: no chip, no button above it.
  const dateFormOpen =
    open && !busy && ['date', 'ready', 'refused'].includes(kind)
  let form = null
  if (open && !busy) {
    if (kind === 'date' || kind === 'ready' || kind === 'refused') {
      form = (
        <OutingDateForm
          entry={entry}
          inputId={fieldId}
          disabled={busy}
          onSubmit={onFixDate}
          onLeaveOut={() => onSkip(true)}
          onCancel={onToggle}
        />
      )
    } else if (placeCheck) {
      form = (
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
          onLeaveOut={() => onSkip(true)}
        />
      )
    }
  }

  return (
    <li className={`place-result outing-row${open ? ' open' : ''}`}>
      <span className="place-result-text">
        <span className="place-result-title">{title}</span>
        {sub && (
          <span
            className={
              kind === 'date' || kind === 'refused' || placeCheck
                ? 'place-paste-why'
                : 'muted'
            }
          >
            {sub}
          </span>
        )}
        {extra.map((line) => (
          <span className="place-paste-set" key={line}>
            {line}
          </span>
        ))}
      </span>
      {!dateFormOpen && (
        <span className="outing-chip">
          <DateChip entry={entry} />
        </span>
      )}
      {!dateFormOpen && <span className="place-result-act">{acts}</span>}
      {form && (
        <div
          className="place-form"
          id={`paste-form-${entry.id}`}
          role="group"
          aria-label={words.fixFor(title)}
        >
          {form}
        </div>
      )}
    </li>
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
 * @param {string} [props.refusal] What the last commit said of this outing.
 * @param {(text: string) => void} [props.onFixDate] A past outing's date words.
 * @param {(skip: boolean) => void} [props.onSkip] Leave a past outing out, or put it back.
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
  refusal = '',
  onFixDate,
  onSkip,
}) {
  if (isOuting(entry)) {
    return (
      <OutingRow
        entry={entry}
        kind={kind}
        open={open}
        busy={busy}
        values={values}
        cities={cities}
        refusal={refusal}
        canRetry={canRetry}
        onToggle={onToggle}
        onValues={onValues}
        onPick={onPick}
        onSearch={onSearch}
        onNameIt={onNameIt}
        onRetry={onRetry}
        onFixDate={onFixDate}
        onSkip={onSkip}
      />
    )
  }
  const title = nameOf(entry)
  const toCheck = !['ready', 'saved', 'same', 'wait'].includes(kind)
  let sub = ''
  if (toCheck) sub = busy ? words.searchingOsm : whyOf(kind, entry)
  else if (kind === 'ready') sub = addressOf(entry)
  else if (kind === 'saved') sub = savedAddressOf(entry)
  else if (kind === 'same') sub = words.sameAs
  // The pasted link, on the rows whose title is the server's wording.
  const link = ['short', 'unreadable', 'long'].includes(kind)
    ? (entry.payload?.source_line ?? '')
    : ''
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
        {words.rowButton.edit}
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
        {link && (
          <span className="place-paste-line" title={link}>
            {link}
          </span>
        )}
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
