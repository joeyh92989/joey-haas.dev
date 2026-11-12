import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import PostMeta from '../components/PostMeta.jsx'
import { findPost } from '../content/posts.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import NotFound from './NotFound.jsx'

/** A post with more h2s than this gets a contents list. */
const MAX_HEADINGS_WITHOUT_CONTENTS = 4

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
  const { hash, key } = useLocation()

  // Null when missing, so NotFound's own title stands (see usePageTitle).
  usePageTitle(post ? `${post.frontmatter.title} · Joey Haas` : null)

  // A link to `#id` (the contents list, or one shared) lands on that heading
  // and moves focus there, rather than leaving it on the link just pressed.
  // The router holds back the browser's own jump, so this does the scroll.
  useEffect(() => {
    if (!post || !hash) return
    let id
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      return
    }
    const target = document.getElementById(id)
    if (!target) return
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    target.scrollIntoView?.({ block: 'start' })
    target.focus({ preventScroll: true })
  }, [post, hash, key])

  if (!post) return <NotFound />

  // Only a long post earns a contents list; a short one is quicker to scroll.
  const headings = post.headings ?? []

  return (
    <section>
      <p>
        <Link to="/blog">← All posts</Link>
      </p>
      <h1>{post.frontmatter.title}</h1>
      {post.frontmatter.summary && (
        <p className="post-summary">{post.frontmatter.summary}</p>
      )}
      {post.frontmatter.draft && <span className="draft-badge">Draft</span>}
      <PostMeta date={post.frontmatter.date} tags={post.frontmatter.tags} />

      {headings.length > MAX_HEADINGS_WITHOUT_CONTENTS && (
        <nav className="post-toc" aria-labelledby="post-toc-label">
          <p className="post-toc-label" id="post-toc-label">
            On this page
          </p>
          <ol>
            {headings.map((heading) => (
              <li key={heading.id}>
                <Link to={{ hash: heading.id }}>{heading.text}</Link>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div
        className="post-body"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
    </section>
  )
}
