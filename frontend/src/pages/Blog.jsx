import { Link } from 'react-router'
import Kicker from '../components/Kicker.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'
import { formatDate, posts } from '../content/posts.js'

/**
 * Blog index. Posts newest first, as dated rows: the date in mono, then the
 * title and the post's `summary` when it has one.
 *
 * The empty state is the normal case at launch: the blog ships with nothing
 * published, and post #1 arrives whenever it is written.
 */
export default function Blog() {
  usePageTitle('Blog · Joey Haas')
  return (
    <section>
      <h1>Writing</h1>
      {posts.length === 0 ? (
        <p className="prose muted">No posts yet.</p>
      ) : (
        <ul className="row-list post-rows" role="list">
          {posts.map((post) => (
            <li key={post.slug}>
              <Kicker as="span">
                <time dateTime={post.frontmatter.date}>
                  {formatDate(post.frontmatter.date)}
                </time>
              </Kicker>
              <div>
                <h2>
                  <Link to={`/blog/${post.slug}`}>
                    {post.frontmatter.title}
                  </Link>
                  {post.frontmatter.draft && (
                    <span className="draft-badge">Draft</span>
                  )}
                </h2>
                {post.frontmatter.summary && <p>{post.frontmatter.summary}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
