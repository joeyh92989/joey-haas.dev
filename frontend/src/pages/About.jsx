import joeyPhoto from '../assets/joey.jpg'
import ContactLine from '../components/ContactLine.jsx'
import Kicker from '../components/Kicker.jsx'
import RecordCard from '../components/RecordCard.jsx'
import TagList from '../components/TagList.jsx'
import { PROSE_H1, SECTION_HEAD } from '../components/prose-classes.js'
import { buttonVariants } from '../components/ui/button-variants.js'
import { awards, certifications, education } from '../content/education.js'
import { experience } from '../content/experience.js'
import { profile } from '../content/profile.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import {
  ABOUT,
  ABOUT_ASIDE,
  ABOUT_PHOTO,
  ABOUT_BODY,
  TIMELINE,
  TIMELINE_COMPANY,
  TIMELINE_EMPLOYER,
  TIMELINE_EMPLOYER_NAME,
  TIMELINE_META,
  TIMELINE_POINTS,
  TIMELINE_ROLE,
  TIMELINE_ROLES,
  TIMELINE_STEP_TITLE,
  TIMELINE_SUMMARY,
  timelineEntry,
  timelineStep,
} from '../components/aboutClasses.js'

/**
 * About page: an aside with the photo, the serif title and the facts in a
 * record card, sticky beside the body on a desktop; then the summary, the work
 * timeline with education under it, the areas of expertise and the toolbox.
 *
 * Bio prose lives in content/profile.js and is split on blank lines so
 * multi-paragraph text renders as separate paragraphs; the timeline reads from
 * content/experience.js, and education reads from content/education.js.
 */
const FACT_ROW =
  'grid grid-cols-[5.75rem_minmax(0,1fr)] gap-3 border-t border-line-card py-3 first:border-t-0'
const FACT_TERM = 'font-mono text-xs leading-6 text-muted-foreground'

