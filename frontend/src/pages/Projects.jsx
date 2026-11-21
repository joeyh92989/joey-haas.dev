import { Link } from 'react-router'
import { usePageTitle } from '../lib/usePageTitle.js'
import CoverStrip from '../components/CoverStrip.jsx'
import RecordCard from '../components/RecordCard.jsx'
import TagList from '../components/TagList.jsx'
import {
  PROSE_H1,
  RECORD_TITLE,
  TITLE_LINK,
} from '../components/prose-classes.js'
import { projects } from '../content/projects.js'

/**
 * Projects list. Reads static content — deliberately makes no API call, so
 * the page renders instantly regardless of backend state.
 *
 * A project with `to` lives on this site and is linked with a router Link, so
 * it navigates without a full page load; `url` links away.
 * `strip: 'favourites'` adds the collection's cover strip, read from the build-time
 * snapshot, not the API. `tagline`, `line`, `hero`, `differently`, `highlights` and `links` render
 * only when set. Each project is a numbered record card, as on Home, one per
 * row; the tagline rides the card's strip.
 */
export default function Projects() {
  usePageTitle('Projects · Joey Haas')
  return (
    <section>
      <h1 className={PROSE_H1}>Projects</h1>
      <div className="project-grid mt-6 flex flex-col gap-5">
        {projects.map((project, index) => (
          <RecordCard
            key={project.name}
            number={index + 1}
            label={
              project.tagline && (
                <span className="project-tagline">{project.tagline}</span>
              )
            }
            className="project-card"
          >
            <article className="p-4 pb-5">
              <h2 className={RECORD_TITLE}>
                {project.to ? (
                  <Link to={project.to} className={TITLE_LINK}>
                    {project.name}
                  </Link>
                ) : project.url ? (
                  <a href={project.url} className={TITLE_LINK}>
                    {project.name}
                  </a>
                ) : (
                  project.name
                )}
              </h2>
              {project.hero && (
                <div className="project-hero">
                  {['dark', 'light'].map((theme) => (
                    <img
                      key={theme}
                      className={`project-hero__img project-hero__img--${theme}`}
                      src={`/projects/${project.hero.slug}-${theme}.webp`}
                      alt={project.hero.alt}
                      width={project.hero.width}
                      height={project.hero.height}
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
              )}
              {project.strip === 'favourites' && <CoverStrip />}
              <p className="mt-2 text-sm text-muted-foreground">
                {project.description}
              </p>
              {project.highlights && (
                <ul className="project-highlights mt-3 list-disc pl-5 text-sm text-muted-foreground marker:text-muted-foreground">
                  {project.highlights.map((highlight) => (
                    <li key={highlight} className="mt-1 first:mt-0">
                      {highlight}
                    </li>
                  ))}
                </ul>
              )}
              {project.links && (
                <p className="project-links mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {project.links.map((link) =>
                    link.to ? (
                      <Link key={link.label} to={link.to}>
                        {link.label} <span aria-hidden="true">&rarr;</span>
                      </Link>
                    ) : (
                      <a key={link.label} href={link.href}>
                        {link.label} <span aria-hidden="true">&rarr;</span>
                      </a>
                    ),
                  )}
                </p>
              )}
              {project.line && (
                <p className="project-line mt-4 text-sm text-foreground">
                  {project.line}
                </p>
              )}
              {project.differently && (
                <p className="project-differently mt-2 text-sm text-foreground">
                  <strong>What I’d do differently.</strong>{' '}
                  {project.differently}
                </p>
              )}
              <TagList items={project.tech} className="tech-list mt-4" />
            </article>
          </RecordCard>
        ))}
      </div>
    </section>
  )
}
