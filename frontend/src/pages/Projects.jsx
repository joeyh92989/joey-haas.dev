import { Link } from 'react-router'
import { usePageTitle } from '../lib/usePageTitle.js'
import CoverStrip from '../components/CoverStrip.jsx'
import { projects } from '../content/projects.js'

/**
 * Projects list. Reads static content — deliberately makes no API call, so
 * the page renders instantly regardless of backend state.
 *
 * A project with `to` lives on this site and is linked with a router Link, so
 * it navigates without a full page load; `url` links away.
 * `strip: 'favourites'` adds the collection's cover strip, read from the build-time
 * snapshot, not the API. `tagline`, `highlights` and `links` render only when set.
 */
export default function Projects() {
  usePageTitle('Projects · Joey Haas')
  return (
    <section>
      <h1>Projects</h1>
      <div className="project-grid">
        {projects.map((project) => (
          <article key={project.name} className="project-card">
            <h2>
              {project.to ? (
                <Link to={project.to}>{project.name}</Link>
              ) : project.url ? (
                <a href={project.url}>{project.name}</a>
              ) : (
                project.name
              )}
            </h2>
            {project.tagline && (
              <p className="project-tagline">{project.tagline}</p>
            )}
            {project.strip === 'favourites' && <CoverStrip />}
            <p>{project.description}</p>
            {project.highlights && (
              <ul className="project-highlights">
                {project.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            )}
            {project.links && (
              <p className="project-links">
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
            <ul className="tech-list">
              {project.tech.map((tech) => (
                <li key={tech}>{tech}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
