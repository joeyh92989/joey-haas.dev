import { spine } from '../content/spine.js'
import { TOUR_REDACTED } from './tourClasses.js'

/**
 * A striped bar where a capture withholds a store's name; assistive tech
 * reads "store withheld" instead of a blank.
 */
export default function Redacted() {
  return (
    <span className={`tour-redacted ${TOUR_REDACTED}`}>
      <span className="visually-hidden">{spine.how.redacted}</span>
    </span>
  )
}
