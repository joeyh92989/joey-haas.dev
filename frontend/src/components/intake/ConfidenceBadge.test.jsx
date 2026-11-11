import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ConfidenceBadge from './ConfidenceBadge.jsx'

describe('ConfidenceBadge', () => {
  it.each([
    ['exact', 'Exact'],
    ['probable', 'Probable'],
    ['check', 'Check'],
    ['owned', 'On shelf'],
  ])('says %s as a word, never colour alone', (state, word) => {
    const { container } = render(<ConfidenceBadge state={state} />)
    expect(screen.getByText(word)).toHaveClass('conf', `conf-${state}`)
    expect(container.textContent).toBe(word)
  })

  it('draws nothing for a state with no confidence', () => {
    const { container } = render(<ConfidenceBadge state="typed" />)
    expect(container).toBeEmptyDOMElement()
  })
})
