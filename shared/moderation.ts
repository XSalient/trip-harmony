/**
 * The submission-time content filter.
 *
 * Apple's guideline 1.2 lists "a method for filtering objectionable material"
 * as one of four things a user-generated-content app must have. This is that
 * method. Both sides import it: the client to warn before a wasted round trip,
 * the server to enforce. **The server is the guard** — a client that declines
 * to send has still been asked nicely.
 *
 * It is deliberately a wordlist rather than a classifier. A wordlist is
 * inspectable, has no latency, no cost, and no third party in the path of every
 * comment; the app's content is a private group planning a holiday, not an open
 * feed, so the realistic job here is catching abuse between people who already
 * know each other rather than adversarial spam. `AI_ENABLED` is also allowed to
 * be off, and a filter that fails open when the AI is unavailable is not a
 * filter.
 *
 * What it costs: a wordlist cannot judge context, so it is tuned to reject only
 * terms that are abusive in every context. Anything gentler belongs in the
 * report queue, where a person looks at it.
 */

/**
 * Digits people substitute for letters, mapped back. Without this, `sh1t` and
 * `h3ll0` sail past a list that catches `shit` and `hello`.
 *
 * Applied only inside a token that already contains letters, so `1200` in
 * "£1200 a family" is left as a number rather than turned into letter noise.
 */
const DIGIT_LOOKALIKES: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
};

/**
 * Symbols that stand in for a letter, mapped back — but only where a letter
 * *follows*, which is the asymmetry that matters: `$hit` and `sh!t` are
 * evasions, while the `!` in "WORLD!" is punctuation and must not become an
 * `i`. A symbol with no letter after it is separator, not substitution.
 */
const SYMBOL_LOOKALIKES: Record<string, string> = {
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
  "+": "t",
};

/**
 * Terms rejected wherever they appear inside a word.
 *
 * Reserved for terms that cannot be a substring of anything innocent, because
 * this is the aggressive rule: it is what makes `bullshit` and `motherfucker`
 * fail without listing every compound anyone might build.
 */
const BLOCKED_ANYWHERE = ["fuck", "shit", "cunt", "nigger", "faggot"];

/**
 * Terms rejected when a word *starts* with them, so ordinary inflections are
 * caught — `bitches`, `raped`, `whores` — without an infix rule that would
 * reject `scraped` for containing `rape` and `class` for containing `ass`.
 *
 * This list is meant to be extended by whoever operates the app, and extending
 * it needs no code change beyond adding a string. Slur coverage in particular
 * is deliberately not attempted exhaustively in a public repository; add what
 * your moderation policy calls for.
 */
const BLOCKED_PREFIX = [
  "bitch",
  "asshole",
  "bastard",
  "whore",
  "slut",
  "dickhead",
  "retard",
  "rape",
  "rapist",
  "kys",
];

/**
 * Words that legitimately contain a blocked term and must survive.
 *
 * The Scunthorpe problem: an infix match on `cunt` rejects the name of a
 * Lincolnshire town, and a trip to Penistone is not abuse. Only the
 * `BLOCKED_ANYWHERE` rule can produce these, so only they need listing —
 * `grape` and `scraped` are already safe under the prefix rule.
 */
const ALLOWED_WORDS = [
  "scunthorpe",
  "penistone",
  "shitake",
  "shiitake",
  "cockburn",
];

/**
 * Fold a submission down to the letters underneath it.
 *
 * Lowercases, strips accents, maps lookalike characters back, drops everything
 * that is not a letter or a space, and collapses a letter repeated three or
 * more times to one — so `fuuuuck`, `F.U.C.K` and `ƒűck` all reduce to the same
 * word the list can see. Runs of two are left alone: `keep`, `pass`, `all`.
 */
export function normaliseForFilter(text: string): string {
  const tokens = text.toLowerCase().normalize("NFKD").split(/\s+/);

  const folded = tokens.map(token => {
    const bare = token.replace(/[\u0300-\u036f]/g, "");
    // A token with no letters in it is a number or punctuation, not a word
    // somebody disguised — leave it alone rather than reading letters into it.
    if (!/[a-z]/.test(bare)) return "";

    return bare
      .split("")
      .map((c, i) => {
        if (DIGIT_LOOKALIKES[c]) return DIGIT_LOOKALIKES[c];
        // Only when a letter follows: leading and medial are substitution,
        // trailing is punctuation.
        if (SYMBOL_LOOKALIKES[c] && /[a-z]/.test(bare[i + 1] ?? ""))
          return SYMBOL_LOOKALIKES[c];
        return c;
      })
      .join("");
  });

  return folded
    .join(" ")
    .replace(/[^a-z\s]+/g, " ")
    .replace(/([a-z])\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The first blocked term in `text`, or null if there is none.
 *
 * Returns the term rather than a boolean so the caller can say which word was
 * the problem. That matters: "that reads as abusive" with nothing named is a
 * dead end for somebody whose comment was rejected over a word they did not
 * realise was in it.
 */
export function findBlockedTerm(text: string): string | null {
  const normalised = normaliseForFilter(text);
  if (!normalised) return null;

  const allowed = new Set(ALLOWED_WORDS.map(normaliseForFilter));
  const words = normalised.split(" ").filter(w => !allowed.has(w));

  // `F.U.C.K` normalises to five separate letters, which no rule below would
  // match. Rejoin runs of three or more single letters — and only those, so
  // "this hit the spot" is never glued into a word nobody typed.
  const candidates = [...words];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) candidates.push(run.join(""));
    run = [];
  };
  for (const word of words) {
    if (word.length === 1) run.push(word);
    else flush();
  }
  flush();

  for (const term of BLOCKED_ANYWHERE) {
    const needle = normaliseForFilter(term);
    if (candidates.some(w => w.includes(needle))) return term;
  }
  for (const term of BLOCKED_PREFIX) {
    const needle = normaliseForFilter(term);
    if (candidates.some(w => w.startsWith(needle))) return term;
  }
  return null;
}

/**
 * The message shown when a submission is rejected.
 *
 * One wording, used by the client's early warning and the server's error alike,
 * so being refused twice does not read as two different problems.
 */
export function blockedTermMessage(field: string, term: string): string {
  return `Your ${field} can't include "${term}". Please reword it.`;
}
