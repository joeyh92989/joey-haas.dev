import { profile } from '../content/profile.js'

/**
 * About page. Bio prose lives in content/profile.js and is split on blank
 * lines so multi-paragraph text renders as separate paragraphs.
 */
export default function About() {
  const paragraphs = profile.bio.split('\n\n').filter(Boolean)

  return (
    <section>
      <h2>About</h2>
      {/* Keyed by position, not text: two identical paragraphs would collide. */}
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </section>
  )
}
