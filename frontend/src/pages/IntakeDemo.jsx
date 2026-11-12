import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import ConfidenceBadge from '../components/intake/ConfidenceBadge.jsx'
import { intake as copy } from '../content/intake.js'
import { recording } from '../content/intakeDemo.js'
import {
  demoCounts,
  rowMeta,
  rowTitle,
  spineLabel,
  spineSize,
  stageDelays,
} from '../lib/intakeDemo.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { usePageTitle } from '../lib/usePageTitle.js'

/** The replay's steps, in order; each names the stage that is lit. */
const STEPS = ['idle', 'read', 'match', 'review', 'add']

/** A stage's state while the replay is at `step`. */
function stageState(stage, step) {
  const at = STEPS.indexOf(step)
  const own = STEPS.indexOf(stage)
  if (at === own) return 'now'
  return at > own ? 'done' : 'waiting'
}

/**
 * The drawn shelf: one spine per title the recording read, as printed.
 * One image to a screen reader, named by the titles on it.
 */
function DrawnShelf({ titles }) {
  const reads = titles.map((row) => row.read)
  return (
    <div
      className="intake-demo-spines"
      role="img"
      aria-label={copy.shelfLabel(reads)}
    >
      {titles.map((row, index) => {
        const label = spineLabel(row)
        return (
          <span
            key={`${row.read}-${index}`}
            className="intake-demo-spine"
            data-tone={index % 2 ? 'soft' : undefined}
            data-size={spineSize(label)}
            // Heights vary so it reads as a shelf, deterministically; a long
            // title takes the full height.
            style={{
              height: spineSize(label)
                ? '100%'
                : `${78 + ((index * 37) % 22)}%`,
            }}
          >
            {label}
          </span>
        )
      })}
    </div>
  )
}

/** The four stages, lit as the replay reaches them. */
function StageStrip({ step }) {
  return (
    <ol className="intake-demo-stages" aria-label={copy.stagesLabel}>
      {copy.stages(recording.sources).map((stage) => {
        const state = stageState(stage.key, step)
        return (
          <li
            key={stage.key}
            data-state={state}
            aria-current={state === 'now' ? 'step' : undefined}
          >
            <b>{stage.name}</b>
            <span className="visually-hidden">
              {' '}
              ({copy.stageState[state]})
            </span>{' '}
            {stage.line}
          </li>
        )
      })}
    </ol>
  )
}

/** One Check row: the title, what was read, and its confidence. */
function CheckRow({ row }) {
  const meta = rowMeta(row)
  return (
    <li className="intake-demo-row" aria-label={`${rowTitle(row)}, ${meta}`}>
      <span>
        <span className="intake-demo-title">{rowTitle(row)}</span>
        <span className="intake-demo-meta">{meta}</span>
      </span>
      <ConfidenceBadge state={row.confidence} />
    </li>
  )
}

/**
 * /shelf/intake, the public intake demo (intake spec, "Public demo"): the
 * recorded run of one real shelf photo, replayed. No request is made, no
 * model is called and nothing is saved; the Add button says so. While the
 * committed recording is still the provisional placeholder, the page says
 * the demo is not recorded and shows nothing it would have to invent.
 */
export default function IntakeDemo() {
  usePageTitle(copy.headTitle)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [step, setStep] = useState('idle')
  const [note, setNote] = useState(null)
  const readButton = useRef(null)
  const overButton = useRef(null)
  // The control to focus once the step's render lands: the one pressed
  // unmounts (Read this shelf) or swaps out (Start over).
  const focusNext = useRef(null)

  useEffect(() => {
    focusNext.current?.current?.focus()
    focusNext.current = null
  }, [step])

  useEffect(() => {
    if (!recording || (step !== 'read' && step !== 'match')) return undefined
    const delays = stageDelays(recording.stages, { reduced })
    const next = step === 'read' ? 'match' : 'review'
    const timer = setTimeout(() => setStep(next), delays[step])
    return () => clearTimeout(timer)
  }, [step, reduced])

  if (!recording) {
    return (
      <article className="intake-demo">
        <h1>{copy.title}</h1>
        <p className="intake-demo-lede">{copy.lede}</p>
        <p className="intake-demo-empty">{copy.notRecorded}</p>
      </article>
    )
  }

  const counts = demoCounts(recording.titles)
  const shown = step === 'review' || step === 'add'
  // Reduced motion skips the replay and shows the review at once.
  const read = () => {
    setNote(null)
    focusNext.current = overButton
    setStep(reduced ? 'review' : 'read')
  }
  const over = () => {
    setNote(null)
    focusNext.current = readButton
    setStep('idle')
  }
  // The replay's stage, announced through the status note below.
  const stageNote =
    step === 'read' ? copy.reading : step === 'match' ? copy.matching : null

  return (
    <article className="intake-demo">
      <h1>{copy.title}</h1>
      <p className="intake-demo-lede">{copy.lede}</p>
      <div className="intake-demo-grid">
        <div className="intake-demo-shelf">
          <DrawnShelf titles={recording.titles} />
          <div className="intake-demo-actions">
            {step === 'idle' ? (
              <>
                <button
                  ref={readButton}
                  type="button"
                  className="btn primary"
                  onClick={read}
                >
                  {copy.buttons.read}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setNote(copy.searchNote)}
                >
                  {copy.buttons.search}
                </button>
              </>
            ) : (
              <button
                ref={overButton}
                type="button"
                className="btn"
                onClick={over}
              >
                {copy.buttons.over}
              </button>
            )}
          </div>
          <p className="intake-demo-fine">
            {copy.rack} <Link to={copy.how.to}>{copy.how.label} →</Link>
          </p>
        </div>
        <div>
          <StageStrip step={step} />
          <div className="intake-demo-out">
            {shown ? (
              <ul className="intake-demo-rows">
                {recording.titles.map((row, index) => (
                  <CheckRow key={`${row.read}-${index}`} row={row} />
                ))}
              </ul>
            ) : (
              // The stage line is shown here and announced by the status note.
              <p
                className="intake-demo-empty"
                aria-hidden={stageNote ? 'true' : undefined}
              >
                {stageNote ?? copy.empty}
              </p>
            )}
          </div>
          {shown && (
            <>
              <div className="intake-demo-foot">
                <span>{copy.counts(counts)}</span>
                <button
                  type="button"
                  className="btn primary"
                  disabled={step === 'add' || counts.adds === 0}
                  onClick={() => {
                    setStep('add')
                    setNote(copy.added(counts.adds))
                  }}
                >
                  {copy.buttons.add(counts.adds)}
                </button>
              </div>
              <p className="intake-demo-fine">
                {copy.timing(recording.stages, recording.recorded_on)}
              </p>
            </>
          )}
          <p className="intake-demo-note" role="status">
            {note ??
              (stageNote && (
                <span className="visually-hidden">{stageNote}</span>
              ))}
          </p>
          <p className="intake-demo-fine">{copy.fine}</p>
        </div>
      </div>
    </article>
  )
}
