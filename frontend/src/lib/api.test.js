import { describe, expect, it } from 'vitest'
import { errorMessage } from './api.js'

const answer = (status, body) => ({
  status,
  ok: false,
  json: async () => {
    if (body === undefined) throw new Error('not json')
    return body
  },
})

describe('errorMessage', () => {
  it('words a 409 as the catalogue lock by default', async () => {
    expect(await errorMessage(answer(409, { detail: 'whatever' }))).toBe(
      'A refresh is already running',
    )
  })

  it("passes a 409's own detail when the caller owns its conflicts", async () => {
    // Intake's 409s say what happened in intake's words (spec: never the
    // catalogue-lock wording).
    const detail = 'This sitting has already been added or discarded.'
    expect(
      await errorMessage(answer(409, { detail }), { ownConflicts: true }),
    ).toBe(detail)
  })

  it('reads the detail, then the status', async () => {
    expect(await errorMessage(answer(422, { detail: 'Bad range' }))).toBe(
      'Bad range',
    )
    expect(await errorMessage(answer(500))).toBe('The server answered 500')
  })
})
