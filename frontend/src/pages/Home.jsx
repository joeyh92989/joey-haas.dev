import { Link } from 'react-router'

/** Landing page. Orientation and links onward; no biographical claims. */
export default function Home() {
  return (
    <section>
      <h2>Welcome</h2>
      <p className="muted">
        A small site about my work as a developer. Start with{' '}
        <Link to="/about">about</Link> or <Link to="/projects">projects</Link>.
      </p>
    </section>
  )
}
