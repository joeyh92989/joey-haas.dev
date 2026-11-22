import { useEffect, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import { daily } from '../content/daily.js'
import {
  SHARE_BODY,
  SHARE_FOOT,
  SHARE_GRID,
  SHARE_SHEET,
  SHARE_STATUS,
  SHARE_TEXT,
  SHARE_WORDS,
  SHARE_WORDS_LEAD,
} from './dailyClasses.js'

const copy = daily.share
const TITLE_ID = 'share-sheet-title'

/**
 * The sheet's contents, mounted fresh each time it opens (Sheet mounts its
 * children only while open), so a blocked clipboard is forgotten on close.
 */
function ShareBody({ text, words, onClose, onStatus }) {
  const [blocked, setBlocked] = useState(false)
  const [copied, setCopied] = useState(false)
  const textRef = useRef(null)

  // Copy, which held focus, is gone once copying fails: hand focus to the
  // text to copy by hand, whose focus selects it.
  useEffect(() => {
    if (blocked) textRef.current?.focus()
  }, [blocked])

  async function copyText() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onStatus(copy.copied)
    } catch {
      setBlocked(true)
    }
  }

  return (
    <div className={`share-sheet-body ${SHARE_BODY}`}>
      <h2 id={TITLE_ID}>{copy.title}</h2>
      {blocked ? (
        <>
          <p className="share-blocked muted">{copy.blocked}</p>
          <textarea
            ref={textRef}
            className={`share-text ${SHARE_TEXT}`}
            readOnly
            rows={words.length + 2}
            value={text}
            onFocus={(event) => event.target.select()}
          />
        </>
      ) : (
        <pre className={`share-grid ${SHARE_GRID}`} aria-hidden="true">
          {text}
        </pre>
      )}
      <p className={`share-words-lead muted ${SHARE_WORDS_LEAD}`}>
        {copy.words}
      </p>
      <ul className={`share-words muted ${SHARE_WORDS}`}>
        {words.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {/* The modal makes the page's status line inert, so the sheet says
          "Copied" itself. */}
      <p className={`share-status muted ${SHARE_STATUS}`} role="status">
        {copied ? copy.copied : ''}
      </p>
      <div className={`share-sheet-foot ${SHARE_FOOT}`}>
        <button type="button" className="btn ghost" onClick={onClose}>
          {copy.close}
        </button>
        {!blocked && (
          <button
            type="button"
            className="btn primary"
            data-autofocus
            onClick={copyText}
          >
            {copy.copy}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The share sheet: the emoji board as the clipboard will get it, the same
 * result as words, and Copy. The clipboard API is tried first; where it is
 * missing or refused, the text sits in a read-only textarea to select and
 * copy by hand. "Copied" shows in the sheet's own status line, since the
 * modal makes the page inert, and is passed to `onStatus` for after.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.text The exact share text (lib/daily.js shareText).
 * @param {string[]} props.words One line per guess (shareWords).
 * @param {(message: string) => void} props.onStatus Announces a message.
 */
export default function ShareSheet({ open, onClose, text, words, onStatus }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      labelledBy={TITLE_ID}
      className={`share-sheet ${SHARE_SHEET}`}
    >
      <ShareBody
        text={text}
        words={words}
        onClose={onClose}
        onStatus={onStatus}
      />
    </Sheet>
  )
}
