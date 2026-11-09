/**
 * The toast after an upload: "12 added · tagging tonight", with Tag now,
 * which runs one batch of the queue (the Profile's budget is the nightly
 * job's; the button is one call). After a run it says what happened in the
 * route's own words.
 *
 * @param {object} props
 * @param {number} props.added Garments the upload created.
 * @param {'idle'|'tagging'|'done'} props.state
 * @param {string|null} props.result The run's outcome in words.
 * @param {() => void} props.onTagNow
 * @param {() => void} props.onDismiss
 */
export default function UploadToast({
  added,
  state,
  result,
  onTagNow,
  onDismiss,
}) {
  return (
    <div className="closet-toast" role="status">
      <span>
        <strong>{added} added</strong>
        {state === 'done' && result ? ` · ${result}` : ' · tagging tonight'}
      </span>
      <span className="closet-toast-acts">
        {state !== 'done' && (
          <button
            type="button"
            className="btn sm"
            disabled={state === 'tagging'}
            onClick={onTagNow}
          >
            {state === 'tagging' ? 'Tagging…' : 'Tag now'}
          </button>
        )}
        <button type="button" className="btn sm ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </span>
    </div>
  )
}
