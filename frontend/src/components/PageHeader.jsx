import Breadcrumb from './Breadcrumb.jsx'
import Kicker from './Kicker.jsx'

/**
 * The top of a page: the breadcrumb (detail pages), an optional kicker, the
 * page's sans h1 and an optional lede. A shelf list page sits it under
 * `SpineHeader`'s area band, with no trail.
 *
 * @param {object} props
 * @param {{label: string, to?: string}[]} [props.trail] - The breadcrumb;
 *   a list page passes none and has no breadcrumb row.
 * @param {import('react').ReactNode} props.title - The h1's content.
 * @param {import('react').ReactNode} [props.kicker] - A line above the h1.
 * @param {import('react').ReactNode} [props.lede] - A line below the h1.
 * @param {string} [props.ledeClassName] - Class for the lede paragraph.
 * @param {string} [props.className] - Class for the header element.
 */
export default function PageHeader({
  trail,
  title,
  kicker,
  lede,
  ledeClassName = 'lede',
  className,
}) {
  return (
    <header className={className ? `page-header ${className}` : 'page-header'}>
      {trail?.length > 0 && <Breadcrumb trail={trail} />}
      {kicker && <Kicker>{kicker}</Kicker>}
      <h1>{title}</h1>
      {lede && <p className={ledeClassName}>{lede}</p>}
    </header>
  )
}
