import { Link, useParams } from 'react-router'
import { findPost, formatDate } from '../content/posts.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import NotFound from './NotFound.jsx'

/**
 * A single post.
 *
 * post.html was compiled at build time by vite-plugin-markdown. It is injected
 * without sanitizing: posts are files authored by the site owner in a private
 * repository, so there is no untrusted input path, and a sanitizer strict
 * enough to matter would strip the inline styles Shiki emits. See the blog
 * spec, Key Decision 6.
 */
export default function BlogPost() {
  const { slug } = useParams()
  const post = findPost(slug)

  // Null when missing, so NotFound's own title stands (see usePageTitle).
  usePageTitle(post ? `${post.frontmatter.title} · Joey Haas` : null)

  if (!post) return <NotFound />

  return (
    <section>
      <h1>{post.frontmatter.title}</h1>
      {post.frontmatter.draft && <span className="draft-badge">Draft</span>}
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

      <div
        className="post-body"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />

      <p>
        <Link to="/blog">← All posts</Link>
      </p>
    </section>
  )
}
