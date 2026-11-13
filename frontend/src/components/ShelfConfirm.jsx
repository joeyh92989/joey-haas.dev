import { redoIntro } from '../content/shelfDelete.js'
import {
  bulkDeleteDetail,
  deleteDetail,
  previewLine,
} from '../lib/deleteDetail.js'
import { useDeletePreview } from '../lib/useDeletePreview.js'
import ConfirmDelete from './ConfirmDelete.jsx'

/**
 * A Delete (or Redo) that reads what goes with the rows when it arms, and
 * says so before it will go ahead: the row's name and its playthroughs,
 * journal days and issue records. One component for the card panel, the
 * List row, the bulk bar and the edit page, so the words never differ.
 *
 * @param {object} props
 * @param {string[]} props.ids  The rows the action is about.
 * @param {string} props.title  One row's title, or "3 items" for several.
 * @param {'delete'|'redo'} [props.mode]
 * @param {boolean} [props.many]  `ids` is a selection: the detail names up
 *   to three titles and the totals.
 * @param {string} [props.label]  The first button's words (default Delete / Redo).
 * @param {string} [props.className]
 * @param {() => (void | Promise<void>)} props.onConfirm
 */
export default function ShelfConfirm({
  ids,
  title,
  mode = 'delete',
  many = false,
  label,
  className,
  onConfirm,
}) {
  const { state, arm } = useDeletePreview()
  const describe = many
    ? bulkDeleteDetail
    : (preview) => deleteDetail(preview, title)
  const { detail, ready } = previewLine(state, describe)
  const redo = mode === 'redo'
  return (
    <ConfirmDelete
      subject={title}
      className={className}
      label={label ?? (redo ? 'Redo' : 'Delete')}
      name={`${redo ? 'Redo' : 'Delete'} ${title}`}
      confirmLabel={redo ? 'Yes, redo' : 'Delete for good'}
      intro={redo ? redoIntro(title) : undefined}
      detail={detail}
      ready={ready}
      onArm={() => arm(ids)}
      onConfirm={onConfirm}
    />
  )
}
