import { useState } from 'react'
import { spine } from '../content/spine.js'
import { buttonVariants } from './ui/button-variants.js'
import { cx } from '../lib/cx.js'
import { DESCRIPTION, SOURCE_LINE } from './detail-classes.js'

const COPY = spine.comics.issue
const COMIC_VINE_HOME = 'https://comicvine.gamespot.com/'

/**
 * A Comic Vine description on the issue and edition pages: its first
 * paragraph, the rest behind "More", and the source line under it ("From
 * Comic Vine"). With none, one muted line says so, and a page with a cover
 * still credits it ("Cover from Comic Vine").
 *
 * @param {object} props
 * @param {string[]} props.paragraphs
 * @param {string} [props.sourceUrl] - The Comic Vine page the line links to.
 * @param {boolean} [props.cover] - The page shows a Comic Vine cover.
 */
export default function ComicDescription({
  paragraphs,
  sourceUrl = COMIC_VINE_HOME,
  cover = false,
}) {
  const [open, setOpen] = useState(false)
  const source = (before) => (
    <p className={cx('desc-source mt-1 mb-0', SOURCE_LINE)}>
      {before}{' '}
      <a href={sourceUrl} rel="noreferrer noopener">
        {COPY.attribution.label}
      </a>
    </p>
  )
  if (!paragraphs.length)
    return (
      <>
        <p className={cx('comic-issue-desc muted italic', DESCRIPTION)}>
          {COPY.noDescription}
        </p>
        {cover && source(COPY.coverFrom)}
      </>
    )
  const [first, ...rest] = paragraphs
  return (
    <>
      <div className={cx('comic-issue-desc', DESCRIPTION)}>
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
              className={buttonVariants({ variant: 'link', size: 'bare' })}
              aria-expanded={open}
              aria-controls="issue-more"
              onClick={() => setOpen((current) => !current)}
            >
              {open ? COPY.less : COPY.more}
            </button>
          </>
        )}
      </div>
      {source(COPY.from)}
    </>
  )
}
