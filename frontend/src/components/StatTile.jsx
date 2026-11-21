import { cn } from '../lib/utils.js'
import { Card } from './ui/card.jsx'
import { cx } from '../lib/cx.js'
import {
  STAT_DETAIL,
  STAT_LABEL,
  STAT_TILES,
  STAT_TILES_FIGURES,
  STAT_TILES_MARGIN,
  STAT_TILE_FIGURES,
  STAT_VALUE,
} from './overview-classes.js'

/** A tile is a flat card: 1px outline, the card colour, 16px inside. */
const TILE = 'gap-0 px-4 text-[1rem] text-muted-foreground'

/**
 * One headline figure: a mono label, the number, and an optional line of
 * detail under it. Tiles go inside `StatTiles`, which is the description
 * list that gives each label its value.
 *
 * `children` is a composite value (a rating, a few labelled rows) in place
 * of `value`: it sits in a column of small lines, and the label drops the
 * kicker for the quieter `figures` look the item page uses.
 *
 * @param {object} props
 * @param {string} props.label What is counted.
 * @param {import('react').ReactNode} [props.value] The figure.
 * @param {import('react').ReactNode} [props.detail] A line of context.
 * @param {import('react').ReactNode} [props.children] A composite value.
 */
export default function StatTile({ label, value, detail, children }) {
  if (children != null) {
    return (
      <Card
        className={cn(
          'stat-tile stat-tile-figures',
          TILE,
          'py-3',
          STAT_TILE_FIGURES,
        )}
      >
        <dt>{label}</dt>
        <dd>{children}</dd>
      </Card>
    )
  }
  return (
    <Card className={cn('stat-tile', TILE)}>
      <dt className={cx('kicker', STAT_LABEL)}>{label}</dt>
      <dd
        className={cx(
          'stat-value font-heading font-medium text-foreground',
          STAT_VALUE,
        )}
      >
        {value}
      </dd>
      {detail && <dd className={cx('stat-detail', STAT_DETAIL)}>{detail}</dd>}
    </Card>
  )
}

/**
 * A row of tiles: four across on a desktop, two on a narrow screen. With a
 * `label` the list sits in a named group, since a bare <dl> takes no label;
 * without one there is no group, as an unnamed one adds nothing.
 *
 * @param {object} props
 * @param {string} [props.label] An accessible name for the row.
 * @param {boolean} [props.figures] Tiles hold composite `children`: fit as
 *   many as the width allows rather than four across.
 * @param {string} [props.margin] The row's margin classes, in place of the
 *   default space below (/stats puts it above).
 * @param {import('react').ReactNode} props.children `StatTile`s.
 */
export function StatTiles({
  label,
  figures = false,
  margin = STAT_TILES_MARGIN,
  children,
}) {
  const list = (
    <dl
      className={
        figures
          ? cx('stat-tiles stat-tiles-figures', STAT_TILES_FIGURES)
          : cx('stat-tiles', STAT_TILES, margin)
      }
    >
      {children}
    </dl>
  )
  return label ? (
    <div role="group" aria-label={label}>
      {list}
    </div>
  ) : (
    list
  )
}
