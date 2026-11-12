/**
 * Known serious/critical axe violations, tracked so the suite can gate on new
 * ones. An entry covers every node of `ruleId` on `route`. `issue` is the
 * backlog issue that tracks the fix. Remove the entry once it is fixed; the
 * stale-entry test fails while an entry no longer matches a violation.
 *
 * @type {{ route: string, ruleId: string, issue: string }[]}
 */
export const KNOWN_A11Y = [
  { route: '/shelf/next/', ruleId: 'link-in-text-block', issue: 'TBD' },
  { route: '/shelf/intake/', ruleId: 'link-in-text-block', issue: 'TBD' },
  { route: '/now/', ruleId: 'link-in-text-block', issue: 'TBD' },
  { route: '/colophon/', ruleId: 'link-in-text-block', issue: 'TBD' },
  { route: '/stats/', ruleId: 'link-in-text-block', issue: 'TBD' },
  { route: '/blog/', ruleId: 'link-in-text-block', issue: 'TBD' },
  { route: '/til/', ruleId: 'link-in-text-block', issue: 'TBD' },
  { route: '/e2e-no-such-page/', ruleId: 'link-in-text-block', issue: 'TBD' },
]
