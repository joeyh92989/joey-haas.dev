import { adminCopy } from '../content/adminCopy.js'
import { categoryLabel, imageUrl } from '../lib/closet.js'
import {
  BOARD,
  BOARD_COLUMN,
  BOARD_ROW,
  BOARD_ROW_ASIDE,
  GARMENT_SLOT,
  GARMENT_STAT,
  PIECE,
  PIECE_ACTS,
  PIECE_COLOR,
  PIECE_GROUND,
  PIECE_IMG,
  PIECE_NAME,
  PIECE_PIC,
  pieceBtn,
} from './closetClasses.js'

const copy = adminCopy.closetToday

/** The colour families that have a --gc-* swatch token (index.css). */
const FAMILIES = new Set([
  'black',
  'white',
  'grey',
  'navy',
  'blue',
  'green',
  'red',
  'orange',
  'yellow',
  'pink',
  'purple',
  'brown',
  'beige',
  'tan',
])

/** The slots that sit in the main column, top to bottom. */
const ROWS = [['outer', 'mid', 'top'], ['bottom'], ['shoes']]

/**
 * Splits an outfit's pieces into the board's rows (outer, mid and top share
 * the first, then bottom, then shoes) and the accessories beside them. A
 * slot the board does not know about rides with the accessories, so no
 * piece is ever dropped. The rows keep DOM order top to bottom.
 *
 * @param {{slot: string}[]} garments
 * @returns {{rows: object[][], aside: object[]}}
 */
export function boardLayout(garments) {
  const known = new Set(ROWS.flat())
  const rows = ROWS.map((slots) =>
    slots.flatMap((slot) => garments.filter((g) => g.slot === slot)),
  ).filter((row) => row.length > 0)
  const aside = garments.filter((g) => !known.has(g.slot))
  return { rows, aside }
}

/**
 * One piece's picture: the photo when there is one, else the piece's own
 * colour (the tagger's data, not a theme colour). A vendor-coloured piece
 * carries no hex, so its colour family picks a --gc-* token; only a piece with
 * no colour known gets the neutral ground; its name is written under
 * the picture either way, so the picture itself is decoration.
 */
function Picture({ piece, size }) {
  const src = imageUrl(piece, { size })
  if (src) {
    return (
      <span className={`outfit-board-pic ${PIECE_PIC} ${PIECE_GROUND.none}`}>
        <img className={PIECE_IMG} src={src} alt="" loading="lazy" />
      </span>
    )
  }
  const family =
    !piece.primary_hex && FAMILIES.has(piece.primary_color)
      ? piece.primary_color
      : undefined
  return (
    <span
      className={`outfit-board-pic ${PIECE_PIC} ${PIECE_GROUND[family ?? 'none']}`}
      data-bare="true"
      data-family={family}
      style={piece.primary_hex ? { backgroundColor: piece.primary_hex } : null}
    />
  )
}

/**
 * A group of pieces, as one picture: outer and top over bottom over shoes,
 * accessories beside. Built client-side from the pieces' own images: no
 * server render, no background removal.
 *
 * Full size, each piece is a list item with its name, qualifier and real
 * Swap and Build around buttons, in DOM order top to bottom. `small` is the
 * alternatives' version: the same layout as decoration (the caller writes
 * the names), without controls.
 *
 * @param {object} props
 * @param {object[]} props.garments Tiles: slot, id, name, image, primary_hex...
 * @param {boolean} [props.small]
 * @param {string|null} [props.lockId] The piece the plan was built around.
 * @param {boolean} [props.busy]
 * @param {boolean} [props.saving]
 * @param {(tile: object) => void} [props.onLock]
 * @param {(slot: string) => void} [props.onSwap]
 * @param {() => void} [props.onSave]
 */
export default function OutfitBoard({
  garments,
  small = false,
  lockId = null,
  busy = false,
  saving = false,
  onLock,
  onSwap,
  onSave,
}) {
  const { rows, aside } = boardLayout(garments)
  const piece = (tile) => (
    <Piece
      key={`${tile.slot}-${tile.id}`}
      tile={tile}
      small={small}
      locked={tile.id === lockId}
      busy={busy}
      saving={saving}
      onLock={onLock}
      onSwap={onSwap}
      onSave={onSave}
    />
  )
  // Full size nests div > ul > li so the lists stay valid HTML; the small
  // version is decoration inside a caller's line, so spans throughout.
  const Wrap = small ? 'span' : 'div'
  const Row = small ? 'span' : 'ul'
  return (
    <Wrap
      className={`outfit-board ${BOARD}`}
      data-size={small ? 'small' : 'full'}
      data-aside={aside.length > 0 ? 'true' : undefined}
      role={small ? undefined : 'group'}
      aria-hidden={small ? 'true' : undefined}
      aria-label={small ? undefined : copy.outfitBoard}
    >
      <Wrap className={`outfit-board-main ${BOARD_COLUMN}`}>
        {rows.map((row) => (
          <Row
            key={row[0].slot}
            className={`outfit-board-row ${BOARD_ROW}`}
            style={{ '--pieces': row.length }}
          >
            {row.map(piece)}
          </Row>
        ))}
      </Wrap>
      {aside.length > 0 && (
        <Wrap className={`outfit-board-aside ${BOARD_COLUMN}`}>
          <Row
            className={`outfit-board-row ${BOARD_ROW_ASIDE}`}
            style={{ '--pieces': 1 }}
          >
            {aside.map(piece)}
          </Row>
        </Wrap>
      )}
    </Wrap>
  )
}

function Piece({ tile, small, locked, busy, saving, onLock, onSwap, onSave }) {
  const Item = small ? 'span' : 'li'
  return (
    <Item
      className={`outfit-piece ${PIECE}`}
      data-slot={tile.slot}
      data-locked={locked ? 'true' : undefined}
      data-transient={tile.transient ? 'true' : undefined}
    >
      <Picture piece={tile} size={small ? 'thumb' : undefined} />
      {!small && (
        <>
          <span className={`garment-slot ${GARMENT_SLOT}`}>
            {categoryLabel(tile.slot) ?? tile.slot}
          </span>
          <span className={`outfit-piece-name ${PIECE_NAME}`}>{tile.name}</span>
          {!tile.image && tile.color_name && (
            <span className={`outfit-piece-color ${PIECE_COLOR}`}>
              {tile.color_name}
            </span>
          )}
          <span className={`outfit-piece-stat ${GARMENT_STAT}`}>
            {tile.qualifier}
          </span>
          <span className={`outfit-piece-acts ${PIECE_ACTS}`}>
            <button
              type="button"
              className={pieceBtn}
              aria-label={`${copy.swap} the ${tile.name}`}
              disabled={busy}
              onClick={() => onSwap(tile.slot)}
            >
              {copy.swap}
            </button>
            {tile.transient ? (
              <button
                type="button"
                className={pieceBtn}
                disabled={saving || busy}
                onClick={onSave}
              >
                {saving ? copy.saving : copy.saveAsOwned}
              </button>
            ) : (
              <button
                type="button"
                className={pieceBtn}
                aria-pressed={locked}
                aria-label={`${locked ? copy.builtAround : copy.buildAround} the ${tile.name}`}
                disabled={busy}
                onClick={() => onLock(tile)}
              >
                {locked ? copy.builtAround : copy.buildAround}
              </button>
            )}
          </span>
        </>
      )}
    </Item>
  )
}
