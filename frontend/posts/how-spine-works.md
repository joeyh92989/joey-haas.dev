---
title: How Spine works
date: 2026-10-02
tags: [spine, engineering]
draft: false
---

Spine is the tracker behind the [shelf on this site](/spine). It knows what I own on cartridge, what I have finished, what I should play next, and what is about to be released that I would want. This post is the engineering behind it: what each part does, which decisions were deliberate, and where the boring parts are deliberately boring.

The whole thing runs on free tiers. A React and Vite frontend is a static site on Render; a FastAPI backend is a free Render web service; Postgres 18 lives on Neon’s free plan. Every push to `main` deploys both, and `main` only takes merges from pull requests whose CI passes.

## Why it exists

I collect physical games, mostly on Nintendo Switch and Switch 2, and I care about a distinction most trackers do not make: whether a box contains the full game on the cartridge, or a Game-Key Card that is really a download token in a case. Nothing I tried tracked that, and none of them could tell me whether a game I was about to buy from a boutique publisher would ever get a real cartridge release.

The other problem was getting the collection in at all. A physical collection has no export. Typing a few hundred titles into a form is the kind of job that gets abandoned at item forty, so the import path had to be a camera.

## Reading the shelf from a photo

The importer takes photographs of a shelf, one request per photo, and sends each to a vision model (Gemini, through a provider interface that also runs on Claude) with a deliberately narrow job: return the titles it can read, and the media type of each, as structured output against a JSON schema. The schema constrains the media type to the exact enum the database column accepts, so the model cannot invent a fifth kind of thing.

What the model is *not* asked for is a match. It has no tool access and no candidate list. Resolution happens on the server, against the same metadata sources everything else uses, which makes the expensive nondeterministic step a pure function of the image and the entire resolution path testable with no model calls at all.

Confidence is measured, never asked for. A vision model will report high confidence on a confidently wrong reading, because it is grading its own work. Instead, each detected title is normalised (case-folded, accent-folded, punctuation stripped, whitespace collapsed) and compared by string distance against what the source returned. Release year, when the model read one, is applied as a filter before ranking rather than as a tiebreaker after it, so two same-titled releases do not cancel each other out. A match is `exact` when the top score clears 0.98 and leads the runner-up by at least 0.15, `probable` above 0.75 with the same margin, and `uncertain` otherwise, which routes it to a human. Nothing is persisted until I commit the batch, and the photographs are never written to disk.

## One contract for every metadata source

Behind the importer sits a small adapter interface: find candidates for a title, then fetch the details of one. IGDB (via Twitch’s OAuth token exchange), TMDB (a bearer token) and Comic Vine (a query-parameter key, and a one-request-a-second throttle of my own, since it documents no limits) all implement it, and the rest of the application never learns which one it is talking to.

A source with no credentials raises `SourceNotConfigured`, which is deliberately not a failure: it means the feature was never enabled on this deploy, so the right response is to disable that media type, not to retry or alert. BoardGameGeek is the one adapter currently reporting itself unavailable, because its XML API stopped serving anonymous requests and now needs a registered application.

Each resolved item keeps a snapshot of what its source said (genres, themes, keywords, time to beat, similar games, platform list). That snapshot is what every later feature reasons over, so Play Next and Discover never make a live metadata call; Radar’s only live call asks IGDB what is coming.

## The physical catalogue

To know what exists on cartridge, Spine keeps its own catalogue. It reads a community-maintained registry of Switch 2 physical editions through the Google Sheets API, a second community tracker as a cross-check, twelve boutique stores’ public product JSON (Shopify and WooCommerce, read under their robots.txt rules), and IGDB’s N64 list for the older shelf. Each listing is resolved to an IGDB game, then collapsed to one honest format per game and platform, then synced onto the Switch 2 copies I own.

The collapse rule is the part I would defend in a review. A registry row and a store listing usually describe different editions of the same game: a retail Game-Key Card beside a Limited Run or Super Rare full cartridge. So the best edition in my home region wins. Any full cartridge there makes the game a cartridge; the sources’ trust tiers only break ties between rows that say the same thing. A cartridge in another region is a note on the item, never a relabel. And the registry may write a format only through one function that refuses to overwrite a value I set by hand, read from a cartridge ID, or confirmed from a photo.

