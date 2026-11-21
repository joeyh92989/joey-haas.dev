import { Link } from 'react-router'
import DraftBadge from '../components/DraftBadge.jsx'
import RecordCard from '../components/RecordCard.jsx'
import {
  PROSE_H1,
  RECORD_TITLE,
  WHOLE_CARD,
  WHOLE_CARD_LINK,
} from '../components/prose-classes.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { notes } from '../content/notes.js'
import { posts } from '../content/posts.js'
import { formatDate } from '../lib/formatDate.js'

/**
 * Blog index. Posts newest first, one numbered record card each: the date on
 * the card's strip, then the title and the post's `summary` when it has one.
 * The title link covers the whole card.
 *
 * The empty state is the normal case at launch: the blog ships with nothing
 * published, and post #1 arrives whenever it is written.
 */
export default function Blog() {
  usePageTitle('Blog · Joey Haas')
  return (
    <section>
      <h1 className={PROSE_H1}>Blog</h1>
      <p className="prose muted">
        <a href="/feed.xml">RSS</a>
      </p>
      {notes.length > 0 && (
        <p className="prose muted">
          Shorter things are in <Link to="/til">TIL</Link>.
        </p>
      )}
      {posts.length === 0 ? (
        <p className="prose muted">No posts yet.</p>
      ) : (
        <ul className="m-0 mt-6 grid list-none gap-5 p-0" role="list">
          {posts.map((post, index) => (
            <li key={post.slug}>
              <RecordCard
                number={index + 1}
                label={
                  <span className="flex items-center gap-2">
                    {post.frontmatter.draft && <DraftBadge />}
                    <time dateTime={post.frontmatter.date}>
                      {formatDate(post.frontmatter.date)}
                    </time>
                  </span>
                }
                className={`h-full ${WHOLE_CARD}`}
              >
                <div className="p-4 pb-5">
                  <h2 className={RECORD_TITLE}>
                    <Link to={`/blog/${post.slug}`} className={WHOLE_CARD_LINK}>
                      {post.frontmatter.title}
                    </Link>
                  </h2>
                  {post.frontmatter.summary && (
                    <p className="text-sm text-muted-foreground">
                      {post.frontmatter.summary}
                    </p>
                  )}
                </div>
              </RecordCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
