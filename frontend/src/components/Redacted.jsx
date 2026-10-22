import { spine } from '../content/spine.js'

/**
 * A striped bar where a capture withholds a store's name; assistive tech
 * reads "store withheld" instead of a blank.
 */
export default function Redacted() {
  return (
    <span className="tour-redacted">
      <span className="visually-hidden">{spine.how.redacted}</span>
    </span>
  )
}
