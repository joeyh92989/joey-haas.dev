import { useEffect, useRef, useState } from 'react'
import { isbnIntake as words } from '../../content/isbnIntake.js'
import { toIsbn13 } from '../../lib/isbn.js'
import Sheet from '../Sheet.jsx'
import { ibtn } from '../addClasses.js'
import {
  ISBN_SCANNER,
  ISBN_SCANNER_STATUS,
  ISBN_SCANNER_VIDEO,
} from '../intakeFormClasses.js'

function ScannerBody({ onClose, onScan }) {
  const video = useRef(null)
  const latest = useRef({ onClose, onScan })
  useEffect(() => {
    latest.current = { onClose, onScan }
  })
  const [state, setState] = useState('starting')
  const [ignored, setIgnored] = useState(false)

  useEffect(() => {
    let live = true
    let cancelled = false
    let reader = null
    ;(async () => {
      try {
        const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } =
          await import('@zxing/library')
        if (!live) return
        const hints = new Map([
          [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
        ])
        reader = new BrowserMultiFormatReader(hints, 300)
        await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          video.current,
          (result) => {
            if (!live || !result) return
            const isbn = toIsbn13(result.getText())
            if (!isbn) {
              setIgnored(true)
              return
            }
            live = false
            reader.reset()
            latest.current.onClose()
            latest.current.onScan(isbn)
          },
        )
        // The sheet closed while the camera was starting: the stream attached
        // after the cleanup's reset, so stop it here or the camera stays on.
        if (cancelled) {
          reader.reset()
          return
        }
        if (live) setState('scanning')
      } catch (error) {
        if (!live) return
        const denied =
          error?.name === 'NotAllowedError' ||
          error?.name === 'NotFoundError' ||
          error?.name === 'NotReadableError' ||
          error?.name === 'OverconstrainedError' ||
          error?.name === 'SecurityError'
        setState(denied ? 'denied' : 'failed')
      }
    })()
    return () => {
      live = false
      cancelled = true
      try {
        reader?.reset()
      } catch {
        // Already stopped.
      }
    }
  }, [])

  return (
    <div className={`isbn-scanner ${ISBN_SCANNER}`}>
      <h2>{words.scannerTitle}</h2>
      <p className="muted">{words.scannerHelp}</p>
      {(state === 'starting' || state === 'scanning') && (
        <video
          ref={video}
          className={`isbn-scanner-video ${ISBN_SCANNER_VIDEO}`}
          muted
          playsInline
          aria-label={words.scannerTitle}
        />
      )}
      <p className={`isbn-scanner-status ${ISBN_SCANNER_STATUS}`} role="status">
        {state === 'starting' && words.scannerStarting}
        {state === 'denied' && words.scannerDenied}
        {state === 'failed' && words.scannerFailed}
        {state === 'scanning' && ignored && words.scannerNotIsbn}
      </p>
      <button
        type="button"
        className={ibtn('plain')}
        data-autofocus
        onClick={onClose}
      >
        {words.scannerClose}
      </button>
    </div>
  )
}

/**
 * A sheet that reads a book's barcode with the camera and hands the ISBN-13
 * to `onScan`. The decoder (`@zxing/library`, Apache-2.0) is loaded with
 * `import()` only when the sheet opens, so it is not in the main bundle:
 * iOS Safari has no native `BarcodeDetector`, so a library is needed, and it
 * is big. A barcode that is not an ISBN is ignored and the camera keeps
 * looking. A blocked or missing camera is said in words; typing the ISBN
 * always works, so this is never the only way.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(isbn: string) => void} props.onScan The ISBN-13 read; the sheet
 *   closes itself first.
 */
export default function BarcodeScanner({ open, onClose, onScan }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      ariaLabel={words.scannerTitle}
      initialFocus="[data-autofocus]"
    >
      <ScannerBody onClose={onClose} onScan={onScan} />
    </Sheet>
  )
}
