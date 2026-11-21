import TagList from './TagList.jsx'
import { formatDate } from '../lib/formatDate.js'

/**
 * The date, reading time and tag chips under a post's or a note's title.
 *
 * @param {object} props
 * @param {string} props.date A 'YYYY-MM-DD' date.
 * @param {string} [props.updated] A 'YYYY-MM-DD' revision date, shown only
 *   when it differs from `date`.
 * @param {number} [props.readingMinutes] Minutes to read; none shows nothing.
 * @param {string[]} props.tags The frontmatter tags; none renders no list.
 */
export default function PostMeta({ date, updated, readingMinutes, tags }) {
  return (
    <div className="post-meta mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-muted-foreground">
      <time dateTime={date}>{formatDate(date)}</time>
      {updated && updated !== date && (
        <span>
          Updated <time dateTime={updated}>{formatDate(updated)}</time>
        </span>
      )}
      {readingMinutes > 0 && <span>{readingMinutes} min read</span>}
      {tags.length > 0 && <TagList items={tags} className="tech-list" />}
    </div>
  )
}
