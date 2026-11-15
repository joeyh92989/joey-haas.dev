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
    <div className="post-meta">
      <time dateTime={date}>{formatDate(date)}</time>
      {updated && updated !== date && (
        <span>
          Updated <time dateTime={updated}>{formatDate(updated)}</time>
        </span>
      )}
      {readingMinutes > 0 && <span>{readingMinutes} min read</span>}
      {tags.length > 0 && (
        <ul className="tech-list">
          {tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
