# 0004. Structured JSON logging with request correlation

- Status: Accepted
- Date: 2026-08-01

## Context

The server used bare `console.log` with ad-hoc `[Prefix]` strings. That is
unsearchable in aggregate, has no severity, and had already leaked sensitive
material — the OAuth base URL was printed at boot, and any handler could print a
user object containing `passwordHash`.

Debugging also lacked correlation: with concurrent requests there was no way to
tell which lines belonged together.

## Decision

A small logger in `server/_core/logger.ts`:

- Levels (`debug`/`info`/`warn`/`error`), threshold set per environment.
- One JSON object per line when deployed; human-readable in a terminal locally,
  with a JSONL copy under `logs/`.
- Central redaction: values under keys like `password`, `token`, `authorization`,
  `apiKey` are replaced before serialisation, so logging a whole object is safe.
- Every request gets a correlation id, returned as the `x-request-id` header and
  attached to every line it produces, including tRPC procedure logs.

`console.*` is banned in server code.

## Consequences

- A user can report the `x-request-id` from their browser and it resolves to
  every line for that request.
- Vercel indexes JSON lines, so structured queries work without extra tooling.
- Redaction is centralised, so a new logging call can't leak by accident. It is
  not a substitute for not logging secrets deliberately.
- Local file logs let an agent inspect a failed run after the fact instead of
  reproducing it. They are git-ignored and never written when deployed.
- No logging library was added: the requirements are small, and a dependency-free
  implementation avoids version churn in the request path.
