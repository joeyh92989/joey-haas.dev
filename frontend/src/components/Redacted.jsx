import { spine } from '../content/spine.js'

/**
 * A striped bar where a capture withholds a store's detail. Its width follows
 * the length of the drawn text, which is never rendered; assistive tech reads
 * "store withheld" instead of a blank.
 */
export default function Redacted({ text = '' }) {
  return (
    <span
      className="tour-redacted"
      style={{ '--chars': Math.max(text.length, 6) }}
    >
      <span className="visually-hidden">{spine.how.redacted}</span>
    </span>
  )
}
