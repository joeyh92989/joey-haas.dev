# Name on About and curly apostrophes

Status: in progress. Kind: copy fix. Mode: auto.

- Refs #285 (name bullet only): About's Summary opens with "I’m Joseph (Joey) Haas." in the voice of `docs/voice.md`. Header, chrome, `profile.js`, Home, search and prerender heads stay "Joey Haas".
- The resume PDF header is Joey's edit; this PR does not touch `frontend/public/resume.pdf`.
- Headline, migration phrasing and coverage bullets of #285 await Joey and are untouched.
- #286 apostrophes: `stats.js` strings (COUNTED lines 1 and 2, FROM_SNAPSHOT) become curly, with the README Analytics text in step because `stats.test` compares them.
- `status.js` and `notes/render-rewrites-need-the-slash.md` held no straight apostrophes in visitor text, so nothing changed there.
- Commentary lines in #286 are not touched.
- Checks: lint, format:check, About/stats/status/notes tests, build.
