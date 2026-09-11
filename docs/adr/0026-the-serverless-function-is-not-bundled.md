# 0026. The serverless function is not bundled, so relative imports carry `.js`

- Status: Accepted
- Date: 2026-09-11

## Context

On 2026-09-11 every sign-in method stopped working at once — password, magic
link, passkey, the demo. The browser reported:

```
Unexpected token 'A', "A server e"... is not valid JSON
```

That string names nothing. It is the client calling `JSON.parse` on Vercel's
plain-text body `A server error has occurred`, which is what a request gets when
the function fails to start. The actual cause was in the function log:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/shared/roles'
    imported from /var/task/shared/votes.js
```

`shared/votes.ts` had `import { canContribute } from "./roles"`. Nothing about
that line looks wrong, and three of the four ways this code runs agree:

| Runtime                       | Resolves `./roles` | Why                           |
| ----------------------------- | ------------------ | ----------------------------- |
| `tsc --noEmit` (`pnpm check`) | yes                | `moduleResolution: "bundler"` |
| `pnpm dev` (tsx)              | yes                | tsx resolves extensionless    |
| `pnpm build` (esbuild)        | yes                | `--bundle` resolves it        |
| **Vercel's `api/server.ts`**  | **no**             | **native ESM, not bundled**   |

Vercel does not bundle the function. It transpiles the import graph file by file
into `/var/task/**` and runs it as native ESM, where an extensionless specifier
is simply not resolved — Node does not try `./roles.ts`, `./roles.js` or
`./roles/index.js`. The import throws at module load, before a single route is
registered, so the function never starts and **every** request fails, not only
the one that touched the offending module.

That is why the failure looked like an auth bug and was not. Sign-in was just the
first thing anyone tried; `/api/health` was down too, and would have said so.

The trap is that the one runtime that rejects the import is the only one a user
meets, and the repository's own definition of "it works" — `pnpm verify` — used
all three that accept it.

## Decision

**Every relative import in `api/`, `server/`, `shared/` and `drizzle/` names an
explicit extension: `./roles.js`, even though the file on disk is `roles.ts`.**

That spelling is correct in all four runtimes. TypeScript has resolved `.js`
specifiers to their `.ts` source since 4.7, and esbuild, tsx and Vite all do the
same, so nothing else in the toolchain has to change.

`moduleResolution` stays `"bundler"`. It is right for the client, which really is
bundled, and switching it to `"nodenext"` to get this diagnosed by `tsc` would
put the whole client under Node's resolution rules to catch a rule that applies
to four directories.

**Instead the rule is a test: `server/serverlessImports.test.ts`.** It scans the
deployed directories for relative specifiers and fails on any that lacks an
extension or points at no file. It runs in `pnpm verify` and in `pnpm
test:affected`, which is the point — the check belongs where the other three
runtimes' agreement is recorded, not in a runbook nobody opens.

## Consequences

A `.js` extension on an import of a `.ts` file reads as a mistake to anyone who
has not met this, which is why the test's failure message and this file both say
it is deliberate.

The guard scans text rather than the type-checked import graph, so it strips
comments first — `voiceTranscription.ts` has a JSDoc `@example` containing an
import statement, and that is not one. A specifier built at runtime would slip
past it. Neither is worth a parser: the mistake this catches is someone typing
the specifier the way every other TypeScript project types it.

The same latent bug existed in `shared/types.ts`, which no server file imports —
so it had never fired. It is fixed too, because "unreachable today" is how the
next outage starts.

A failed cold start is invisible from the outside. Vercel's body is plain text
and mentions no file, and the SPA keeps working because its assets are static,
so the app looks alive and only the API is dead. When the API returns something
that is not JSON, read the function log before reading the auth code:

```
mcp / vercel:  get_runtime_logs  statusCode=500
```
