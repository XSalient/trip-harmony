# Product

What is being built next, and why. Current state lives in
[../PROJECT_STATUS.md](../PROJECT_STATUS.md); shipped work lives in
[../CHANGELOG.md](../CHANGELOG.md).

This directory holds the specification for work that has been agreed but not yet
built. It exists because the repo has no external tracker — an epic that is not
written down here does not exist.

## Files

| File                                       | What it is                                                     |
| ------------------------------------------ | -------------------------------------------------------------- |
| [overhaul-2026-08.md](overhaul-2026-08.md) | The current programme: 8 epics, delivery order, open questions |
| [progress.md](progress.md)                 | The tracker. One row per story. Update it as work lands        |
| [stories/](stories/)                       | One file per epic — the actual specification                   |
| [ai-rules.md](ai-rules.md)                 | Why the per-tool AI rule files are thin pointers               |

## How to pick up work

1. Read [progress.md](progress.md) — it gives the delivery order and what is done.
2. Open the story file for the next epic. It names the files to change and the
   acceptance criteria.
3. Check the epic's **Depends on** line. The order in `progress.md` is not
   advisory: E2 rewrites the permission model that later epics assume exists.
4. Build it. Tick the acceptance criteria in the story file as you go.
5. When the epic is done: set its status in `progress.md` and in the story file,
   add a `../CHANGELOG.md` entry, and update `../PROJECT_STATUS.md`
   (AGENTS.md rule 6).

## Story file shape

Every file in `stories/` follows the same structure, so a reader knows where to
look without reading the whole thing:

```markdown
# E<n> — <Epic title>

- **Covers request items:** <n, n>
- **Status:** Not started | In progress | Done
- **Depends on:** <epic ids, or "nothing">

## Why

Two or three sentences. The problem, not the solution.

## Stories

### E<n>.<m> — As a <role>, I want <x> so that <y>

**Acceptance criteria**

- [ ] Each one independently verifiable by someone who did not write it.

**Touches**

- `path/to/file.ts` — what changes there

**Notes**
Decisions taken, edge cases, and things that will bite.

## Open questions

## Out of scope
```

### Conventions

- **Acceptance criteria are checkboxes and they are literal.** "Watchers cannot
  see who proposed what" is checked when a watcher's API response has been
  inspected, not when the UI hides it.
- **File and line references are load-bearing.** They were established by reading
  the code and are the reason these files are worth more than the original
  feature request. If a reference has drifted, fix it — do not leave it wrong.
- **Terminology follows the product, not the database.** The UI says _admin_,
  _places_ and _accommodations_. The schema still says `organizerId`,
  `destinations` and `accommodations`; where the two differ, the story says so.
