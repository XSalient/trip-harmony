# Progress — trip experience overhaul, groups & budget, and planning features

The tracker for [overhaul-2026-08.md](overhaul-2026-08.md) (E1–E8, complete),
[groups-and-budget-2026-08.md](groups-and-budget-2026-08.md) (E9–E12, complete)
and [planning-features-2026-08.md](planning-features-2026-08.md) (E13–E16,
complete). Every story in [stories/](stories/) has a row here.

**Update this file in the same commit as the work.** A tracker nobody updates is
worse than no tracker: it reads as authoritative and is wrong. When you finish a
story, set its status and fill in the commit. When you finish an epic, also update
the `Status:` line at the top of its story file, add a `../CHANGELOG.md` entry, and
update `../PROJECT_STATUS.md` (AGENTS.md rule 6).

Statuses: `Not started` · `In progress` · `Blocked` · `Done`

---

## Delivery order

**Overhaul (done):** E1 → E2 → E4 → E6 → E3 → E5 → E7 → E8

The order is not advisory. E2 builds the permission model that E3, E4, E6 and E7
all check against, and E6 changes what "finalised" means before E5 counts it.
Reasoning in [overhaul-2026-08.md](overhaul-2026-08.md#delivery-order).

**Groups & budget (done):** E9 → E10 → E11 → E12

Also not advisory. E11 votes by the groups E9 creates, E12 charges by them and
divides by the headcount E10 records, and E12 is the only epic that drops a
table. Reasoning in
[groups-and-budget-2026-08.md](groups-and-budget-2026-08.md#delivery-order).

## Epics

| #   | Epic                                                                             | Items         | Status |
| --- | -------------------------------------------------------------------------------- | ------------- | ------ |
| E1  | [Remove Travel DNA](stories/E1-remove-travel-dna.md)                             | 1             | Done   |
| E2  | [Members, roles and the contact book](stories/E2-members-and-roles.md)           | 2, 3          | Done   |
| E3  | [Activity trail and attribution](stories/E3-activity-and-attribution.md)         | 4, 5          | Done   |
| E4  | [AI runs only when asked](stories/E4-ai-runs-on-request-only.md)                 | 6, 7          | Done   |
| E5  | [Trip page restructure](stories/E5-trip-page-restructure.md)                     | 8, 10, 11, 14 | Done   |
| E6  | [Finalising proposals](stories/E6-finalising-proposals.md)                       | 9, 16         | Done   |
| E7  | [Editing and preferences summary](stories/E7-editing-and-preferences-summary.md) | 12, 13        | Done   |
| E8  | [Add-proposal flow](stories/E8-add-proposal-flow.md)                             | 15            | Done   |

### Groups and budget

| #   | Epic                                                                    | Items      | Status |
| --- | ----------------------------------------------------------------------- | ---------- | ------ |
| E9  | [Member groups](stories/E9-member-groups.md)                            | 17, 18     | Done   |
| E10 | [Attendees](stories/E10-attendees.md)                                   | 19, 20     | Done   |
| E11 | [One vote per group](stories/E11-one-vote-per-group.md)                 | 21         | Done   |
| E12 | [Budget as a voting section](stories/E12-budget-as-a-voting-section.md) | 22, 23, 24 | Done   |

### Planning features

Delivery order: **E13 → E14 → E15 → E16.** E15 needs E14's assignment rules and
its reconcile helper; E13 goes first because it carries the migration whose
constraints are worth verifying alone. Reasoning in
[planning-features-2026-08.md](planning-features-2026-08.md#delivery-order).

| #   | Epic                                                                        | Status |
| --- | --------------------------------------------------------------------------- | ------ |
| E13 | [Going with the majority](stories/E13-going-with-the-majority.md)           | Done   |
| E14 | [Groups are self-service](stories/E14-groups-are-self-service.md)           | Done   |
| E15 | [Contact-book groups](stories/E15-contact-book-groups.md)                   | Done   |
| E16 | [Preferences become proposals](stories/E16-preferences-become-proposals.md) | Done   |

## Stories

| ID   | Story                                                   | Status | Commit    | Date       |
| ---- | ------------------------------------------------------- | ------ | --------- | ---------- |
| E1.1 | No personality quiz in the app                          | Done   | `…kzsuz3` | 2026-08-02 |
| E1.2 | API and database carry no Travel DNA                    | Done   | `…kzsuz3` | 2026-08-02 |
| E1.3 | AI still useful once DNA is gone                        | Done   | `…kzsuz3` | 2026-08-02 |
| E2.1 | One helper decides what a member may do                 | Done   | `…kzsuz3` | 2026-08-02 |
| E2.2 | Roles are Admin / Tripmate / Watcher                    | Done   | `…kzsuz3` | 2026-08-02 |
| E2.3 | Watchers see no personal details                        | Done   | `…kzsuz3` | 2026-08-02 |
| E2.4 | Members page                                            | Done   | `…kzsuz3` | 2026-08-02 |
| E2.5 | Invite by email and track acceptance                    | Done   | `…kzsuz3` | 2026-08-02 |
| E2.6 | Contact book                                            | Done   | `…kzsuz3` | 2026-08-02 |
| E3.1 | Every trip action is recorded                           | Done   | `…kzsuz3` | 2026-08-02 |
| E3.2 | Proposal shows who added it and when                    | Done   | `…kzsuz3` | 2026-08-02 |
| E3.3 | Who voted and when                                      | Done   | `…kzsuz3` | 2026-08-02 |
| E3.4 | `x/x voted` on places and accommodations detail screens | Done   | `…kzsuz3` | 2026-08-02 |
| E4.1 | Adding a stay or saving preferences triggers no AI      | Done   | `…kzsuz3` | 2026-08-02 |
| E4.2 | Stale match results are labelled                        | Done   | `…kzsuz3` | 2026-08-02 |
| E4.3 | Admin chooses when match analysis runs                  | Done   | `…kzsuz3` | 2026-08-02 |
| E4.4 | AI Referee cannot be spammed                            | Done   | `…kzsuz3` | 2026-08-02 |
| E5.1 | Summary card at the top                                 | Done   | `…kzsuz3` | 2026-08-02 |
| E5.2 | Trip description, collapsed                             | Done   | `…kzsuz3` | 2026-08-02 |
| E5.3 | Every section collapses                                 | Done   | `…kzsuz3` | 2026-08-02 |
| E5.4 | Section names and order                                 | Done   | `…kzsuz3` | 2026-08-02 |
| E5.5 | Trip page split into components                         | Done   | `…kzsuz3` | 2026-08-02 |
| E6.1 | Multiple locked places and accommodations               | Done   | `…kzsuz3` | 2026-08-02 |
| E6.2 | Lock/unlock from the trip details page                  | Done   | `…kzsuz3` | 2026-08-02 |
| E6.3 | Who finalised something and when                        | Done   | `…kzsuz3` | 2026-08-02 |
| E7.1 | Preferences screen summary                              | Done   | `…kzsuz3` | 2026-08-02 |
| E7.2 | Rename a trip and edit its description                  | Done   | `…kzsuz3` | 2026-08-02 |
| E8.1 | Add navigates to the detail screen with the dialog open | Done   | `…kzsuz3` | 2026-08-02 |
| E8.2 | One add form per proposal type                          | Done   | `…kzsuz3` | 2026-08-02 |

### Groups and budget

| ID    | Story                                             | Status | Commit     | Date       |
| ----- | ------------------------------------------------- | ------ | ---------- | ---------- |
| E9.1  | Group members into families                       | Done   | `…a2fbb51` | 2026-08-22 |
| E9.2  | Per-trip voting unit: per person or per family    | Done   | `…a2fbb51` | 2026-08-22 |
| E10.1 | Record everyone travelling, app or no app         | Done   | `…a2fbb51` | 2026-08-22 |
| E10.2 | Headcount: adults, children, pets                 | Done   | `…a2fbb51` | 2026-08-22 |
| E11.1 | A family casts one vote                           | Done   | `…a2fbb51` | 2026-08-22 |
| E11.2 | Moving between groups leaves the votes correct    | Done   | `…a2fbb51` | 2026-08-22 |
| E11.3 | "x/y voted" counts the things that vote           | Done   | `…a2fbb51` | 2026-08-22 |
| E12.1 | Budget proposals are voted like anything else     | Done   | `…a2fbb51` | 2026-08-22 |
| E12.2 | Amounts have a scope and are compared fairly      | Done   | `…a2fbb51` | 2026-08-22 |
| E12.3 | Caps are personal; the group is told, not the sum | Done   | `…a2fbb51` | 2026-08-22 |
| E12.4 | The expense journal is removed cleanly            | Done   | `…a2fbb51` | 2026-08-22 |

## Open questions

Answer these as they come up; they block the story named beside each.

| #   | Question                                                          | Blocks | Answer                                    |
| --- | ----------------------------------------------------------------- | ------ | ----------------------------------------- |
| Q1  | Do watchers see the AI Referee feed?                              | E2.3   | No — hidden entirely                      |
| Q2  | Do all existing trip members become tripmates on migration?       | E2.2   | Yes — organizer→admin, member→tripmate    |
| Q3  | What does a section header say when several proposals are locked? | E6.1   | "2 finalised"; dates keep "Decided"       |
| Q4  | Is a hard numeric AI quota wanted, on top of the cooldown?        | E4.4   | No — declined at scoping                  |
| Q5  | Where does the activity trail surface in the UI?                  | E3.1   | Nowhere as a feed; quiet side info only   |
| Q6  | Do sections default to collapsed or expanded on first visit?      | E5.3   | Summary open; everything else closed      |
| Q7  | Is one vote per family always on, or a setting?                   | E9.2   | A per-trip setting; per member by default |
| Q8  | Does the expense journal survive beside budget voting?            | E12.1  | No — proposals only; the journal goes     |
| Q9  | What unit is a budget amount in?                                  | E12.2  | Per-proposal scope, normalised to compare |
| Q10 | How are children and pets recorded?                               | E10.1  | Attendees on a group; no age for a pet    |
| Q11 | Does "go with the majority" follow the winning side?              | E13.1  | No — an abstention, shown separately      |
| Q12 | What happens when everybody abstains?                             | E13.2  | Finalising is refused, server-side        |
| Q13 | How far do group permissions open up?                             | E14.1  | Create, join, leave, and your own group   |
| Q14 | Drag-and-drop for moving members?                                 | E14.2  | No — chips; mobile-first, keyboard-safe   |
| Q15 | Does a preference become a proposal automatically?                | E16.1  | No — detected, then confirmed with a tap  |
| Q16 | Are places detected from preference text?                         | E16.2  | No — budgets and dates only, for now      |

### Planning features

| ID    | Story                                             | Status | Commit     | Date       |
| ----- | ------------------------------------------------- | ------ | ---------- | ---------- |
| E13.1 | A vote for having no preference                   | Done   | `…a728978` | 2026-08-24 |
| E13.2 | An all-abstained proposal cannot be finalised     | Done   | `…a728978` | 2026-08-24 |
| E13.3 | One home for what a vote is worth                 | Done   | `…a728978` | 2026-08-24 |
| E14.1 | A tripmate can put their own family together      | Done   | `…c4271cc` | 2026-08-24 |
| E14.2 | Chips to join, leave and move, on a phone         | Done   | `…c4271cc` | 2026-08-24 |
| E14.3 | Every mover reconciles the votes it disturbed     | Done   | `…c4271cc` | 2026-08-24 |
| E15.1 | Save a family from a trip, appending if it exists | Done   | `…87ac663` | 2026-08-24 |
| E15.2 | Import it, after saying what it disturbs          | Done   | `…87ac663` | 2026-08-24 |
| E15.3 | An invite carries the family it came from         | Done   | `…87ac663` | 2026-08-24 |
| E16.1 | What I wrote, offered back as a proposal          | Done   | `…0da0f00` | 2026-08-24 |
| E16.2 | Free, and conservative about what it reads        | Done   | `…0da0f00` | 2026-08-24 |
| E16.3 | A suggestion does not come back                   | Done   | `…0da0f00` | 2026-08-24 |
| E16.4 | The budget cap stays private                      | Done   | `…0da0f00` | 2026-08-24 |

## Notes for whoever picks this up

- ~~Two deferred criteria waiting on E3~~ — both delivered with E3:
  `ai.match_refreshed` (E4.3) and `proposal.locked` / `proposal.unlocked`
  (E6.3) are recorded.

- ~~Two live authorisation holes~~ — both closed by E2: `trips.update` now
  requires admin (it previously checked nothing at all), and
  `trips.sendInviteEmail` is admin-only. **Since 2026-08-22 it is
  tripmate-or-above, and admin-only for any role but `watcher`** — see the
  superseded note in [stories/E2-members-and-roles.md](stories/E2-members-and-roles.md).
- One real bug is fixed by E3.3: changing your vote leaves `createdAt` at the
  original time, so a changed vote reports the wrong moment.
- The riskiest single change is E6.1 — multi-lock silently breaks every
  `find(x => x.selected)` reader. Its story lists them all.
