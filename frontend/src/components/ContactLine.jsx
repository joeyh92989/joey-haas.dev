import { profile } from '../content/profile.js'

/**
 * The closing line on Home and About: how to reach Joey, and the resume PDF.
 * Email and LinkedIn come from `profile`; the LinkedIn link renders only when
 * a URL has been supplied.
 *
 * @param {object} props
 * @param {string} [props.downloadName] Filename the PDF saves under (About
 *   passes one). Omitted, the link opens the PDF in place (Home).
 */
export default function ContactLine({ downloadName }) {
  return (
    <p className="prose">
      Reach me at <a href={`mailto:${profile.email}`}>{profile.email}</a>
      {profile.linkedin && (
        <>
          {' '}
          or on <a href={profile.linkedin}>LinkedIn</a>
        </>
      )}
      . The full resume is a{' '}
      <a href="/resume.pdf" download={downloadName} aria-label="Resume (PDF)">
        PDF
      </a>
      .
    </p>
  )
}
