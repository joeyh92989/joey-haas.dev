/**
 * The small mono, upper-case label that sits above a heading or names a
 * group ("Selected work", "Elsewhere"). Presentation only: the casing comes
 * from CSS, so a screen reader reads the words as written.
 *
 * @param {object} props
 * @param {string} [props.as] The element to render; a paragraph by default.
 * @param {string} [props.className] Extra classes.
 * @param {import('react').ReactNode} props.children The label.
 */
export default function Kicker({ as: Tag = 'p', className, children }) {
  return (
    <Tag className={className ? `kicker ${className}` : 'kicker'}>
      {children}
    </Tag>
  )
}
