import { Link, useParams } from 'react-router'
import PostMeta from '../components/PostMeta.jsx'
import { findPost } from '../content/posts.js'
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
      {post.frontmatter.summary && (
        <p className="post-summary">{post.frontmatter.summary}</p>
      )}
      {post.frontmatter.draft && <span className="draft-badge">Draft</span>}
      <PostMeta date={post.frontmatter.date} tags={post.frontmatter.tags} />

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
