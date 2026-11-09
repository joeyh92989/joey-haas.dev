# Travel onboarding

The working plan for getting trips onto `/travel`: what to collect, from
whom, how it goes in, and which trips are still to do. It is a checklist
to work through and tick off, not reference; the tools it uses are
documented in `frontend/scripts/README.md` → Travel scripts.

## The flow

```mermaid
flowchart LR
  A[Collect originals<br/>into a dump folder] --> B[ingest-photos.mjs<br/>dry run: report]
  B --> C{Trips look right?}
  C -- no: adjust --gap,<br/>split the folder --> B
  C -- yes --> D[ingest-photos.mjs<br/>--write --slug]
  D --> E[Fill the worksheet,<br/>write the draft]
  E --> F[build-travel-images.mjs]
  F --> G[Remove draft: true,<br/>commit, PR]
```

Nothing in this flow leaves the machine. The dump folder is only read; the
originals are copied into `frontend/trips/<slug>/photos/`, which git
ignores, and only the stripped WebPs and the GPS-free manifest are
committed.

## 1 · Collecting photos

### What to ask for (partner, family, friends)

Ask for **originals from the camera roll**, not photos forwarded through a
chat. Messaging apps and shared albums usually resize photos, and several
strip the camera's EXIF, which takes the date and the location with it. A
photo that arrives that way can only be dated from its file time, and
usually not even that. Which apps strip what changes between versions, so
don't take it on trust: the dry run's first line says how many photos the
camera dated, and if that number is low, ask again for originals.

Ways that keep the originals:

- **AirDrop** from Photos, with _Options → All Photos Data_ switched on.
- **A USB stick or external drive**: on a Mac, export from Photos with
  _File → Export → Export Unmodified Original_.
- **A cloud folder of the files themselves** (iCloud Drive, Google Drive,
  Dropbox), rather than a shared album.

A short message that works:

> Could you send me your photos from <trip>, the originals rather than
> through Messages? AirDrop with "All Photos Data" on is easiest. All of
> them is fine, I'll pick. I'll only publish ones you're happy with, and
> none of the kids without asking.

### Batches

One folder per person per batch, named for what is in it:
`~/Desktop/dumps/2026-croatia-joey/`, `~/Desktop/dumps/2014-ireland-partner/`.
Keeping people apart makes the report easy to read: two phones with clocks
an hour apart show up as one trip with overlapping days, not as a mystery.

A batch can be everything someone has from a year. The dry run splits it
into trips by the gaps between dates, so there is no need to sort first.

### Kids

A photo of a child is never published by default. In
`trips/<slug>/photos/photos.json`, mark it `"kid": true`. It stays
unpublishable until it also carries `"publish": true`, which is added only
after asking the parent. The site build refuses a trip that shows an
unopted kid photo, and the image build never writes one.

## 2 · Ingesting

From `frontend/`:

```
node scripts/ingest-photos.mjs --from ~/Desktop/dumps/2014-ireland-partner
```

Read the report:

- **Trips**: each with its dates, photo count and the places it could name.
  If one real trip came back as two, raise `--gap`; if two trips came back
  as one, lower it.
- **Dated from file times on …**: these days rest on a guess. Check them
  against anything else you have: boarding passes, bank statements,
  calendar entries, emails.
- **Undated**: no camera date and a recent file time. These need a person
  to place them, or they stay out.
- **Could not be placed**: no GPS, or nowhere in `scripts/places.json`
  within 40 km. Add the place to the gazetteer if it is missing and run
  again.

Then scaffold the trip:

```
node scripts/ingest-photos.mjs --from <folder> --write --slug ireland-2014 --trip 1
```

That writes `frontend/trips/ireland-2014.md` as a draft and copies the
photos into its gitignored `photos/` folder. It refuses to overwrite a trip
that already exists, or to copy into a `photos/` folder that already holds
anything, since those originals may be the only copies. To start again, move
the old file and folder aside.

Several people's photos of one trip: ingest the best-dated batch with
`--write` first (it wants an empty folder), then copy the others' chosen
photos into the same `photos/` folder by hand and add a manifest row for each (`name`, `file`, `date`,
`confidence`).

## 3 · The per-trip worksheet

Fill this in before writing prose. Copy it into a scratch note per trip;
it does not get committed.

```
Trip:            (title as it should appear)
Slug:            (e.g. ireland-2014)
Dates:           from ____ to ____      precision: day / month / year
How we know:     (camera dates / boarding pass / "it was June")
Who was there:
Places, in order:
  1.
  2.
Each day, one line (what happened, what you remember):
  Day 1:
  Day 2:
Photos that matter (the cover first):
Photos of kids, and whose permission:
Anything private that must not be published:
```

## 4 · Writing the draft

In `trips/<slug>.md`, replace every `TODO`:

- `title`, `summary`, and each day's title and prose.
- Each day's place. A `TODO` place means no photo that day had GPS. Add the
  real place to `places:` (in route order, with its lat/lon) and remove the
  `TODO` place once nothing uses it.
- Pick photos from each day's `<!-- photos from … -->` comment onto image
  lines: `![alt text](2014-06-03-1422 'Optional caption')`. Alt text says
  what is in the photo; the caption is optional.
- Set `cover:` to one photo name.
- Merge days if you like: `## Day 3–4 · Title · Galway`.

`npm run dev` shows a draft at `/travel/<slug>` while you write. A trip
still containing `TODO` cannot be published: the build fails and names the
line.

### When nobody can date it precisely

Say so instead of inventing a day. Set `precision: month` (or `year`) in
the frontmatter. `date` and `end` stay real dates, used for sorting: pick
the 1st of the month, or the best guess. The page then shows _June 2014_
instead of a day, and day sections show _Day 3_ with no date. Write what
you remember in the order you remember it; "Day 3" can mean "the third
thing we did".

Use `day` only when the camera dates (or a document) back it up.

## 5 · Building and publishing

```
node scripts/build-travel-images.mjs ireland-2014
```

It builds only the photos the trip file shows, strips their metadata, and
records their sizes in the manifest. On a published trip it also trims
`photos.json` to the photos the page shows and deletes built sizes the page
no longer uses; a draft keeps the whole roll in its manifest, so you can
still choose. Then remove `draft: true`, run
`npm run build`, and look at the page. A published trip also needs its
rewrite rule in `render.yaml` (the README's Travel section says where).
Commit the trip file, the manifest and `public/travel/<slug>/`, then open a
PR.

**Before committing a draft,** read it as a stranger would: the repo is
public, so a draft is published the moment it is pushed, page or no page.
Its manifest lists every photo's name and time, and its `photos from …`
comments carry times and the places the gazetteer matched. Commit a draft
only when that is fine, or keep it local until it is published. A draft's
built photos never deploy: the build leaves `dist/travel/<slug>/` out for
every trip that is not published.

## Trips to recover

| Trip             | When         | Photos from                | Precision      | Status                                                          |
| ---------------- | ------------ | -------------------------- | -------------- | --------------------------------------------------------------- |
| Croatia & Greece | Sep 2026     | Joey, partner              | day            | Draft written from notes; needs the real photos ingested        |
| Tokyo            | Oct 2026     | Joey, partner              | day            | Not started                                                     |
| Ireland          | 2014 (June?) | partner, Joey's old backup | probably month | Not started: ask partner for originals; check old phone backups |
|                  |              |                            |                |                                                                 |

Status runs: _Not started_ → _Collecting_ → _Ingested_ → _Drafted_ →
_Published_. Add a row whenever a trip comes to mind; an empty row is
cheaper than a forgotten trip.
