import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const decodeFromConstraints = vi.fn()
vi.mock('@zxing/library', () => ({
  BarcodeFormat: { EAN_13: 'EAN_13' },
  DecodeHintType: { POSSIBLE_FORMATS: 'POSSIBLE_FORMATS' },
  BrowserMultiFormatReader: class {
    decodeFromConstraints = decodeFromConstraints
    reset = vi.fn()
  },
}))

import BarcodeScanner from './BarcodeScanner.jsx'

// jsdom has no showModal or modal close (as in Sheet.test.jsx).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

afterEach(() => {
  delete HTMLDialogElement.prototype.showModal
  delete HTMLDialogElement.prototype.close
})

describe('BarcodeScanner', () => {
  it('says so when the camera is blocked', async () => {
    decodeFromConstraints.mockRejectedValueOnce(
      Object.assign(new Error('no'), { name: 'NotAllowedError' }),
    )
    render(<BarcodeScanner open onClose={() => {}} onScan={() => {}} />)
    expect(await screen.findByText(/camera is blocked/)).toBeInTheDocument()
  })

  it('hands over an ISBN and ignores another barcode', async () => {
    const onScan = vi.fn()
    const onClose = vi.fn()
    decodeFromConstraints.mockImplementationOnce(async (_c, _v, callback) => {
      callback({ getText: () => '4006381333931' }) // an EAN that is no ISBN
      callback({ getText: () => '9781607066019' })
    })
    render(<BarcodeScanner open onClose={onClose} onScan={onScan} />)
    await waitFor(() => expect(onScan).toHaveBeenCalledWith('9781607066019'))
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })
})
