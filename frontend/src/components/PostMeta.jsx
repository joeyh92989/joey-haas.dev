import { formatDate } from '../lib/formatDate.js'

/**
 * The date and tag chips under a post's or a note's title.
 *
 * @param {object} props
 * @param {string} props.date A 'YYYY-MM-DD' date.
 * @param {string[]} props.tags The frontmatter tags; none renders no list.
 */
export default function PostMeta({ date, tags }) {
  return (
    <div className="post-meta">
      <time dateTime={date}>{formatDate(date)}</time>
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
