import joeyPhoto from '../assets/joey.jpg'
import Kicker from '../components/Kicker.jsx'
import { certifications, education } from '../content/education.js'
import { experience } from '../content/experience.js'
import { profile } from '../content/profile.js'
import { usePageTitle } from '../lib/usePageTitle.js'

/**
 * About page: an aside with the photo, the serif title and the facts at a
 * glance, sticky beside the body on a desktop; then the summary, the work
 * timeline with education under it, the areas of expertise and the toolbox.
 *
 * Bio prose lives in content/profile.js and is split on blank lines so
 * multi-paragraph text renders as separate paragraphs; the timeline reads from
 * content/experience.js, and education reads from content/education.js.
 */
export default function About() {
  usePageTitle('About · Joey Haas')
  const paragraphs = profile.bio.split('\n\n').filter(Boolean)

  return (
    <div className="about">
      <aside className="about-aside">
        <img className="about-photo" src={joeyPhoto} alt="" />
        <h1 className="about-title">About</h1>
        <Kicker>{profile.location}</Kicker>
        <dl className="about-facts">
          {profile.aboutFacts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
          <div>
            <dt>Resume</dt>
            <dd>
              <a
                href="/resume.pdf"
                download="Joey Haas Resume.pdf"
                aria-label="Resume (PDF)"
              >
                PDF <span aria-hidden="true">↓</span>
              </a>
            </dd>
          </div>
        </dl>
      </aside>

      <div className="about-body">
        <section aria-labelledby="about-summary">
          <h2 className="about-label" id="about-summary">
            Summary
          </h2>
          {/* Keyed by position, not text: two identical paragraphs would collide. */}
          {paragraphs.map((paragraph, index) => (
            <p className="prose" key={index}>
              {paragraph}
            </p>
          ))}
        </section>

        <section aria-labelledby="about-experience">
          <h2 className="about-label" id="about-experience">
            Experience
          </h2>
          <ol className="timeline" role="list">
            {experience.map((entry) => (
              <li
                className={
                  entry.current ? 'timeline-entry current' : 'timeline-entry'
                }
                key={`${entry.company}-${entry.role}`}
              >
                <h3 className="timeline-role">
                  <span>{entry.role}</span> ·{' '}
                  <span className="timeline-company">{entry.company}</span>
                </h3>
                <Kicker className="timeline-meta">{entry.meta}</Kicker>
                <p className="timeline-summary">{entry.summary}</p>
              </li>
            ))}
          </ol>
          <p className="prose">
            <a href="/resume.pdf" download="Joey Haas Resume.pdf">
              Download the full resume (PDF)
            </a>
          </p>
        </section>

        <section aria-labelledby="about-education">
          <h2 className="about-label" id="about-education">
            Education
          </h2>
          <ol className="timeline" role="list">
            {education.map((entry) => (
              <li className="timeline-entry" key={entry.credential}>
                <h3 className="timeline-role">
                  <span>{entry.credential}</span> ·{' '}
                  <span className="timeline-company">{entry.school}</span>
                </h3>
                <Kicker className="timeline-meta">{entry.meta}</Kicker>
              </li>
            ))}
          </ol>
          {/* list-style: none strips list semantics from Safari/VoiceOver,
              so the item count goes unannounced without an explicit role. */}
          <ul className="chip-list" aria-label="Certifications" role="list">
            {certifications.map((certification) => (
              <li key={certification}>{certification}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-expertise">
          <h2 className="about-label" id="about-expertise">
            Areas of expertise
          </h2>
          <ul className="expertise-list" role="list">
            {profile.expertise.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-toolbox">
          <h2 className="about-label" id="about-toolbox">
            Toolbox
          </h2>
          <ul className="chip-list" role="list">
            {profile.toolbox.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
