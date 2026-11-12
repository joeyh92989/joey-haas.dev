import { spine } from '../content/spine.js'

const { states: STATES } = spine.comics.wall

/**
 * A state named in words: Read, Owned, Missing, Not out yet or Skipped. The
 * mark in front of it comes from CSS; the word is what carries the state,
 * so colour is never alone.
 *
 * @param {object} props
 * @param {'read'|'owned'|'missing'|'not-out'|'skipped'} props.state
 */
export default function StatePill({ state }) {
  return (
    <span className="state-pill" data-state={state}>
      {STATES[state]}
    </span>
  )
}
