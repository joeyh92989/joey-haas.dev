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
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  )
}
