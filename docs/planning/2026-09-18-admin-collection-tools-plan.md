# Admin Collection Tools — Implementation Plan

Spec: `docs/planning/2026-09-18-admin-collection-tools-design.md`

**Goal:** Make the imported collection manageable — publish items to the public
showcase, correct bad matches including re-linking them to the right external
record, and show cover art while doing it.

**Branch:** `admin-collection-tools` (worktree at
`~/Developer/joey-haas.dev-worktrees/admin-collection-tools`)

## Global constraints

- Python 3.12 via `backend/.venv`; `import httpx2`, never `httpx`.
- Style with CSS variables from `index.css` only — never a raw hex value.
- `/{item_id}` in `items.py` is typed `uuid.UUID` and has swallowed two routes
  already. Any new literal path goes **before** it.
- `config.py`'s `_REQUIRED` tuple must not grow. Nothing here needs config.
- No schema change. Every field used already exists on `Item`.
- Run repo-native format + lint after every file change:
  `./.venv/bin/ruff format . && ./.venv/bin/ruff check .`, `npm run format && npm run lint`.
- Commits: conventional, ≤5 files, independently valid.

---

## Task 1 — Bulk visibility route

**Files**
- Modify: `backend/items.py`
- Create: `backend/tests/test_items_visibility.py`

**Interfaces produced**
- `VisibilityIn(is_public: bool, ids: list[uuid.UUID] | None = None)`
- `VisibilityOut(updated: int)`
- `POST /api/items/visibility` → `VisibilityOut`

**Acceptance criteria**
- [ ] `ids: null` updates every item; an explicit list updates only those.
- [ ] Declared **before** `@router.get("/{item_id}")`, with a test asserting
      the path is not answered 422 by the UUID route.
- [ ] Admin-gated by the existing router dependency: 401, never 422.
- [ ] Returns the number of rows actually changed.
- [ ] An empty `ids` list updates nothing and returns `0` — distinct from
      `null`, which means everything. A caller that sends `[]` meaning "all"
      would otherwise publish the collection by accident.
- [ ] Unknown ids are ignored rather than erroring; the count reflects reality.

**Steps**
1. Write `tests/test_items_visibility.py` covering: all, subset, empty list,
   unknown id, 401 unauthenticated, route not shadowed.
2. Run it — expect failure (404, route absent).
3. Add the models and route to `items.py`, using
   `update(Item).where(...).values(is_public=...)` and `result.rowcount`.
4. Run tests to green.
5. Format, lint, full backend suite.
6. **Commit:** `feat(tracker): add bulk visibility route`

---

## Task 2 — Cover art and publish toggle in the collection table

