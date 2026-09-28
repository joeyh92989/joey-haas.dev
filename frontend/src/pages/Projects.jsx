import { Link } from 'react-router'
import CoverStrip from '../components/CoverStrip.jsx'
import { projects } from '../content/projects.js'

/**
 * Projects list. Reads static content — deliberately makes no API call, so
 * the page renders instantly regardless of backend state.
 *
 * A project with `to` lives on this site and is linked with a router Link, so
 * it navigates without a full page load; `url` links away.
 * `strip: 'favourites'` adds the collection's cover strip, read from the build-time
 * snapshot, not the API; `more` is a secondary internal link, set only once its page exists.
 */
export default function Projects() {
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
            {project.strip === 'favourites' && <CoverStrip />}
            <p>{project.description}</p>
            {project.more && (
              <p className="project-more">
                <Link to={project.more.to}>{project.more.label} &rarr;</Link>
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
