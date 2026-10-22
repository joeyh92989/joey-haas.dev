import axe from 'axe-core'

/**
 * axe's violations on a rendered container, as "rule: target" lines so a
 * failing assertion says which element broke which rule.
 *
 * Color contrast is off: jsdom computes no styles, so axe cannot measure
 * it. The tour's colours are measured by hand instead (AC10).
 *
 * @param {Element} container
 * @returns {Promise<string[]>}
 */
export async function axeViolations(container) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  })
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  )
}
