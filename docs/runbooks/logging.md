# Logging and debugging

Implementation: `server/_core/logger.ts` and `server/_core/httpLogging.ts`.
Rationale: [ADR-0004](../adr/0004-structured-logging.md).

## Using it

```ts
import { logger } from "../_core/logger";

const log = logger.child({ scope: "budget" }); // module-level

log.info("expense added", { tripId, amount });
log.error("failed to split expense", { tripId, err });
```

Inside a tRPC procedure use `ctx.log` — it is already bound to the request id and
user id:

```ts
someProcedure: protectedProcedure.mutation(async ({ ctx, input }) => {
  ctx.log.info("doing the thing", { tripId: input.tripId });
});
```

**Never use `console.*` in server code.** It bypasses levels, structure and
redaction.

### Conventions

- Message: short, lowercase, no interpolation — `"expense added"`, not
  `` `added expense ${id}` ``. Variables belong in the fields object so they're
  queryable.
- Put the error under the key `err`; the logger serialises name, message and stack.
- Levels: `debug` for flow, `info` for notable events, `warn` for expected
  failures (validation, auth), `error` for faults that need a human.

## What you get for free

Every request produces:

```json
{"time":"2026-08-01T09:39:18.465Z","level":"debug","env":"development",
 "msg":"trpc ok","requestId":"083cd072-…","userId":1,
 "procedure":"trips.list","type":"query","durationMs":3.27}
{"time":"2026-08-01T09:39:18.473Z","level":"info","env":"development",
 "msg":"http request","requestId":"083cd072-…","method":"GET",
 "path":"/api/trpc/trips.list","status":200,"durationMs":41.72}
```

- Every line from one request shares a `requestId`, also returned as the
  `x-request-id` response header. A user can read it from their browser's network
  tab, and it resolves to the whole request.
- An inbound `x-request-id` is honoured, so traces survive proxies.
- Client errors log at `warn` with a reason; server faults log at `error` with a
  stack. Unhandled rejections and uncaught exceptions are captured too.

## Redaction

Values under keys like `password`, `passwordHash`, `token`, `accessToken`,
`authorization`, `cookie`, `secret`, `apiKey`, `database_url` are replaced with
`[redacted]` at any depth. Logging a whole request or config object is therefore
safe — but this is a backstop, not licence to log credentials on purpose.

## Where logs go

| Environment          | Destination                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| Local                | Coloured lines in the terminal **and** JSONL in `logs/<env>-<date>.jsonl` |
| Test                 | Nothing (level `silent`)                                                  |
| Preview / production | One JSON object per line on stdout/stderr, indexed by Vercel              |

`logs/` is git-ignored. Nothing is written to disk when deployed — the filesystem
is ephemeral and read-only outside `/tmp`.

## Reading logs

Locally:

```bash
pnpm logs:tail                                            # follow
jq 'select(.level=="error")'      logs/*.jsonl            # errors only
jq 'select(.requestId=="…")'      logs/*.jsonl            # one request end to end
jq 'select(.durationMs>500)'      logs/*.jsonl            # slow calls
jq -r '.procedure' logs/*.jsonl | sort | uniq -c | sort -rn   # hot procedures
```

Deployed: Vercel dashboard → project → Logs. It parses JSON, so filter on
`requestId`, `level`, `procedure` or `status` directly. `vercel logs <url>` works
from a terminal.

## Turning up detail

```bash
LOG_LEVEL=debug pnpm dev
doppler secrets set LOG_LEVEL=debug --config stg   # a preview deployment
```

Leave production at `info`. `debug` logs every procedure call and gets expensive
and noisy fast.

## Browser-side logs

In development, a Vite plugin collects browser console output and network
activity into `.manus-logs/`. That is leftover template tooling — useful, but
slated for removal (see [../ROADMAP.md](../ROADMAP.md)). Don't build on it.
