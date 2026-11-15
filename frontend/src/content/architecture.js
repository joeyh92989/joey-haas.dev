/**
 * The Colophon's architecture diagram: its words, in one place. Every line
 * restates something the README, CLAUDE.md or the "How My Shelf works" post
 * already says. The numbers match the badges drawn on the edges.
 */
export const architecture = {
  label:
    'Architecture. A nightly GitHub Actions job wakes the API and redeploys the static site when the data has changed. The API reads and writes Postgres on Neon. The static site holds a build-time snapshot of the API’s public output, and shelf pages read the API after painting it.',
  caption:
    'The five parts and how they connect. The numbers on the drawing match the list.',
  steps: [
    'The nightly job wakes the API and refreshes comics and the physical release catalog.',
    'It then compares the API’s public output with the snapshot already deployed, and redeploys the static site only when something changed.',
    'The API reads and writes Postgres on Neon.',
    'Shelf and stats pages paint the snapshot first, then read the API once it is awake.',
    'The static site’s build fetches the API’s public output and writes it into the snapshot.',
  ],
}
