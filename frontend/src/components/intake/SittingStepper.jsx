/** Each step's name, as the stepper and the step's heading say it. */
export const STEP_LABELS = {
  shoot: 'Shoot',
  check: 'Check',
  details: 'Details',
  done: 'Done',
}

/**
 * Where a sitting is: an ordered list of its steps, the current one marked
 * `aria-current="step"`, those before it done. It is a map, not a menu:
 * each step's own buttons move on, and the page moves focus to the new
 * step's heading.
 *
 * @param {object} props
 * @param {string[]} props.steps The sitting's steps in order (a kind with
 *   no Details step has three).
 * @param {string} props.current
 */
export default function SittingStepper({ steps, current }) {
  const at = steps.indexOf(current)
  return (
    <ol className="intake-steps" aria-label="Steps">
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={index === at ? 'step' : undefined}
          className={index < at ? 'done' : undefined}
        >
          {`${index + 1} · ${STEP_LABELS[step]}`}
        </li>
      ))}
    </ol>
  )
}