As of this writing the catalogue holds about 1,300 registry editions and 1,950 store listings, resolved to roughly 680 games. Listing details and prices stay private; they are there for my own buying decisions, and republishing a boutique store’s listings is a different act from reading them.

## Play Next

Play Next answers the only question that matters at nine in the evening: of the thirty games in the backlog, which one tonight? It is a pure module. Items and past pick events arrive as dataclasses and scored picks leave the same way, so every rule is tested on fixtures.

It starts by building a taste profile from my own games. Each finished, favourited, abandoned or rated game is a reference with a weight (a favourite counts 1.0, a finish 0.3, an abandonment −0.5), adjusted by how far my rating sits from my average. Each attribute the references carry (genre, theme, keyword, game mode, perspective, developer) gets the mean weight of the games carrying it. A backlog game then scores on six terms:

```python
# Each term scores 0-100; the total is their weighted mean.
PICKER_WEIGHTS = {
    "affinity": 35,    # its attributes against the taste profile
    "similarity": 20,  # IGDB lists it beside something I loved
    "quality": 15,     # community score
    "length_fit": 15,  # time to beat against the evening I said I had
    "waiting": 10,     # how long it has sat unplayed
    "jitter": 5,       # so the same three do not come up every night
}
```

Three picks come back in named slots (Best fit, Short and sweet, Overdue classic, Waited longest, or Pick it back up for a game I started and put down) with reasons that cite the actual evidence: “Shares Stealth and Horror with BioShock: The Collection, which I rated 10.” Games shown recently take a staleness penalty so the list moves. Pinning one puts it at the top of the public What’s next page as “Up next.”

## Radar and Discover

Radar is the catalogue pointed forward: upcoming physical releases and open pre-orders on my platforms, plus IGDB’s upcoming games that have no physical edition yet, ranked by the same taste profile. Marking one as *Want* creates an ordinary public item, which What’s next lists as wanted.

Discover is the one feature that lets a language model choose, and the contract around it is the point. The server takes the catalogue’s released games I do not own, drops anything ineligible, pre-scores them against the taste profile (affinity 0.45, similarity 0.35, quality 0.20, then a popularity term, a small bonus for being buyable right now and a penalty for an unknown format), and shortlists twenty in a seeded shuffle. The model sees one prompt describing my taste and those twenty candidates, and answers with *indices* into that list plus a short reason for each. It cannot introduce a title, because a pick is only an index into that list. The answer is validated against the schema and the index range, and if the model fails, times out, or exhausts the free-tier quota across the fallback chain of models, the deterministic top eight stand in and the status line says so.

## What the public sees, and what it does not

Only one router serves data without a session. Items are private when created and reach the public shelf only when published. The public shape of an item is a fixed field list; a test pins exactly which keys each public endpoint may return, so a new column cannot leak by default.

The only public page built from stored suggestions is [What’s next](/spine/next), and it is deliberately a read-only view. Its “Tonight” block is the most recent day’s Play Next output, restricted to public items, and it changes at most once a day at UTC midnight, so nobody polling `/api/public/next` can watch me use the tool in real time. Below it sit the games I want, then what to look for in a store: Buy now, Pre-orders, Later, and a short list of games that are digital only or ship with a Game-Key Card. Discover’s top picks appear there, with a “Top pick” badge, and so do Radar’s upcoming cartridges, and each row carries public facts only: title, platform, format, a date when the registry gives one, cover art, an IGDB link, reasons and the badges, with no store, no price and no private game. A suggestion’s release date is shown only when the physical registry has one; a store’s date, or IGDB’s first date on any platform, counts as no date at all. The reasons are written in the first person and name only games that are public. They are rebuilt from public rows rather than copied from what the admin pages store, because those lines hold store names and prices. Discover’s model-written sentence is published only if it cites at least one game, every game it cites is public, it names no game I have kept private, and it is in the first person, neither talking to the reader nor about me in the third person. Anything else falls back to a line rebuilt from my public shelf.

