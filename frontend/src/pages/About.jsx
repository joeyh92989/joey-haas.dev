import { certifications, education } from '../content/education.js'
import { experience } from '../content/experience.js'
import { profile } from '../content/profile.js'

/**
 * About page: bio prose, the work-history timeline, education, and the toolbox chips.
 *
 * Bio prose lives in content/profile.js and is split on blank lines so
 * multi-paragraph text renders as separate paragraphs; the timeline reads from
 * content/experience.js, and education reads from content/education.js.
 */
export default function About() {
  const paragraphs = profile.bio.split('\n\n').filter(Boolean)

  return (
    <>
      <section>
        <h1>About</h1>
        {/* Keyed by position, not text: two identical paragraphs would collide. */}
        {paragraphs.map((paragraph, index) => (
          <p className="prose" key={index}>
            {paragraph}
          </p>
        ))}
      </section>

      <section>
        <h2>Experience</h2>
        <p className="prose">
          <a href="/resume.pdf" download="Joey Haas Resume.pdf">
            Download the full resume (PDF)
          </a>
        </p>
        <div className="timeline">
          {experience.map((entry) => (
            <div
              className={
                entry.current ? 'timeline-entry current' : 'timeline-entry'
              }
              key={`${entry.company}-${entry.role}`}
            >
              <div className="timeline-role">{entry.role}</div>
              <div className="timeline-company">{entry.company}</div>
              <div className="timeline-meta">{entry.meta}</div>
              <p className="timeline-summary">{entry.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Education</h2>
        <div className="timeline">
          {education.map((entry) => (
            <div className="timeline-entry" key={entry.credential}>
              <div className="timeline-role">{entry.credential}</div>
              <div className="timeline-company">{entry.school}</div>
              <div className="timeline-meta">{entry.meta}</div>
            </div>
          ))}
        </div>
        <ul className="chip-list">
          {certifications.map((certification) => (
            <li key={certification}>{certification}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Toolbox</h2>
        <ul className="chip-list">
          {profile.toolbox.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ul>
      </section>
    </>
  )
}
