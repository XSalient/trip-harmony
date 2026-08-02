# AI tool rules

Every AI coding tool looks for its instructions in a different file. This repo
answers all of them with the same content, in one place.

## The rule

**[AGENTS.md](../../AGENTS.md) is the instructions. Everything else is a pointer.**

`CLAUDE.md` set this pattern deliberately, and says why in its own last line:
_"Nothing else belongs in this file. Guidance that lives in two places drifts."_
That is not a style preference. Three copies of "log through `logger.ts`" means
two of them are eventually wrong, and an agent that reads the wrong one writes
`console.log` into a JSON-logging, secret-redacting server.

## The files

| File                              | Tool                         | Content                    |
| --------------------------------- | ---------------------------- | -------------------------- |
| `AGENTS.md`                       | Codex, Aider, and the source | The instructions           |
| `CLAUDE.md`                       | Claude Code, Claude Desktop  | Pointer                    |
| `.cursor/rules/project.mdc`       | Cursor                       | Pointer + the costly rules |
| `.github/copilot-instructions.md` | GitHub Copilot               | Pointer + the costly rules |
| `GEMINI.md`                       | Gemini CLI                   | Pointer + the costly rules |
| `.windsurfrules`                  | Windsurf                     | Pointer + the costly rules |
| `.clinerules`                     | Cline                        | Pointer + the costly rules |

"The costly rules" are the four or five whose violation is expensive to undo and
which some tools will act on before they read a linked file:

1. All server config lives in `server/_core/env.ts`. Never read `process.env`
   elsewhere on the server.
2. Log via `server/_core/logger.ts`, never `console.*`.
3. One domain per file in `server/routers/`; register it in `routers/index.ts`.
4. Never return credential columns to a client — use `toPublicUser()`.
5. Never commit a secret.
6. Run `pnpm verify` before claiming to be done.

Repeating those six is the deliberate exception to "don't duplicate". They are
short, they change rarely, and the cost of an agent not seeing them is higher than
the cost of updating six files on the rare occasion they change.

## Adding another tool

1. Find where that tool looks for instructions.
2. Copy an existing pointer file — `.windsurfrules` is the plainest.
3. Add a row to the table above.

Do **not** paste the contents of `AGENTS.md` into it. If the new tool needs
something none of the others do, that belongs in `AGENTS.md` where every tool
sees it.

## When the rules change

Change `AGENTS.md`. Then check whether the change touches one of the six repeated
rules — if it does, update the pointer files too. If it does not, they need no
edit, which is the point of keeping them thin.
