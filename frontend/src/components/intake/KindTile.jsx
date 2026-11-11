/**
 * One kind on the Add page: its name, why its source is off when it is,
 * and the ways in it declared. Pressing it starts a photo sitting of that
 * kind. A kind with no photo way in (board games while BGG needs a token)
 * is a disabled button that says so, never a hidden one.
 *
 * @param {object} props
 * @param {{key: string|null, label: string, ways_in: string[],
 *   source_state?: string|null, note?: string}} props.kind A kind from
 *   `GET /api/intake/kinds`, or the Add page's mixed shelf.
 * @param {(kind: object) => void} props.onStart
 * @param {boolean} [props.busy] A sitting is being started.
 */
export default function KindTile({ kind, onStart, busy = false }) {
  const photos = kind.ways_in.includes('photo')
  const sourceOff =
    kind.source_state && kind.source_state !== 'ready'
      ? kind.source_state
      : null
  const note = !photos
    ? 'No photos: added one at a time'
    : (sourceOff ?? kind.note ?? null)
  return (
    <button
      type="button"
      className="intake-kind"
      disabled={!photos || busy}
      onClick={() => onStart(kind)}
    >
      <span className="intake-kind-name">{kind.label}</span>
      {note && <span className="intake-kind-note">{note}</span>}
      {sourceOff && !photos && (
        <span className="intake-kind-note">{sourceOff}</span>
      )}
      <span className="intake-kind-ways">{kind.ways_in.join(' · ')}</span>
    </button>
  )
}
