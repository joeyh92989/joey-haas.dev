import { useId } from 'react'
import { playMove, statusMoves } from '../lib/statusMoves.js'
import CardActionsShell from './CardActionsShell.jsx'
import QuickRate from './QuickRate.jsx'
import ShelfConfirm from './ShelfConfirm.jsx'

/**
 * The admin controls on one shelf card: quick rate, the one-tap move to
 * Playing, favourite, status, publish and Up next.
 *
 * Rendered through PosterCard's `actions`, so it is a sibling of the card's
 * link. On a pointer device the panel is always in the document and CSS
 * reveals it on hover and on focus-within, with opacity rather than display,
 * so a keyboard can still reach it. On touch it collapses to one "…" button
 * that opens the same panel as a sheet, closed by Escape or a tap outside.
 *
 * Every callback receives the item and the new value; the page decides what
 * to PATCH and reloads rather than updating optimistically.
 *
 * @param {object} props
 * @param {object} props.item - The row as the server last returned it.
 * @param {boolean} [props.favoritesFull] - Four favourites are already set.
 *   A heart that is not already a favourite is then marked unavailable with
 *   aria-disabled, which keeps it focusable so the reason can be heard; a
 *   click is still reported and the page decides what it does.
 * @param {(item: object, rating: number|null) => void} props.onRate
 * @param {(item: object, favorite: boolean) => void} props.onFavorite
 * @param {(item: object, status: string) => void} props.onStatus
 * @param {(item: object, isPublic: boolean) => void} props.onPublish
 * @param {(item: object, pinned: boolean) => void} props.onPin - Not offered
 *   on a want-list row, which the server refuses to pin.
 * @param {(item: object) => (void | Promise<void>)} [props.onDelete] - Runs
 *   after the confirm that names the row and what goes with it.
 * @param {(item: object) => (void | Promise<void>)} [props.onRedo] - The
 *   same, for sending the row back through Add.
 */
export default function ShelfCardActions({
  item,
  favoritesFull = false,
  onRate,
  onFavorite,
  onStatus,
  onPublish,
  onPin,
  onDelete,
  onRedo,
}) {
  const fullNoteId = useId()
  const blocked = favoritesFull && !item.favorite
  const play = playMove(item)
  const label = `Actions for ${item.title}`

  const panel = (
    <>
      <QuickRate value={item.rating} onChange={(next) => onRate(item, next)} />
      <div className="shelf-actions-row">
        {/* The same move as the status menu's Playing entry, one tap away;
            the server decides what it records. */}
        {play && (
          <button
            type="button"
            className="shelf-play"
            aria-label={play.name}
            title={play.hint ?? undefined}
            onClick={() => onStatus(item, 'active')}
          >
            {play.label}
          </button>
        )}
        <button
          type="button"
          className="shelf-favourite"
          aria-pressed={Boolean(item.favorite)}
          aria-label="Favorite"
          aria-disabled={blocked || undefined}
          aria-describedby={blocked ? fullNoteId : undefined}
          onClick={() => onFavorite(item, !item.favorite)}
        >
          <span aria-hidden="true">{item.favorite ? '♥' : '♡'}</span>
        </button>
        {blocked && (
          <span id={fullNoteId} className="visually-hidden">
            Four favorites already set. Remove one first.
          </span>
        )}
        <select
          aria-label={`Status for ${item.title}`}
          value={item.status}
          onChange={(event) => onStatus(item, event.target.value)}
        >
          {statusMoves(item).map((entry) => (
            <option key={entry.status} value={entry.status}>
              {entry.name}
            </option>
          ))}
        </select>
        <label className="shelf-publish">
          <input
            type="checkbox"
            checked={item.is_public}
            aria-label={`Public: ${item.title}`}
            onChange={(event) => onPublish(item, event.target.checked)}
          />
          <span aria-hidden="true">Public</span>
        </label>
        {item.owned_format !== 'none' && (
          <button
            type="button"
            className="shelf-pin"
            aria-pressed={Boolean(item.pinned_at)}
            onClick={() => onPin(item, !item.pinned_at)}
          >
            Up next
          </button>
        )}
      </div>
      {(onRedo || onDelete) && (
        <div className="shelf-actions-row shelf-actions-danger">
          {onRedo && (
            <ShelfConfirm
              mode="redo"
              ids={[item.id]}
              title={item.title}
              className="shelf-pin"
              onConfirm={() => onRedo(item)}
            />
          )}
          {onDelete && (
            <ShelfConfirm
              ids={[item.id]}
              title={item.title}
              className="shelf-pin shelf-delete"
              onConfirm={() => onDelete(item)}
            />
          )}
        </div>
      )}
    </>
  )

  return <CardActionsShell label={label}>{panel}</CardActionsShell>
}
