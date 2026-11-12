import { useParams } from 'react-router'
import PageHeader from '../components/PageHeader.jsx'
import PostMeta from '../components/PostMeta.jsx'
import { findNote } from '../content/notes.js'
import { TIL_PAGE } from '../content/pages.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import NotFound from './NotFound.jsx'

/**
 * One note on its own page: the URL a feed item or a shared link opens.
 * Laid out as a blog post is, without a summary, since a note has none.
 */
export default function TilNote() {
  const { slug } = useParams()
  const note = findNote(slug)

  // Null when missing, so NotFound's own title stands (see usePageTitle).
  usePageTitle(note ? `${note.frontmatter.title} · TIL · Joey Haas` : null)

  if (!note) return <NotFound />

  return (
    <section>
      <PageHeader
        trail={[
          { label: TIL_PAGE.title, to: TIL_PAGE.path },
          { label: note.frontmatter.title },
        ]}
        title={note.frontmatter.title}
      />
      {note.frontmatter.draft && <span className="draft-badge">Draft</span>}
      <PostMeta date={note.frontmatter.date} tags={note.frontmatter.tags} />
      <div
        className="post-body"
        dangerouslySetInnerHTML={{ __html: note.html }}
      />
    </section>
  )
}
