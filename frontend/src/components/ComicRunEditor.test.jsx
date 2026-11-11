import { describe, expect, it } from 'vitest'
import { applyTap, formRun } from './ComicRunEditor.jsx'

const FORM = {
  issues_owned: '1-3',
  issues_skipped: '5',
  editions: [{ kind: 'Trade', label: 'Vol. 1', from: '7', to: '9' }],
  read_to: '2',
}
const issue = (n, extra = {}) => ({ n, held: false, edition: null, ...extra })

describe('applyTap', () => {
  it('owns an issue and drops its skip', () => {
    expect(applyTap(FORM, issue(5), 'own')).toMatchObject({
      issues_owned: '1-3, 5',
      issues_skipped: '',
    })
  })

  it('unowns a single, but never an edition’s issue', () => {
    expect(applyTap(FORM, issue(2, { held: true }), 'own').issues_owned).toBe(
      '1, 3',
    )
    expect(
      applyTap(FORM, issue(8, { held: true, edition: {} }), 'own'),
    ).toBeNull()
  })

  it('moves the read marker, and back one on the current issue', () => {
    expect(applyTap(FORM, issue(3), 'read').read_to).toBe('3')
    expect(applyTap(FORM, issue(2), 'read').read_to).toBe('1')
    expect(applyTap({ ...FORM, read_to: '1' }, issue(1), 'read').read_to).toBe(
      '',
    )
  })

  it('skips a missing issue, unskips it, and refuses a held one', () => {
    expect(applyTap(FORM, issue(4), 'skip').issues_skipped).toBe('4-5')
    expect(applyTap(FORM, issue(5), 'skip').issues_skipped).toBe('')
    expect(applyTap(FORM, issue(1, { held: true }), 'skip')).toBeNull()
  })
})

describe('formRun', () => {
  it('reads the form, skipping an edition row it cannot read', () => {
    const model = formRun(
      {
        ...FORM,
        editions: [
          ...FORM.editions,
          { kind: '', label: 'x', from: '', to: '' },
        ],
      },
      { released: 10, ongoing: false, nextIssue: null },
    )
    expect(model.held).toBe(3)
    expect(model.skipped).toBe(1)
  })

  it('reads every clean edition row', () => {
    const model = formRun(FORM, { released: 10, ongoing: false })
    expect(model.held).toBe(6)
    expect(model.readTo).toBe(2)
  })
})
