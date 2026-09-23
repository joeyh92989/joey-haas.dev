/**
 * A responsive grid of shelf cards. Presentational only: the page decides
 * what each card is through `renderCard`.
 *
 * The column minimum comes from CSS (`--poster-min`), switched by `data-size`
 * and dropped to 6rem on narrow screens so a phone fits three across.
 *
 * @param {object} props
 * @param {object[]} props.items - Rows to render, already filtered and sorted.
 * @param {'comfortable'|'compact'} props.size - Poster size.
 * @param {(item: object) => import('react').ReactNode} props.renderCard -
 *   Renders one card.
 */
export default function PosterGrid({ items, size, renderCard }) {
  return (
    <ul className="poster-grid" data-size={size}>
      {items.map((item) => (
        <li key={item.id}>{renderCard(item)}</li>
      ))}
    </ul>
  )
}
