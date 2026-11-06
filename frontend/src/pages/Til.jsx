import { Link } from 'react-router'
import PostMeta from '../components/PostMeta.jsx'
import { notes } from '../content/notes.js'
import { usePageTitle } from '../lib/usePageTitle.js'

/**
 * TIL: every note, newest first, rendered in full. A note is a paragraph or
 * three, so the index is the reading page; each title links to the note's
 * own page, which is what a feed item or a shared link opens.
 *
 * note.html was compiled at build time and is injected unsanitized, for the
 * reason BlogPost gives: the markdown is the site owner's own files.
 */
export default function Til() {
  usePageTitle('TIL · Joey Haas')
  return (
    <section>
      <h1>TIL</h1>
      <p className="prose">
        Short notes on things I learned while building this site and the things
        on it. Longer pieces are on the <Link to="/blog">blog</Link>.
      </p>
      {notes.length === 0 ? (
        <p className="prose muted">No notes yet.</p>
      ) : (
        <div className="note-list">
          {notes.map((note) => (
            <article key={note.slug}>
              <h2>
                <Link to={`/til/${note.slug}`}>{note.frontmatter.title}</Link>
                {note.frontmatter.draft && (
                  <span className="draft-badge">Draft</span>
                )}
              </h2>
              <PostMeta
                date={note.frontmatter.date}
                tags={note.frontmatter.tags}
              />
              <div
                className="post-body"
                dangerouslySetInnerHTML={{ __html: note.html }}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
