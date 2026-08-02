# Progress — trip experience overhaul

The tracker for [overhaul-2026-08.md](overhaul-2026-08.md). Every story in
[stories/](stories/) has a row here.

**Update this file in the same commit as the work.** A tracker nobody updates is
worse than no tracker: it reads as authoritative and is wrong. When you finish a
story, set its status and fill in the commit. When you finish an epic, also update
the `Status:` line at the top of its story file, add a `../CHANGELOG.md` entry, and
update `../PROJECT_STATUS.md` (AGENTS.md rule 6).

Statuses: `Not started` · `In progress` · `Blocked` · `Done`

---

## Delivery order

E1 → E2 → E4 → E6 → E3 → E5 → E7 → E8

The order is not advisory. E2 builds the permission model that E3, E4, E6 and E7
all check against, and E6 changes what "finalised" means before E5 counts it.
Reasoning in [overhaul-2026-08.md](overhaul-2026-08.md#delivery-order).

## Epics

| #   | Epic                                                                             | Items         | Status      |
| --- | -------------------------------------------------------------------------------- | ------------- | ----------- |
| E1  | [Remove Travel DNA](stories/E1-remove-travel-dna.md)                             | 1             | Done        |
| E2  | [Members, roles and the contact book](stories/E2-members-and-roles.md)           | 2, 3          | Not started |
| E3  | [Activity trail and attribution](stories/E3-activity-and-attribution.md)         | 4, 5          | Not started |
| E4  | [AI runs only when asked](stories/E4-ai-runs-on-request-only.md)                 | 6, 7          | Not started |
| E5  | [Trip page restructure](stories/E5-trip-page-restructure.md)                     | 8, 10, 11, 14 | Not started |
| E6  | [Finalising proposals](stories/E6-finalising-proposals.md)                       | 9, 16         | Not started |
| E7  | [Editing and preferences summary](stories/E7-editing-and-preferences-summary.md) | 12, 13        | Not started |
| E8  | [Add-proposal flow](stories/E8-add-proposal-flow.md)                             | 15            | Not started |

## Stories

| ID   | Story                                                   | Status      | Commit    | Date       |
| ---- | ------------------------------------------------------- | ----------- | --------- | ---------- |
| E1.1 | No personality quiz in the app                          | Done        | `…kzsuz3` | 2026-08-02 |
| E1.2 | API and database carry no Travel DNA                    | Done        | `…kzsuz3` | 2026-08-02 |
| E1.3 | AI still useful once DNA is gone                        | Done        | `…kzsuz3` | 2026-08-02 |
| E2.1 | One helper decides what a member may do                 | Not started |           |            |
| E2.2 | Roles are Admin / Tripmate / Watcher                    | Not started |           |            |
| E2.3 | Watchers see no personal details                        | Not started |           |            |
| E2.4 | Members page                                            | Not started |           |            |
| E2.5 | Invite by email and track acceptance                    | Not started |           |            |
| E2.6 | Contact book                                            | Not started |           |            |
| E3.1 | Every trip action is recorded                           | Not started |           |            |
| E3.2 | Proposal shows who added it and when                    | Not started |           |            |
| E3.3 | Who voted and when                                      | Not started |           |            |
| E3.4 | `x/x voted` on places and accommodations detail screens | Not started |           |            |
| E4.1 | Adding a stay or saving preferences triggers no AI      | Not started |           |            |
| E4.2 | Stale match results are labelled                        | Not started |           |            |
| E4.3 | Admin chooses when match analysis runs                  | Not started |           |            |
| E4.4 | AI Referee cannot be spammed                            | Not started |           |            |
| E5.1 | Summary card at the top                                 | Not started |           |            |
| E5.2 | Trip description, collapsed                             | Not started |           |            |
| E5.3 | Every section collapses                                 | Not started |           |            |
| E5.4 | Section names and order                                 | Not started |           |            |
| E5.5 | Trip page split into components                         | Not started |           |            |
| E6.1 | Multiple locked places and accommodations               | Not started |           |            |
| E6.2 | Lock/unlock from the trip details page                  | Not started |           |            |
| E6.3 | Who finalised something and when                        | Not started |           |            |
| E7.1 | Preferences screen summary                              | Not started |           |            |
| E7.2 | Rename a trip and edit its description                  | Not started |           |            |
| E8.1 | Add navigates to the detail screen with the dialog open | Not started |           |            |
| E8.2 | One add form per proposal type                          | Not started |           |            |

## Open questions

Answer these as they come up; they block the story named beside each.

| #   | Question                                                          | Blocks | Answer |
| --- | ----------------------------------------------------------------- | ------ | ------ |
| Q1  | Do watchers see the AI Referee feed?                              | E2.3   |        |
| Q2  | Do all existing trip members become tripmates on migration?       | E2.2   |        |
| Q3  | What does a section header say when several proposals are locked? | E6.1   |        |
| Q4  | Is a hard numeric AI quota wanted, on top of the cooldown?        | E4.4   |        |
| Q5  | Where does the activity trail surface in the UI?                  | E3.1   |        |
| Q6  | Do sections default to collapsed or expanded on first visit?      | E5.3   |        |

## Notes for whoever picks this up

- Two live authorisation holes are fixed as part of this work, not by it:
  `trips.update` checks nothing (E7.2) and `trips.sendInviteEmail` allows any
  member to invite (E2.5). If the programme stalls, fix those anyway.
- One real bug is fixed by E3.3: changing your vote leaves `createdAt` at the
  original time, so a changed vote reports the wrong moment.
- The riskiest single change is E6.1 — multi-lock silently breaks every
  `find(x => x.selected)` reader. Its story lists them all.
