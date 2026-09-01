import { Link } from 'react-router'
import { formatDate, posts } from '../content/posts.js'

/**
 * Blog index. Posts newest first.
 *
 * The empty state is the normal case at launch: the blog ships with nothing
 * published, and post #1 arrives whenever it is written.
 */
export default function Blog() {
  return (
    <section>
      <h2>Blog</h2>
      {posts.length === 0 ? (
        <p className="muted">No posts yet.</p>
      ) : (
        <ul className="post-list">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link to={`/blog/${post.slug}`}>{post.frontmatter.title}</Link>
              {post.frontmatter.draft && (
                <span className="draft-badge">Draft</span>
              )}
              <div className="post-meta">
                <time dateTime={post.frontmatter.date}>
                  {formatDate(post.frontmatter.date)}
                </time>
                {post.frontmatter.tags.length > 0 && (
                  <ul className="tech-list">
                    {post.frontmatter.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
