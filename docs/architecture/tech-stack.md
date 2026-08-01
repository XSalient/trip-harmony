# Tech stack

Every runtime dependency, what it does, and why it's here. If you're about to add
a dependency, check this list first — the stack probably already covers it.

## Toolchain

|            | Version            | Notes                                               |
| ---------- | ------------------ | --------------------------------------------------- |
| Node.js    | 22 (≥ 20 required) | CI and Vercel both run 22                           |
| pnpm       | 10.4.1             | Pinned via `packageManager`; use corepack           |
| TypeScript | 5.9                | `strict: true`, `noEmit` — bundlers do the emitting |

`pnpm` is required, not preferred: the lockfile, the `wouter` patch and the
`onlyBuiltDependencies` allow-list are all pnpm-specific.

## Frontend

| Package                                   | Role                   | Why this one                                                                        |
| ----------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `react` 19 + `react-dom`                  | UI                     | —                                                                                   |
| `vite` 7                                  | Dev server and bundler | Also serves the API in dev via middleware mode, so one command runs everything      |
| `wouter`                                  | Routing                | ~2 KB; the app has no need for a data router. Locally patched — see `patches/`      |
| `@tanstack/react-query`                   | Server state           | Caching, invalidation and optimistic updates; drives the instant voting UX          |
| `@trpc/client`, `@trpc/react-query`       | API client             | Types come from the server; no codegen                                              |
| `tailwindcss` 4                           | Styling                | Utility-first; v4's Vite plugin needs no PostCSS config                             |
| `@radix-ui/*`                             | Accessible primitives  | Behaviour only; shadcn/ui supplies the styling layer in `client/src/components/ui/` |
| `react-hook-form` + `@hookform/resolvers` | Forms                  | Uncontrolled inputs; shares Zod schemas with the server                             |
| `framer-motion`                           | Animation              | Transitions on dashboard and voting                                                 |
| `lucide-react`                            | Icons                  | —                                                                                   |
| `sonner`                                  | Toasts                 | —                                                                                   |
| `recharts`                                | Charts                 | Budget breakdown                                                                    |
| `date-fns`                                | Dates                  | Tree-shakeable; no global mutation                                                  |
| `next-themes`                             | Dark mode              | Works standalone, despite the name                                                  |

## Backend

| Package              | Role            | Why this one                                                   |
| -------------------- | --------------- | -------------------------------------------------------------- |
| `express` 4          | HTTP server     | Runs unchanged as a long-lived server and as a Vercel function |
| `@trpc/server`       | API layer       | End-to-end type safety without a schema artifact               |
| `superjson`          | Serialisation   | Transports `Date` and `Map` correctly, which plain JSON can't  |
| `zod` 4              | Validation      | One schema validates API input, forms and environment config   |
| `drizzle-orm` + `pg` | Database        | SQL-shaped, fully typed, no runtime code generation            |
| `jose`               | JWT             | Standards-compliant, works in every runtime                    |
| `nodemailer`         | Email           | Optional: without SMTP, links are logged instead               |
| `@google/genai`      | AI              | Gemini via the official SDK                                    |
| `nanoid`             | IDs             | Invite codes and opaque user ids                               |
| `dotenv`             | Local env files | Loaded only outside deployed environments                      |

## Infrastructure

|                    | Role                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Vercel**         | Hosting — static SPA plus one serverless function. See [../runbooks/deployment.md](../runbooks/deployment.md) |
| **Doppler**        | Secrets across dev/preview/production. See [../runbooks/secrets.md](../runbooks/secrets.md)                   |
| **PostgreSQL**     | Data. Any provider; Supabase and Vercel Postgres are both fine                                                |
| **GitHub Actions** | CI — typecheck, tests, format, build, schema push                                                             |

## Testing

`vitest` runs server-side tests in `server/**/*.test.ts` against the tRPC router
directly — no HTTP layer, so they're fast. There is no frontend test setup yet
(tracked in [../ROADMAP.md](../ROADMAP.md)).

## Legacy — do not build on these

Carried over from the Manus/Replit scaffold this project started from:

|                                                                | Status                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `server/replit_integrations/`                                  | Unused; slated for deletion                                                          |
| `vite-plugin-manus-runtime`, `@builder.io/vite-plugin-jsx-loc` | Dev-only tooling from the original template                                          |
| Manus OAuth portal (`/api/oauth/callback`)                     | Inert unless `OAUTH_SERVER_URL` is set; email and magic-link auth are the real paths |
| `mysql2`, `@aws-sdk/*`                                         | Unused dependencies                                                                  |
| `.replit`, `.manus/`                                           | Artifacts of previous hosts                                                          |
