import { useState } from 'react'
import { compactRanges, expandRanges, parseEditionRows } from '../lib/comics.js'
import { laneSpans, lanesLabel, runModel } from '../lib/comicRun.js'
import RunBox from './RunBox.jsx'
import RunLanes, { RunKey } from './RunLanes.jsx'

const MODES = [
  ['own', 'Owned'],
  ['read', 'Read to here'],
  ['skip', 'Skip'],
]

/**
 * The form's comic fields as a run model: the single issues, the edition
 * rows that read cleanly, the read marker and the skips. A range the
 * client cannot expand is skipped over (the API judges it on Save).
 */
export function formRun(form, { released, ongoing, nextIssue }) {
  const { editions } = parseEditionRows(form.editions)
  return runModel({
    singles: form.issues_owned,
    editions: editions ?? [],
    readTo: form.read_to === '' ? null : Number(form.read_to) || null,
    released: released ?? 0,
    ongoing,
    nextIssue,
    skipped: form.issues_skipped,
  })
}

/**
 * What one tap does to the form, by mode. Owned toggles the issue in the
 * singles and drops a skip on it; Read to here moves the marker there (a
 * tap on the current marker moves it back one); Skip toggles a skip and
 * does nothing on a held issue, the pull list's rule.
 *
 * @returns {object|null} The next form, or null for no change.
 */
export function applyTap(form, issue, mode) {
  const n = issue.n
  if (mode === 'own') {
    if (issue.edition) return null
    const singles = new Set(expandRanges(form.issues_owned))
    const skipped = new Set(expandRanges(form.issues_skipped))
    if (singles.has(n)) singles.delete(n)
    else singles.add(n)
    skipped.delete(n)
    return {
      ...form,
      issues_owned: compactRanges(singles),
      issues_skipped: compactRanges(skipped),
    }
  }
  if (mode === 'read') {
    const current = form.read_to === '' ? null : Number(form.read_to)
    const next = current === n ? n - 1 : n
    return { ...form, read_to: next > 0 ? String(next) : '' }
  }
  if (issue.held) return null
  const skipped = new Set(expandRanges(form.issues_skipped))
  if (skipped.has(n)) skipped.delete(n)
  else skipped.add(n)
  return { ...form, issues_skipped: compactRanges(skipped) }
}

/**
 * The admin edit's run card: the lanes as a live preview (with the private
 * Skipped lane), then a labelled group of three toggle buttons choosing
 * what a tap does, then the box as the editor. Taps edit the form; Save
 * commits, as the rest of the form does.
 *
 * @param {object} props
 * @param {object} props.form - The edit form's state.
 * @param {(next: object) => void} props.onChange
 * @param {number|null} props.released - From the item's comic_run.
 * @param {boolean} [props.ongoing]
 * @param {object|null} [props.nextIssue]
 */
export default function ComicRunEditor({
  form,
  onChange,
  released,
  ongoing = false,
  nextIssue = null,
}) {
  const [mode, setMode] = useState('own')
  const model = formRun(form, { released, ongoing, nextIssue })
  const spans = laneSpans(model)
  const summary = `${model.held} of ${model.released}${model.ongoing ? '+' : ''} · ${model.missing} missing`

  return (
    <section className="comic-run-editor" aria-labelledby="comic-run-title">
      <h2 id="comic-run-title">
        The run <small>{summary}</small>
      </h2>
      {!spans.short && (
        <RunLanes spans={spans} label={lanesLabel(model)} showSkipped />
      )}
      <div
        className="comic-tap-modes"
        role="group"
        aria-labelledby="comic-tap-label"
      >
        <span id="comic-tap-label" className="muted">
          What a tap does
        </span>
        {MODES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
        <span className="comic-private">skip is private</span>
      </div>
      {model.released > 0 ? (
        <RunBox
          model={model}
          mode="edit"
          onCell={(issue) => {
            const next = applyTap(form, issue, mode)
            if (next) onChange(next)
          }}
        />
      ) : (
        <p className="muted">
          Comic Vine has no issue count for this series yet; type the issues
          below.
        </p>
      )}
      <RunKey variant="box" showSkipped />
    </section>
  )
}
