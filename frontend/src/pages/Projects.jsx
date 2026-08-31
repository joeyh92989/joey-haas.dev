import { projects } from '../content/projects.js'

/**
 * Projects list. Reads static content — deliberately makes no API call, so
 * the page renders instantly regardless of backend state.
 */
export default function Projects() {
  return (
    <section>
      <h2>Projects</h2>
      <div className="project-grid">
        {projects.map((project) => (
          <article key={project.name} className="project-card">
            <h3>
              {project.url ? (
                <a href={project.url}>{project.name}</a>
              ) : (
                project.name
              )}
            </h3>
            <p>{project.description}</p>
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
