import { useEffect, useState } from 'react'

// In production, set VITE_API_URL in Render to the API service URL.
// In local dev this is empty and Vite proxies /api to localhost:8000.
const API_URL = import.meta.env.VITE_API_URL || ''

export default function App() {
  const [projects, setProjects] = useState([])
  const [apiStatus, setApiStatus] = useState('loading')

  useEffect(() => {
    fetch(`${API_URL}/api/projects`)
      .then((res) => res.json())
      .then((data) => {
        setProjects(data)
        setApiStatus('ok')
      })
      .catch(() => setApiStatus('error'))
  }, [])

  return (
    <main>
      <header className="hero">
        <h1>Joey Haas</h1>
        <p className="tagline">Software developer — Denver, CO</p>
        <nav>
          <a href="#about">About</a>
          <a href="#projects">Projects</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <section id="about">
        <h2>About</h2>
        <p>
          Short bio goes here. A couple of sentences about your background,
          what you work on, and what you're interested in.
        </p>
      </section>

      <section id="projects">
        <h2>Projects</h2>
        {apiStatus === 'loading' && <p className="muted">Loading projects…</p>}
        {apiStatus === 'error' && (
          <p className="muted">
            Couldn't reach the API. (On Render's free tier the backend sleeps
            when idle — give it ~30 seconds and refresh.)
          </p>
        )}
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
                {project.tech.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="contact">
        <h2>Contact</h2>
        <p>
          <a href="mailto:josephthaas@gmail.com">josephthaas@gmail.com</a>
          {' · '}
          <a href="https://github.com/YOUR_GITHUB_USERNAME">GitHub</a>
        </p>
      </section>

      <footer>
        <p className="muted">Built with React + FastAPI, hosted on Render.</p>
      </footer>
    </main>
  )
}
