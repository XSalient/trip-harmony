# AGENTS.md

Instructions for any AI coding agent (Claude Code, Cursor, Copilot, Codex, Gemini,
Aider, Windsurf …) working in this repository. Humans: start at [README.md](README.md).

**Read this file first and in full. It is deliberately short so you don't have to
explore the repo to become productive.**

---

## 1. What this is

Back To Travelling is a group-trip planning app. A group proposes dates, destinations,
accommodations and activities; everyone votes; an AI "referee" surfaces conflicts
and suggests compromises.

Single deployable: a React SPA served alongside an Express + tRPC API, Postgres
via Drizzle. One TypeScript project, no monorepo tooling.

## 2. Orientation — read only what you need

| You are changing…           | Read                                                       | Don't read                                         |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| An API endpoint             | `server/routers/<domain>.ts` (~25–230 lines each)          | other router files                                 |
| A database query            | `server/db.ts` + `drizzle/schema.ts`                       |                                                    |
| The schema                  | `drizzle/schema.ts` then `docs/architecture/data-model.md` |                                                    |
| A page                      | `client/src/pages/<Page>.tsx`                              | `client/src/components/ui/**` (shadcn, unmodified) |
| Config / secrets            | `server/_core/env.ts`                                      |                                                    |
| Logging                     | `server/_core/logger.ts`                                   |                                                    |
| Server startup / middleware | `server/_core/app.ts`                                      |                                                    |

Full file-by-file map: **[docs/architecture/repo-map.md](docs/architecture/repo-map.md)** —
consult it instead of running a broad `grep` or listing directories.

### Never read these (large, generated, or vendored — they will burn your context)

```
pnpm-lock.yaml                 client/src/components/ui/**
node_modules/  dist/  logs/    attached_assets/
client/src/pages/ComponentShowcase.tsx   (demo gallery, not app code)
docs/archive/**                (superseded; kept for history only)
```

## 3. Commands

```bash
pnpm setup     # one-time bootstrap on a fresh clone (idempotent)
pnpm dev       # http://localhost:5000 — API + SPA together, hot reload
pnpm verify    # typecheck + tests + build. Run before you claim to be done.
pnpm check     # typecheck only (fast)
pnpm test      # vitest, server-side
pnpm test:affected  # only the tests your change can reach (what CI runs)
pnpm format    # prettier; CI enforces it
pnpm db:push   # apply drizzle/schema.ts to the database
pnpm seed:demo # fill a database with the marketing demo (docs/runbooks/demo.md)
pnpm db:status # is this database behind on migrations?
```

`pnpm verify` is the definition of "it works" — run it before you claim to be
done. CI narrows to `pnpm test:affected` for speed; the full suite runs nightly.

## 4. Rules

1. **Read `server/_core/env.ts` before touching configuration.** Every
   `process.env` read on the server lives there and nowhere else. Adding a
   variable means: add it to the Zod schema, to `.env.example`, and to
   `docs/runbooks/secrets.md`.
2. **Never commit a secret.** No real values in `.env.example`, tests, docs, or
   code. Secrets come from Doppler locally and from Vercel env vars when deployed.
3. **Log through `server/_core/logger.ts`**, never `console.*`. Logs are JSON and
   secret-redacted; `console.log` bypasses both.
4. **One domain per router file.** New endpoints go in the matching
   `server/routers/<domain>.ts`; a new domain gets a new file plus one line in
   `server/routers/index.ts`. Do not reintroduce a single large router.
5. **Never return credential columns to the client.** Project user rows through
   `toPublicUser()` in `server/routers/_shared.ts`.
6. **Update `docs/PROJECT_STATUS.md`** when you finish a piece of work, and add a
   `docs/CHANGELOG.md` entry for anything user-visible. That file is how the next
   agent — and the next developer — learns what happened without reading git log.
7. **Architectural decisions get an ADR** in `docs/adr/`. Copy the shape of an
   existing one; keep it under a page.
8. **Don't add a dependency** to solve something the stack already does
   (validation → Zod, dates → date-fns, state → TanStack Query, styles → Tailwind).
9. **Changing `drizzle/schema.ts` means running `pnpm db:generate` and
   committing the migration in the same commit.** The deploy applies it; CI
   fails if the schema and the migrations disagree. A column that ships without
   its migration takes production down — it already did once.
10. **This repository has exactly two branches: `master` and `dev`.** Work goes
    to `master`; `dev` tracks it. Do not leave per-task or per-agent branches
    behind — merge the work and delete the branch in the same breath. A branch
    that outlives its task is one more place for the truth to live, and the
    repository already had four of them accumulate unnoticed, one of which was
    holding unmerged work nobody remembered.
    Deleting a branch is not the same as discarding it: check
    `git merge-base --is-ancestor <branch> origin/master` first, and rescue
    anything unmerged onto `master` before the branch goes.

## 5. Conventions

- TypeScript strict; no `any` in new code unless you explain why in a comment.
- Validate every tRPC input with Zod. Use `protectedProcedure` unless the
  endpoint is genuinely public.
- Errors to clients: `TRPCError` with a specific code. Never leak a stack trace.
- Imports: `@/*` → `client/src/*`, `@shared/*` → `shared/*`.
- Comments explain _why_, not _what_. Match the density of the file you're in.

## 6. Where state lives

Everything a newcomer or agent needs is committed to git — there is no external
tracker to consult:

| Question                      | File                              |
| ----------------------------- | --------------------------------- |
| What's the current state?     | `docs/PROJECT_STATUS.md`          |
| What's next?                  | `docs/ROADMAP.md`                 |
| What's being built right now? | `docs/product/`                   |
| What changed and when?        | `docs/CHANGELOG.md`               |
| Why is it built this way?     | `docs/adr/`                       |
| How do I run/deploy/debug it? | `docs/runbooks/`                  |
| What is the stack?            | `docs/architecture/tech-stack.md` |

This file is the instructions. `CLAUDE.md`, `GEMINI.md`,
`.github/copilot-instructions.md`, `.cursor/rules/project.mdc`, `.windsurfrules`
and `.clinerules` are pointers back to it — they repeat only the handful of rules
above that are expensive to violate. Never copy this file into them; see
`docs/product/ai-rules.md`.
