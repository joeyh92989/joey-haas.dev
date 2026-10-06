# Site design — a second look now that Spine is most of it (2026-10-05)

Reviewed the live site on 2026-10-05: Home, About, Projects, `/spine`, an
item page, the how-it-works post and `/admin/store-list`, in both themes at
desktop width and at 390px (rendered in a 390px frame, since the automation
window will not shrink). Code at `cf5551d`; tokens in `frontend/src/index.css`.

The question: the palette and voice were chosen for a warm, personal resume
site ("Warm Personal", #10). The site is now a resume site wrapped around a
game-collection tracker with 68 covers on its best page and a shopping page on
the way. Do the colours and the vibe still fit?

## The short version

**The palette holds. The structure has drifted.** Keep the warm dark, the
cream, the terracotta and the sage, Newsreader and Public Sans. What needs
work is the chrome around the tracker — the resume masthead on every tracker
page, three lines of navigation on a phone — and a handful of places where the
tracker's own colour (status marks, the item backdrop) is under-powered. This
is a tune, not a redesign, and most of it fits inside the Next phase's
frontend PR because that PR already rebuilds the Spine header.

## Why the palette still works

- Cover art is the colour. On `/spine` the warm dark `#201a14` reads as a
  wooden shelf and every cover pops against it; the light theme's paper does
  the same with less drama. A cooler or more saturated palette would compete
  with sixty-eight covers rather than hold them. The restraint that felt
  "resume" on Home is what makes the shelf look like a shelf.
- The two accents have jobs: terracotta for ratings, links and the active
  bar; sage for "playing". Nothing else on the tracker pages asks for colour
  and nothing gets it, which is the right instinct for a page full of
  artwork.
- Newsreader for `h1`/`h2` and the hero numbers gives the tracker a
  catalogue-card feel that the admin store list inherits well — "Top picks",
  "Out now on Switch 2" in a serif over a dark card read like a shop's
  chalkboard, which is exactly the page's job.
- Both themes are measured for contrast and the light theme is not an
  afterthought; the stat cards, chips and poster grid all hold up in it.

## Findings, in priority order

1. **The masthead is a resume masthead on every page, and on a phone it is
   the whole first screen.** At 390px the sequence is avatar + name + "Senior
   software engineer · Denver, Colorado" + a nav that wraps "Blog" alone onto
   a second line + the theme toggle alone on a third, roughly 240px of chrome
   before the Spine `h1`. The hero numbers land at the bottom of the first
   screen; on the coming `/spine/next` the first pick will be below the
   fold. On desktop the same masthead sits above the shelf and tells a visitor
   this is a person's résumé, which is true of Home and About and beside the
   point on `/spine`. Suggested shape: one masthead component with two
   densities — the current one on `/`, `/about`, `/projects`, `/blog*`; a
   compact one on `/spine*` and `/admin*` (24px avatar, name as a wordmark,
   no tagline line). On narrow screens the nav becomes one scrollable row
   with the theme toggle at its end, never a third line. `RootLayout` already
   knows the wide routes; this is the same list.

2. **Spine has a name and no mark.** The flagship is presented as one more
   page of Joey's site: same masthead, same `h1` style, nothing that says
   "this is a thing" except the word. It does not need a logo. It needs a
   consistent header treatment on its two pages: the name set in Newsreader
   at the display size, the tagline under it, the tab row (Shelf · What's
   next) as part of the block, and a hairline rule beneath — the same block
   whether the page is the shelf or the list, so the sub-page is recognisably
   the same thing. The Projects card and the Home card then echo that block in
   miniature (name, tagline, cover strip), which they almost do already.

3. **The status colours are three beiges and a sage.** `--status-backlog`
   `#a38f72`, `--status-finished` `#e0cfb2` and `--status-abandoned`
   `#7a7874` sit within a few degrees of hue of each other, so the stacked
   bar reads as "beige, teal sliver, lighter beige, grey stub" and the legend
   has to do the work. It is the one place on the shelf where colour carries
   meaning. Keep the family — earth tones are right for this site — but open
   the lightness gaps: finished stays the cream, backlog drops to a darker
   tan (around L 45 rather than 60), abandoned goes cooler and darker so it
   reads as "set aside", and playing keeps the sage. Each still has to clear
   3:1 against `--surface` and backlog against `--border`, per the note in
   the tokens; re-measure in both themes, as the comment demands.

4. **The item-page backdrop is a smear.** The blurred cover behind the item
   header (`.item-hero-backdrop`, blur 28px, scale 1.25, 60% overlay) renders
   as a muddy grey-brown band in dark and a grey rectangle in light — it adds
   a surface without adding the cover's colour. Two honest options: lean in
   (less overlay, a gradient that fades the band into `--bg` at the bottom so
   it is a wash rather than a box, and a little more height) or drop it and
   let the cover sit on `--surface` the way the favourites row does. The
   second is the safer fit for this site's restraint.

5. **Chip rows look clipped on a phone.** Under 34rem the filter and sort
   rows scroll sideways by design, but "Abandoned 2" is cut mid-word with
   nothing to say the row continues. A right-edge fade (a `mask-image`
   gradient on the row, or a pseudo-element in `--bg`) is enough; scroll
   snapping is optional.

6. **Two small density things.** The Spine header block (h1, lede, project
   line, two links) then the hero numbers is five rows of text before any
   artwork on desktop; once the tab row joins it, the project line and links
   could move to the end of the page beside the attribution, where "I built
   this" reads as a colophon. And the `/admin/store-list` cards are the right
   phone layout for the public `/spine/next`; the public page should keep
   them rather than reach for the poster grid — a list a person reads top to
   bottom in a store wants rows, not tiles.

## What not to change

- The palette tokens, except the three status values in finding 3.
- The type pair. Newsreader + Public Sans is distinctive without being a
  theme, and the admin pages prove it scales to dense UI.
- The prose column on the resume pages and `page-wide` on the tracker; the
  two widths are the right expression of "a site with a tool inside it".
- Dark as the brand default. The shelf is the best page, and it is better
  in the dark.

## How to sequence it

Findings 1, 2 and 5 belong in the Next phase's frontend PR (section C): it is
already rebuilding the Spine header for the tab row and adding a second Spine
page, so the compact masthead and the shared header block land once, with
both pages in hand, and the phone pass in E22 checks all of it. Findings 3
and 4 are a small follow-up — a token change with re-measured contrast, and a
one-file change on the item page — that can be its own tidy PR after Next
ships. Finding 6 is for the design session to take or leave.
