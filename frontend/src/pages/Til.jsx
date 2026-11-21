import { Link } from 'react-router'
import DraftBadge from '../components/DraftBadge.jsx'
import PostMeta from '../components/PostMeta.jsx'
import RecordCard from '../components/RecordCard.jsx'
import {
  PROSE_H1,
  RECORD_TITLE,
  TITLE_LINK,
} from '../components/prose-classes.js'
import { notes } from '../content/notes.js'
import { usePageTitle } from '../lib/usePageTitle.js'

/**
 * TIL: every note, newest first, rendered in full. A note is a paragraph or
 * three, so the index is the reading page; each note is a numbered record
 * card, and its title links to the note's own page, which is what a feed item
 * or a shared link opens.
 *
 * note.html was compiled at build time and is injected unsanitized, for the
 * reason BlogPost gives: the markdown is the site owner's own files.
 */
export default function Til() {
  usePageTitle('TIL · Joey Haas')
  return (
    <section>
      <h1 className={PROSE_H1}>TIL</h1>
      <p className="prose">
        Short notes on things I learned while building this site and the things
        on it. Longer pieces are on the <Link to="/blog">blog</Link>.{' '}
        <a href="/til/feed.xml">RSS</a>
      </p>
      {notes.length === 0 ? (
        <p className="prose muted">No notes yet.</p>
      ) : (
        <div className="note-list mt-6 grid gap-5">
          {notes.map((note, index) => (
            <RecordCard
              key={note.slug}
              number={index + 1}
              label={
                <span className="flex items-center gap-2">
                  {note.frontmatter.draft && <DraftBadge />}
                  <span>Note</span>
                </span>
              }
            >
              <article className="p-4 pb-5">
                <h2 className={`note-title ${RECORD_TITLE}`}>
                  <Link to={`/til/${note.slug}`} className={TITLE_LINK}>
                    {note.frontmatter.title}
                  </Link>
                </h2>
                <PostMeta
                  date={note.frontmatter.date}
                  updated={note.frontmatter.updated}
                  readingMinutes={note.frontmatter.readingMinutes}
                  tags={note.frontmatter.tags}
                />
                <div
                  className="post-body"
                  dangerouslySetInnerHTML={{ __html: note.html }}
                />
              </article>
            </RecordCard>
          ))}
        </div>
      )}
    </section>
  )
}
