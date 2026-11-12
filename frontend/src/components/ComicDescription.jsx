import { useState } from 'react'
import { spine } from '../content/spine.js'

const COPY = spine.comics.issue

/**
 * A Comic Vine description on the issue and edition pages: its first
 * paragraph, the rest behind "More". With none, one muted line says so.
 *
 * @param {object} props
 * @param {string[]} props.paragraphs
 */
export default function ComicDescription({ paragraphs }) {
  const [open, setOpen] = useState(false)
  if (!paragraphs.length)
    return <p className="comic-issue-desc muted">{COPY.noDescription}</p>
  const [first, ...rest] = paragraphs
  return (
    <div className="comic-issue-desc">
      <p>{first}</p>
      {rest.length > 0 && (
        <>
          <div id="issue-more" hidden={!open}>
            {rest.map((text, index) => (
              <p key={index}>{text}</p>
            ))}
          </div>
          <button
            type="button"
            className="link-button"
            aria-expanded={open}
            aria-controls="issue-more"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? COPY.less : COPY.more}
          </button>
        </>
      )}
    </div>
  )
}
