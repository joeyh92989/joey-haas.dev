---
status: done
kind: chore
mode: auto (Joey's keep / redo / delete marks, 13 Nov 2026)
---

# Data clean-up of the 11–12 Nov rows and comic backfill

Shelf sweep queue, item 6. These are data changes only: every write went through the app's own routes from Joey's signed-in session (5c's mark route and the item PATCH), so `comics.sync_marks` kept the ranges and marks in step. No SQL was written by hand.

## Joey's marks (13 Nov 2026)

| Row | Decision | Written |
|---|---|---|
| The Legend of Zelda: Ocarina of Time | keep | nothing. IGDB 405460 is the 2026 Switch 2 release, so the match is right. |
| Tomb Raider: Definitive Edition | keep | nothing. IGDB has no separate record for the Switch 2 (Limited Run) version; 19965 is the game, and the platform is recorded as Nintendo Switch 2. |
| The Thing: Remastered | keep | nothing |
| Waterworld: Children of Leviathan | keep | already held #1–4 |
| Star Wars Tales | keep | #5 owned |
| Creepshow (2022, 2023, 2024, 2025) | keep all four | a Trade edition "Vol. 1" to "Vol. 4" covering #1–5 on each row; shelf format trades. Joey does not have Vol. 5. |
| Jurassic Park: Raptor | keep | #1 owned |
| Jurassic Park: Raptors Attack | keep | #1 owned |
| Mad Max: Fury Road | keep | #1 owned. Comic Vine lists the TPB as the volume's only issue. Shelf format trades. |
| Haunt of Horror | keep | #1 owned. A one-book volume on Comic Vine. Shelf format trades. |
| Hello Darkness | keep | #1 owned. Comic Vine's #1 is "Volume One". Shelf format trades. |
| Grimm Fairy Tales: 2026 Swimsuit Special | keep | #1 owned |

Nothing was deleted or re-linked, and no test rows remained.

## Check

After the writes, a read on Neon showed `issues_owned` and the owned marks agreeing on every comic row.

## Findings

- **Two wrong-match flags were wrong.** Both "2026" games are real 2026 Switch 2 releases. A year that's later than the original game's isn't evidence of a bad match for ports, so I logged no matching issue.
- **Comic Vine models some collected editions as one-book volumes** (Mad Max TPB, Haunt of Horror, Hello Darkness "Volume One"). In those cases "own #1" means owning the book. Others, like Creepshow, have a volume of singles and the trade is an edition on it. Both shapes work with 5a's intake.