**Files**
- Modify: `frontend/src/pages/AdminCollection.jsx`
- Create: `frontend/src/pages/AdminCollection.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces consumed**
- `PATCH /api/items/{id}` with `{is_public}` — already accepts it
- `POST /api/items/visibility` from Task 1
- `CoverImage` from `components/CoverImage.jsx`

**Acceptance criteria**
- [ ] A cover thumbnail column, using `CoverImage` so per-type aspect ratio and
      the `onerror` placeholder come for free.
- [ ] A per-row publish checkbox that PATCHes `{is_public}`, following the
      shape of `updateStatus`.
- [ ] "Publish all" and "Hide all" controls calling the bulk route, then
      reloading the list.
- [ ] Bulk controls state how many items they will affect, so publishing a
      collection is a deliberate act rather than a single unlabelled click.
- [ ] A failed toggle reports the failure and leaves the checkbox showing the
      server's state, not the optimistic one. Silently showing "public" for a
      row that did not save is worse than showing an error.
- [ ] That page has no tests today; this creates them.

**Steps**
1. Write `AdminCollection.test.jsx`: toggle sends `is_public`, bulk sends the
   right body, list reloads after each, a failed PATCH surfaces an error and
   does not flip the checkbox.
2. Run — expect failure.
3. Add the column, the checkbox and the bulk controls.
4. Style with existing tokens. The wrapper already scrolls; keep the thumbnail
   column narrow so the table stays usable at 375px.
5. Tests, `npm run build`, format, lint.
6. **Commit:** `feat(tracker): add cover art and publish controls to the collection table`

---

## Task 3 — Item detail view

**Files**
- Create: `frontend/src/pages/AdminItem.jsx`
- Create: `frontend/src/pages/AdminItem.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css`

**Interfaces produced**
- Route `admin/collection/:id`

**Acceptance criteria**
- [ ] Loads one item by id; 404 renders a clear "not found" rather than a
      blank form.
- [ ] Every field editable: type, title, year, status, rating, owned_format,
      favorite, times_completed, started_at, finished_at, notes, is_public.
- [ ] Save PATCHes only fields that actually changed, so a save never
      overwrites a field the form did not manage.
- [ ] Cover art displayed at a readable size, with the external link shown
      (source and id) so it is obvious what the row is linked to.
- [ ] Delete, with confirmation, returning to the list.
- [ ] Rows in the collection table link here.
- [ ] Cold-start state reuses the existing `slow` pattern.

**Steps**
1. Write `AdminItem.test.jsx`: renders fields from a loaded item, saves only
   changed fields, 404 path, delete confirms before calling DELETE.
2. Run — expect failure.
3. Build the page; add the route to `App.jsx`; link rows from the table.
4. Style with tokens.
5. Tests, build, format, lint.
6. **Commit:** `feat(tracker): add an item detail view for editing`

---

## Task 4 — Re-link an item to a different source record

**Files**
- Modify: `frontend/src/pages/AdminItem.jsx`
- Modify: `frontend/src/pages/AdminItem.test.jsx`

**Interfaces consumed**
- `MetadataPicker`, `PATCH /api/items/{id}`, `POST /api/items/{id}/refresh-metadata`

**Acceptance criteria**
- [ ] `MetadataPicker` embedded, scoped to the item's type.
- [ ] Choosing a candidate PATCHes `{external_source, external_id}` then POSTs
      `refresh-metadata`, so cover, creator and snapshot are re-fetched
      server-side. The browser never assembles metadata it cannot verify.
- [ ] The refreshed cover and creator are visible without a manual reload —
      confirming the fix worked is the entire point of the flow.
- [ ] A failed refresh leaves the item linked and reports it. The link is
      correct even when enrichment is temporarily unavailable, and the
      existing refresh route can be retried.
- [ ] The title is not overwritten by a re-link, matching the refresh route's
      existing behaviour — a hand-corrected title must survive.

**Steps**
1. Extend `AdminItem.test.jsx`: picking a candidate sends both requests in
   order; a failed refresh keeps the link and shows an error; the title is
   untouched.
2. Run — expect failure.
3. Add the picker and the re-link handler.
4. Tests, build, format, lint.
5. **Commit:** `feat(tracker): allow re-linking an item to a different source record`

---

## Task 5 — Smoke checks and docs

**Files**
- Modify: `scripts/smoke.sh`
- Modify: `CLAUDE.md`

**Acceptance criteria**
- [ ] `POST /api/items/visibility` unauthenticated returns **401, not 404** —
      proving the route exists and is gated rather than silently absent.
- [ ] `/admin/collection/<uuid>` returns 200 from the static host, proving the
      SPA rewrite serves the nested route on deep link. This is the check that
      would catch a routing regression invisible in local dev, where Vite
      handles unknown paths differently from a CDN.
- [ ] `bash -n scripts/smoke.sh` passes.
- [ ] `CLAUDE.md` notes that items import private and are published from the
      admin collection page — the gap that caused this work.
- [ ] **Commit:** `docs(tracker): cover the new admin routes in smoke and docs`

---

## Task 6 — Import one photo per request, and bound the model chain

**Files**
- Modify: `frontend/src/pages/AdminImport.jsx`
- Modify: `frontend/src/pages/AdminImport.test.jsx`
- Modify: `backend/llm.py`
- Modify: `backend/tests/test_llm.py`

**Why this shape.** A three-photo import took roughly 7-8 minutes as one
blocking request. Measured: IGDB resolution accounts for ~25s of that
(0.34s x 75 detections), so extraction was ~425s. Nothing external was
limiting it -- Render documents a 100 minute ceiling for HTTP responses, and
no body-size cap is documented. So this is not a timeout to dodge; it is a
user staring at a spinner for eight minutes with no feedback.

Per-photo requests help whichever of the remaining causes is true. If the
model was retrying, a smaller payload trips overload less often and a failure
costs one photo rather than the batch. If a single call was simply slow on
three large images, three smaller calls are faster and visibly progressing.
The fix does not depend on knowing which, which is why it is safe to build
before the logs arrive.

It also moves decisively clear of Gemini's documented 20MB inline request cap.
Three phone photos at 9-15MB raw encode to 12-20MB -- at or near the ceiling.
One photo is never close.

**Acceptance criteria**
- [ ] The browser posts one photo per request and concatenates the detections.
- [ ] Progress is visible and specific: "Reading photo 2 of 3", not a spinner.
- [ ] One photo failing does not lose the others. Its error is reported
      against that photo and the rest still reach the grid, matching how a
      dead source already marks only its own detections unresolved.
- [ ] Detection indices stay unique across photos, so the grid's React keys
      and the importer's ordering do not collide.
- [ ] `llm.py` gains an overall deadline across the whole model chain. Today
      12 attempts at a 120s timeout could legitimately run 24 minutes and
      nothing says stop.
- [ ] Exceeding the budget raises `LLMError` naming the elapsed time, rather
      than continuing to the next model.
- [ ] The budget is checked between attempts, not mid-request: cancelling a
      request in flight would waste work already paid for.
- [ ] No server-side change to `importer.py`. It already accepts a list of
      photos and handles one perfectly well; the batching decision belongs to
      the caller.

**Steps**
1. Extend `test_llm.py`: the chain stops once the budget is spent, the error
   names the elapsed time, and a fast success is unaffected.
2. Run -- expect failure.
3. Add `TOTAL_BUDGET_SECONDS` to `llm.py` and check it between attempts.
4. Extend `AdminImport.test.jsx`: three files produce three requests,
   detections concatenate, indices stay unique, one failing photo still
   yields the others.
5. Run -- expect failure.
6. Rework `upload` in `AdminImport.jsx` to loop per photo with progress state.
7. Tests, build, format, lint.
8. **Commit:** `perf(tracker): import one photo per request and bound the model chain`

---

## Automated environment tests

`scripts/smoke.sh` exists and is the util. It runs unauthenticated, so it
proves these routes exist and are gated, not that they work — everything here
is admin-only. Functional coverage is pytest and vitest.

**Passing means:** full backend suite green, full frontend suite green,
`npm run build` clean, `ruff format --check` and `ruff check` clean, and
`./scripts/smoke.sh` green after deploy with no new errors in the Render logs.

**Manual pass before the finish gate** — the part automation cannot reach:
open the collection, confirm thumbnails render, publish all, confirm
`/collection` now shows items, then open a wrongly-matched row, re-link it
through the picker, and confirm cover and creator change to the correct
release.

## Zones

```
Zone 1 (auto): tasks 1–6
CHECKPOINT — batch review + finish gate
```

One zone. None of the mandatory carve-outs apply: no DB migration, no IaC or
CI change, no env files, nothing destructive, and nothing in the deploy path
beyond ordinary application code. `smoke.sh` is a test script, not
infrastructure.
