# Documentation

Everything needed to work on WeVoTrip from any machine is in this directory and
committed to git. There is no external wiki or tracker.

## Start here

| I want to…                            | Go to                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Run the app locally                   | [runbooks/local-setup.md](runbooks/local-setup.md)                                                      |
| Show the product to someone           | [runbooks/demo.md](runbooks/demo.md)                                                                    |
| Know what's done and what's in flight | [PROJECT_STATUS.md](PROJECT_STATUS.md)                                                                  |
| Know what's planned                   | [ROADMAP.md](ROADMAP.md)                                                                                |
| See the spec for work in flight       | [product/](product/)                                                                                    |
| See what changed                      | [CHANGELOG.md](CHANGELOG.md)                                                                            |
| Understand the system                 | [architecture/README.md](architecture/README.md)                                                        |
| Find a file                           | [architecture/repo-map.md](architecture/repo-map.md)                                                    |
| Know the stack and why                | [architecture/tech-stack.md](architecture/tech-stack.md)                                                |
| Understand the database               | [architecture/data-model.md](architecture/data-model.md)                                                |
| Deploy                                | [runbooks/deployment.md](runbooks/deployment.md)                                                        |
| Switch between dev/preview/prod       | [runbooks/environments.md](runbooks/environments.md)                                                    |
| Handle secrets                        | [runbooks/secrets.md](runbooks/secrets.md)                                                              |
| Debug a problem                       | [runbooks/logging.md](runbooks/logging.md) · [runbooks/troubleshooting.md](runbooks/troubleshooting.md) |
| Change the database schema            | [runbooks/database.md](runbooks/database.md)                                                            |
| Measure how the beta is going         | [runbooks/beta-metrics.md](runbooks/beta-metrics.md)                                                    |
| Know why a decision was made          | [adr/](adr/)                                                                                            |

AI agents: read [../AGENTS.md](../AGENTS.md) first.

## How this documentation is maintained

- **PROJECT_STATUS.md** is updated at the end of every substantial piece of work.
  It is the answer to "where is this project?" — treat a stale status file as a bug.
- **CHANGELOG.md** gets an entry for anything user-visible.
- **product/** holds the specification for agreed-but-unbuilt work: epics, user
  stories with acceptance criteria, and a progress tracker updated in the same
  commit as the code. An epic moves to the changelog when it ships.
- **ADRs** are append-only. To reverse a decision, add a new ADR that supersedes
  the old one; never edit history.
- **Runbooks** are updated when the procedure they describe changes — a runbook
  that no longer works is worse than none.

`docs/archive/` holds superseded documents kept only for history. Do not follow
their instructions.
