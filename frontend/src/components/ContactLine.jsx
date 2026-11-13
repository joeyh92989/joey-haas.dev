import { profile } from '../content/profile.js'

/**
 * The closing line on Home and About: how to reach Joey, and the resume PDF.
 * Email and LinkedIn come from `profile`; pass `downloadName` where the PDF
 * should save under a friendly filename (About does, Home just opens it).
 */
export default function ContactLine({ downloadName }) {
  return (
    <p className="prose">
      Reach me at <a href={`mailto:${profile.email}`}>{profile.email}</a> or on{' '}
      <a href={profile.linkedin}>LinkedIn</a>. The full resume is a{' '}
      <a href="/resume.pdf" download={downloadName}>
        PDF
      </a>
      .
    </p>
  )
}
