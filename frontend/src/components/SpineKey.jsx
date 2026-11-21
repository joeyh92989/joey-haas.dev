import { spine } from '../content/spine.js'
import StatusMark from './StatusMark.jsx'

const copy = spine.shelf.spineKey

/**
 * The key to the mark on a spine: a filled square for a title being played
 * or finished, an outlined one for the rest. Each spine also carries its own
 * status as a visually hidden word, so the key is for the eye; a screen
 * reader hears it too, harmlessly.
 */
export default function SpineKey() {
  return (
    <ul
      className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 font-mono text-xs text-muted-foreground"
      aria-label={copy.aria}
    >
      <li>{copy.label}</li>
      <li>
        <StatusMark status="finished">{copy.filled}</StatusMark>
      </li>
      <li>
        <StatusMark status="backlog">{copy.outlined}</StatusMark>
      </li>
    </ul>
  )
}