export default function About() {
  usePageTitle('About · Joey Haas')
  const paragraphs = profile.bio.split('\n\n').filter(Boolean)

  return (
    <div className={`about ${ABOUT}`}>
      <aside className={`about-aside ${ABOUT_ASIDE}`}>
        <img
          className={`about-photo ${ABOUT_PHOTO}`}
          src={joeyPhoto}
          alt=""
          width="96"
          height="96"
          decoding="async"
        />
        <h1 className={`mb-2 ${PROSE_H1}`}>About</h1>
        <Kicker className="mb-4">{profile.location}</Kicker>
        <RecordCard label="At a glance">
          <dl className="about-facts px-4 py-1">
            {profile.aboutFacts.map((fact) => (
              <div key={fact.label} className={FACT_ROW}>
                <dt className={FACT_TERM}>{fact.label}</dt>
                <dd className="text-sm font-semibold">{fact.value}</dd>
              </div>
            ))}
            <div className={FACT_ROW}>
              <dt className={FACT_TERM}>Resume</dt>
              <dd className="text-sm font-semibold">
                <a
                  href="/resume.pdf"
                  download="Joey Haas Resume.pdf"
                  aria-label="Resume PDF"
                >
                  PDF <span aria-hidden="true">↓</span>
                </a>
              </dd>
            </div>
          </dl>
        </RecordCard>
      </aside>

      <div className={`about-body ${ABOUT_BODY}`}>
        <section aria-labelledby="about-summary">
          <h2 className={SECTION_HEAD} id="about-summary">
            Summary
          </h2>
          <p className="prose">I’m Joseph (Joey) Haas.</p>
          {/* Keyed by position, not text: two identical paragraphs would collide. */}
          {paragraphs.map((paragraph, index) => (
            <p className="prose" key={index}>
              {paragraph}
            </p>
          ))}
        </section>

        <section aria-labelledby="about-experience">
          <h2 className={SECTION_HEAD} id="about-experience">
            Experience
          </h2>
          <ol className={`timeline ${TIMELINE}`} role="list">
            {experience.map((entry) =>
              entry.roles ? (
                <li
                  className={`timeline-entry timeline-employer ${TIMELINE_EMPLOYER}`}
                  key={entry.company}
                >
                  <h3
                    className={`timeline-role timeline-employer-name ${TIMELINE_EMPLOYER_NAME}`}
                  >
                    {entry.company}
                  </h3>
                  <Kicker className={`timeline-meta ${TIMELINE_META}`}>
                    {entry.meta}
                  </Kicker>
                  <p className={`timeline-summary ${TIMELINE_SUMMARY}`}>
                    {entry.blurb}
                  </p>
                  <ol
                    className={`timeline-roles ${TIMELINE_ROLES}`}
                    role="list"
                  >
                    {entry.roles.map((role) => (
                      <li
                        className={
                          role.current
                            ? `timeline-step current ${timelineStep(true)}`
                            : `timeline-step ${timelineStep(false)}`
                        }
                        key={role.title}
                      >
                        <h4
                          className={`timeline-step-title ${TIMELINE_STEP_TITLE}`}
                        >
                          {role.title}
                        </h4>
                        <Kicker>{role.dates}</Kicker>
                        <ul className={`timeline-points ${TIMELINE_POINTS}`}>
                          {role.bullets.map((bullet, index) => (
                            <li key={index}>{bullet}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </li>
              ) : (
                <li
                  className={
                    entry.current
                      ? `timeline-entry current ${timelineEntry(true)}`
                      : `timeline-entry ${timelineEntry(false)}`
                  }
                  key={`${entry.company}-${entry.role}`}
                >
                  <h3 className={`timeline-role ${TIMELINE_ROLE}`}>
                    <span className={`timeline-company ${TIMELINE_COMPANY}`}>
                      {entry.company}
                    </span>{' '}
                    — <span>{entry.role}</span>
                  </h3>
                  <Kicker className={`timeline-meta ${TIMELINE_META}`}>
                    {entry.meta}
                  </Kicker>
                  <ul className={`timeline-points ${TIMELINE_POINTS}`}>
                    {entry.bullets.map((bullet, index) => (
                      <li key={index}>{bullet}</li>
                    ))}
                  </ul>
                </li>
              ),
            )}
          </ol>
          <p className="mt-2">
            <a
              href="/resume.pdf"
              download="Joey Haas Resume.pdf"
              className={buttonVariants({ variant: 'outline' })}
            >
              Download the full resume (PDF)
            </a>
          </p>
        </section>

        <section aria-labelledby="about-education">
          <h2 className={SECTION_HEAD} id="about-education">
            Education
          </h2>
          <ol className={`timeline ${TIMELINE}`} role="list">
            {education.map((entry) => (
              <li
                className={`timeline-entry ${timelineEntry(false)}`}
                key={entry.credential}
              >
                <h3 className={`timeline-role ${TIMELINE_ROLE}`}>
                  <span>{entry.credential}</span> ·{' '}
                  <span className={`timeline-company ${TIMELINE_COMPANY}`}>
                    {entry.school}
                  </span>
                </h3>
                <Kicker className={`timeline-meta ${TIMELINE_META}`}>
                  {entry.meta}
                </Kicker>
              </li>
            ))}
          </ol>
          {/* list-style: none strips list semantics from Safari/VoiceOver,
              so TagList gives its list an explicit role. */}
          <TagList
            items={certifications}
            aria-label="Certifications"
            className="mt-4"
          />
          <TagList items={awards} aria-label="Awards" className="mt-2" />
        </section>

        <section aria-labelledby="about-expertise">
          <h2 className={SECTION_HEAD} id="about-expertise">
            Areas of expertise
          </h2>
          <ul
            className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))] gap-x-5 gap-y-2 p-0"
            role="list"
          >
            {profile.expertise.map((area) => (
              <li
                key={area}
                className="border-l-2 border-line-card pl-3 text-sm text-muted-foreground"
              >
                {area}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-toolbox">
          <h2 className={SECTION_HEAD} id="about-toolbox">
            Toolbox
          </h2>
          <TagList items={profile.toolbox} />
        </section>

        <ContactLine downloadName="Joey Haas Resume.pdf" />
      </div>
    </div>
  )
}
