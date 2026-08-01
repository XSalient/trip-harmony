# Back To Travelling

AI-assisted group trip planning. A group proposes dates, destinations,
accommodations and activities; everyone votes; an AI "referee" surfaces conflicts
and suggests compromises that respect each person's budget and preferences.

```bash
pnpm setup     # bootstrap a fresh clone (idempotent)
pnpm dev       # http://localhost:5000
```

Full instructions: **[docs/runbooks/local-setup.md](docs/runbooks/local-setup.md)**.

---

## What's in the box

- **Travel DNA** — an eight-axis personality profile per member, aggregated across the group
- **Phased planning** — dates → destination → accommodation → itinerary, each with proposals, voting and comments
- **Budget guardian** — per-person tracking against each member's own comfort ceiling
- **AI referee** — conflict detection, compromise suggestions, and accommodation↔member match scoring
- **Vibe board** — shared inspiration with lightweight voting

## Stack

React 19 · Vite 7 · Tailwind 4 · tRPC 11 · Express 4 · Drizzle · PostgreSQL ·
TypeScript strict throughout, with types shared end to end.

Details and rationale: [docs/architecture/tech-stack.md](docs/architecture/tech-stack.md).

## Commands

```bash
pnpm dev          # API + SPA with hot reload
pnpm verify       # typecheck + tests + build — the definition of "done"
pnpm test         # server tests (vitest)
pnpm db:push      # apply drizzle/schema.ts
pnpm format       # prettier; CI enforces it
pnpm logs:tail    # follow local structured logs
```

## Documentation

Everything is committed to git — there is no external wiki.

|                                                  |                                                      |
| ------------------------------------------------ | ---------------------------------------------------- |
| [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) | Where the project stands right now                   |
| [docs/ROADMAP.md](docs/ROADMAP.md)               | What's planned                                       |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)           | What changed                                         |
| [docs/architecture/](docs/architecture/)         | How it's built, and where every file lives           |
| [docs/adr/](docs/adr/)                           | Why it's built that way                              |
| [docs/runbooks/](docs/runbooks/)                 | Setup, deployment, secrets, logging, troubleshooting |

**Working with an AI tool?** Point it at [AGENTS.md](AGENTS.md) — it's the shared
brief for Claude Code, Cursor, Copilot, Codex and anything else.

## Deployment

Vercel (static SPA + one serverless function) with secrets from Doppler and
Postgres from any provider. See
[docs/runbooks/deployment.md](docs/runbooks/deployment.md).

## Contributing

1. `pnpm setup`
2. Make the change; keep it inside one domain where you can
3. `pnpm verify`
4. Update [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md), and
   [docs/CHANGELOG.md](docs/CHANGELOG.md) if it's user-visible
5. Add an [ADR](docs/adr/) for anything architectural

## License

MIT