One function sorts the suggestions into those sections, and the signed-in store list I use on my phone runs the same function, so the two pages cannot disagree about whether a game is out. The only difference is the rule about dates: the private page may use any date, the public one only the registry’s.

Here is an illustrative response, with one row each in Buy now and Pre-orders and the other sections left empty. The shape is the real one; the games and dates are examples:

```json
{
  "generated_at": {
    "picks": "2026-10-04",
    "catalogue": "2026-10-05",
    "radar": "2026-10-05",
    "discover": "2026-10-04"
  },
  "tonight": { "up_next": null, "picks": [] },
  "wanted": [],
  "buy_now": [
    {
      "title": "Tunic",
      "platform": "Nintendo Switch",
      "physical_format": "game_card",
      "release_date": null,
      "release_precision": null,
      "cover_url": "https://images.igdb.com/igdb/image/upload/t_cover_big/co4gk7.jpg",
      "igdb_url": "https://www.igdb.com/games/tunic",
      "reasons": ["Shares Adventure and Puzzle with games on my shelf"],
      "top_pick": true,
      "new": false,
      "item_id": null
    }
  ],
  "preorders": [
    {
      "title": "Hades II",
      "platform": "Nintendo Switch 2",
      "physical_format": "game_card",
      "release_date": "2026-11-12",
      "release_precision": "day",
      "cover_url": "https://images.igdb.com/igdb/image/upload/t_cover_big/co9s1w.jpg",
      "igdb_url": "https://www.igdb.com/games/hades-ii",
      "reasons": ["Shares Roguelike and Action with Hades, which I rated 10"],
      "top_pick": false,
      "new": false,
      "item_id": null
    }
  ],
  "later": [],
  "not_on_cartridge": []
}
```

The ids, scores, ranks, prices, stores and pre-order windows are not in there on purpose. A test walks the whole body and fails if any of those key names appears at any depth, and the ages in `generated_at` are days, not times. The store sections are frozen to the night's batch: when I answer a game (dismiss, skip, want or own it), the public page does not change until the next generation, so nobody can watch me shop either; a test fails if a game I answered in an earlier batch is still listed.

And here is one item from the shelf endpoint, trimmed to the interesting fields:

```json
{
  "title": "Dredge",
  "year": 2023,
  "creator": "Black Salt Games",
  "status": "finished",
  "rating": 10,
  "finished_at": "2024-09-22",
  "platform": "Nintendo Switch",
  "physical_format": "game_card",
  "time_to_beat_hours": 12,
  "genres": ["Role-playing (RPG)", "Simulator", "Adventure"],
  "community_score": 83.2
}
```

## Keeping it boring

The free tier sleeps. Rather than pay to keep the API warm, a nightly GitHub Actions workflow wakes the API, does the refreshing I would otherwise press buttons for (record Play Next’s picks, walk the catalogue, run Radar, and run Discover on Sunday evenings), then fetches the public outputs, compares them with the snapshot already deployed, and triggers a static-site deploy only when something changed. It authenticates with a job token that opens exactly seven routes and nothing else, and a test pins that list. The shelf paints that snapshot instantly and refreshes from the API once it wakes; the “waking the server” state only ever shows when there is no snapshot at all.

Migrations are hand-written Alembic, additive only, and applied by hand before the code that needs them merges. That is only safe if forgetting is loud, so the API refuses to boot when the database is behind the code, and allows (with a warning) a database that is ahead, because for a few minutes after each migration the live code is older than the schema.

CI runs the backend through `ruff`, `pytest` against a real Postgres, and `pip-audit`; the frontend through Prettier, ESLint, Vitest, a production build, and `npm audit`. A smoke script checks production after each deploy, including that no draft content reached the public bundle and that the admin API still answers 401 to anyone without a session, before it checks whether the thing asked for exists. Every feature starts as a design document and a plan in `docs/planning/` before any code, and the repository is public if you would like to read either.

## What is next

A year-in-review page for the shelf, the N64 collection on its own platform, and board games once BoardGameGeek issues API tokens again. Beyond that, the thing most likely to improve Play Next is not code but data: every finish, rating and abandonment sharpens the profile it scores against.
