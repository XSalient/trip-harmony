/**
 * The AI Referee's prompt, and the facts it is allowed to reason about.
 *
 * Lifted out of `server/routers/referee.ts`, which carried it as two inline
 * template literals with no version and no way to test it. Out here it is both:
 * gathering the facts is a pure function over rows the router has already
 * fetched, so the awkward cases — a must-have nothing satisfies, a stay nobody
 * has voted on, a member who never filled the form in — are asserted without a
 * model, a database or a network call.
 *
 * Two properties keep the referee honest, and both are built here rather than
 * hoped for in the wording:
 *
 * - **It sees facts, not inferences.** Everything in `RefereeContext` is a row
 *   from this trip or arithmetic over rows from this trip. Money in particular
 *   is divided here — a model asked to split 1,400 across four people and
 *   compare the result to three different caps will sometimes get it wrong, and
 *   a wrong number stated confidently is the failure this module exists to
 *   prevent.
 * - **What it cannot see is named.** `dataGaps` says out loud which members
 *   have no preferences, which proposals nobody has voted on, and which stays
 *   have never been match-analysed. "I don't know" is then a fact the referee
 *   can repeat, rather than an absence it has to notice.
 *
 * The stays' stored match analysis is in here for a reason worth recording: the
 * accommodations screen would show `42/100`, `High risk` and a failed must-have
 * while the referee, reading only vote tallies, reported a group in harmony.
 * Two AI features looking at the same trip disagreed because one of them was
 * never shown what the other had already found.
 */
import {
  perPersonOf,
  tripTotalOf,
  type BudgetScope,
} from "../../shared/budget.js";

/**
 * Identifies the prompt that produced a stored referee message.
 *
 * Persisted inside the `context` JSON on `referee_messages`, which is a text
 * column already holding JSON — so recording the version costs no migration.
 * Messages written before this module carry no `promptVersion`; those are v1,
 * the inline prompt.
 *
 * Bump it when the wording changes what the referee is asked to do, not when a
 * typo is fixed.
 */
export const REFEREE_PROMPT_VERSION = "referee/v2";

/**
 * Preference fields accept 2,000 characters each, so a large group outgrows a
 * sensible prompt on its own. Trim per field, never the finished JSON — that
 * would hand the model a broken object.
 */
const MAX_TEXT = 400;
const MAX_REASON = 240;
const MAX_FLAGS = 6;

// ---------------------------------------------------------------------------
// Inputs — deliberately structural, so a database row passes straight in.
// ---------------------------------------------------------------------------

export type RefereeVoteRow = { userId: number; vote: string };

export type RefereeMemberRow = {
  userId: number;
  status?: string | null;
  budgetMax?: string | number | null;
  user?: { name?: string | null } | null;
};

export type RefereeProposalRow = {
  label?: string | null;
  name?: string | null;
  selected?: boolean | null;
  votes?: RefereeVoteRow[] | null;
};

export type RefereeAccommodationRow = RefereeProposalRow & {
  location?: string | null;
  totalPrice?: string | number | null;
  pricePerNight?: string | number | null;
  /** JSON written by `runAccommodationMatchAnalysis`, or null if never run. */
  matchAnalysis?: string | null;
};

export type RefereeInput = {
  trip:
    | {
        name?: string | null;
        currency?: string | null;
        totalBudget?: string | number | null;
      }
    | null
    | undefined;
  phase: string;
  members: RefereeMemberRow[];
  preferences: Array<{ userId: number; rawText: string }>;
  budgetProposals: Array<{
    title?: string | null;
    amount?: string | number | null;
    scope?: string | null;
    selected?: boolean;
    votes?: Array<{ vote: string }> | null;
  }>;
  /** Adults, children and voting units. Pets are never in it — see `shared/budget.ts`. */
  headcount: { adults: number; children: number; groups: number };
  dateProposals: RefereeProposalRow[];
  destinations: RefereeProposalRow[];
  accommodations: RefereeAccommodationRow[];
};

// ---------------------------------------------------------------------------
// The context — what the referee is shown, and nothing else.
// ---------------------------------------------------------------------------

export type RefereePreferenceFact = {
  name: string;
  mustHaves: string | null;
  strongPreferences: string | null;
  avoids: string | null;
  comments: string | null;
};

export type RefereeProposalFact = {
  label: string;
  votes: Record<string, number>;
  voteCount: number;
  notVoted: string[];
  finalised: boolean;
};

export type RefereeMatchFact = {
  groupFitScore: number | null;
  comfortScore: number | null;
  resentmentRisk: string | null;
  summary: string | null;
  flags: string[];
  memberMatches: Array<{
    name: string;
    score: number | null;
    verdict: string | null;
    reason: string | null;
  }>;
};

export type RefereeAccommodationFact = RefereeProposalFact & {
  location: string | null;
  totalPrice: number | null;
  pricePerNight: number | null;
  /** Divided here, not by the model. */
  perPersonShare: number | null;
  /** Members whose own cap is below `perPersonShare`. Arithmetic, not opinion. */
  exceedsBudgetCapFor: string[];
  matchAnalysis: RefereeMatchFact | null;
};

export type RefereeContext = {
  promptVersion: string;
  tripName: string | null;
  phase: string;
  memberCount: number;
  memberNames: string[];
  preferences: RefereePreferenceFact[];
  membersWithoutPreferences: string[];
  budget: {
    currency: string;
    plannedTotal: number | null;
    /**
     * Every budget on the table, each normalised to one trip total so the model
     * can compare figures that were written per person and per family.
     */
    proposals: Array<{
      title: string;
      tripTotal: number;
      perPerson: number | null;
      scope: string;
      score: number;
      finalised: boolean;
    }>;
    finalisedTotal: number | null;
    memberCaps: Array<{ name: string; cap: number }>;
    lowestMemberCap: number | null;
  };
  dates: RefereeProposalFact[];
  destinations: RefereeProposalFact[];
  accommodations: RefereeAccommodationFact[];
  participation: {
    proposalCount: number;
    proposalsWithNoVotes: string[];
    membersWhoHaveNotVotedAtAll: string[];
  };
  /** Written in plain English, because the referee quotes them back. */
  dataGaps: string[];
};

// ---------------------------------------------------------------------------

function trim(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Reads back what match analysis stored, keeping only the fields it can vouch for. */
function parseMatchAnalysis(
  raw: string | null | undefined
): RefereeMatchFact | null {
  if (!raw) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const matches: Array<Record<string, unknown>> = Array.isArray(
    parsed.memberMatches
  )
    ? parsed.memberMatches
    : [];
  return {
    groupFitScore: num(parsed.groupFitScore as string | number | null),
    comfortScore: num(parsed.comfortScore as string | number | null),
    resentmentRisk: trim(parsed.resentmentRisk, 20),
    summary: trim(parsed.summary),
    flags: (Array.isArray(parsed.flags) ? parsed.flags : [])
      .map(flag => trim(flag))
      .filter((flag): flag is string => flag !== null)
      .slice(0, MAX_FLAGS),
    memberMatches: matches.map(match => ({
      name: trim(match?.name, 80) ?? "Unnamed member",
      score: num(match?.score as string | number | null),
      verdict: trim(match?.verdict, 40),
      reason: trim(match?.reason, MAX_REASON),
    })),
  };
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Everything the referee is allowed to reason about, gathered from rows.
 *
 * Pure: no database, no clock, no model. The same trip returns the same
 * context, which is what makes the awkward cases testable.
 */
export function buildRefereeContext(input: RefereeInput): RefereeContext {
  const accepted = input.members.filter(m => m.status === "accepted");
  const memberCount = accepted.length;
  const nameOf = (userId: number) =>
    accepted.find(m => m.userId === userId)?.user?.name || `Member #${userId}`;
  const memberNames = accepted.map(m => nameOf(m.userId));

  const byUser = new Map<number, Record<string, unknown>>();
  for (const row of input.preferences) {
    try {
      const parsed = JSON.parse(row.rawText);
      if (parsed && typeof parsed === "object") byUser.set(row.userId, parsed);
    } catch {
      // A preference row we cannot read is a member we know nothing about, and
      // `membersWithoutPreferences` reports that honestly below.
    }
  }

  const preferences: RefereePreferenceFact[] = [];
  const membersWithoutPreferences: string[] = [];
  for (const member of accepted) {
    const raw = byUser.get(member.userId);
    const fact: RefereePreferenceFact = {
      name: nameOf(member.userId),
      mustHaves: trim(raw?.mustHaves),
      strongPreferences: trim(raw?.strongPreferences),
      avoids: trim(raw?.avoids),
      comments: trim(raw?.openComments),
    };
    // A saved-but-empty form is not a preference. Counting it as one is how a
    // referee ends up reporting agreement it never saw evidence of.
    const said = [
      fact.mustHaves,
      fact.strongPreferences,
      fact.avoids,
      fact.comments,
    ];
    if (said.every(value => value === null)) {
      membersWithoutPreferences.push(fact.name);
      continue;
    }
    preferences.push(fact);
  }

  // Normalised through the same module the screen and the server use, so the
  // referee cannot quote a figure back that disagrees with the one on the card.
  const VOTE_WEIGHTS: Record<string, number> = { love: 2, fine: 1, veto: -3 };
  const budgetFacts = input.budgetProposals.map(p => {
    const amount = num(p.amount) ?? 0;
    const scope = (p.scope ?? "trip_total") as BudgetScope;
    const tripTotal = round2(
      tripTotalOf(amount, scope, { ...input.headcount, pets: 0 })
    );
    return {
      title: trim(p.title, 120) || "Untitled budget",
      tripTotal,
      perPerson: round2(
        perPersonOf(tripTotal, { ...input.headcount, pets: 0 })
      ),
      scope,
      score: (p.votes ?? []).reduce(
        (t, v) => t + (VOTE_WEIGHTS[v.vote] ?? 0),
        0
      ),
      finalised: Boolean(p.selected),
    };
  });
  const finalisedTotal = budgetFacts.find(b => b.finalised)?.tripTotal ?? null;
  const memberCaps = accepted
    .map(member => ({
      name: nameOf(member.userId),
      cap: num(member.budgetMax),
    }))
    .filter(
      (entry): entry is { name: string; cap: number } => entry.cap !== null
    );

  const voters = new Set<number>();
  const summarise = (
    label: string,
    row: RefereeProposalRow
  ): RefereeProposalFact => {
    const cast = row.votes ?? [];
    const tally: Record<string, number> = {};
    for (const vote of cast) {
      tally[vote.vote] = (tally[vote.vote] ?? 0) + 1;
      voters.add(vote.userId);
    }
    const votedIds = new Set(cast.map(vote => vote.userId));
    return {
      label,
      votes: tally,
      voteCount: cast.length,
      notVoted: accepted
        .filter(m => !votedIds.has(m.userId))
        .map(m => nameOf(m.userId)),
      finalised: row.selected === true,
    };
  };

  const dates = input.dateProposals.map(p =>
    summarise(p.label || "Untitled dates", p)
  );
  const destinations = input.destinations.map(d =>
    summarise(d.name || "Untitled destination", d)
  );
  const accommodations: RefereeAccommodationFact[] = input.accommodations.map(
    stay => {
      const totalPrice = num(stay.totalPrice);
      const perPersonShare =
        totalPrice !== null && memberCount > 0
          ? round2(totalPrice / memberCount)
          : null;
      return {
        ...summarise(stay.name || "Untitled stay", stay),
        location: trim(stay.location, 120),
        totalPrice,
        pricePerNight: num(stay.pricePerNight),
        perPersonShare,
        exceedsBudgetCapFor:
          perPersonShare === null
            ? []
            : memberCaps.filter(c => c.cap < perPersonShare).map(c => c.name),
        matchAnalysis: parseMatchAnalysis(stay.matchAnalysis),
      };
    }
  );

  const allProposals = [...dates, ...destinations, ...accommodations];
  const proposalsWithNoVotes = allProposals
    .filter(p => p.voteCount === 0)
    .map(p => p.label);
  const membersWhoHaveNotVotedAtAll = accepted
    .filter(m => !voters.has(m.userId))
    .map(m => nameOf(m.userId));

  const dataGaps: string[] = [];
  if (memberCount === 0) {
    dataGaps.push("Nobody has accepted an invitation to this trip yet.");
  } else if (preferences.length === 0) {
    dataGaps.push(
      "No member has recorded any trip preferences, so nothing is known about what anyone needs."
    );
  } else if (membersWithoutPreferences.length > 0) {
    const plural = membersWithoutPreferences.length > 1;
    dataGaps.push(
      `${listNames(membersWithoutPreferences)} ${
        plural ? "have" : "has"
      } set no trip preferences, so nothing is known about what ${
        plural ? "they need" : "they need"
      }.`
    );
  }
  if (allProposals.length === 0) {
    dataGaps.push("No dates, destinations or stays have been proposed yet.");
  }
  if (proposalsWithNoVotes.length > 0) {
    dataGaps.push(`Nobody has voted on: ${proposalsWithNoVotes.join("; ")}.`);
  }
  if (membersWhoHaveNotVotedAtAll.length > 0) {
    dataGaps.push(
      `${listNames(membersWhoHaveNotVotedAtAll)} ${
        membersWhoHaveNotVotedAtAll.length > 1 ? "have" : "has"
      } not voted on anything yet.`
    );
  }
  const unanalysed = accommodations
    .filter(a => a.matchAnalysis === null)
    .map(a => a.label);
  if (unanalysed.length > 0) {
    dataGaps.push(
      `These stays have never been match-analysed, so no per-member fit is known for them: ${unanalysed.join("; ")}.`
    );
  }
  if (memberCaps.length === 0 && memberCount > 0) {
    dataGaps.push("No member has set a personal budget cap.");
  }
  if (budgetFacts.length === 0) {
    dataGaps.push(
      "Nobody has proposed a budget, so there is no agreed figure to reason about — not a figure of zero."
    );
  } else if (finalisedTotal === null) {
    dataGaps.push(
      "A budget has been proposed but none is finalised, so any total below is a candidate rather than a decision."
    );
  }

  return {
    promptVersion: REFEREE_PROMPT_VERSION,
    tripName: trim(input.trip?.name, 120),
    phase: input.phase,
    memberCount,
    memberNames,
    preferences,
    membersWithoutPreferences,
    budget: {
      currency: input.trip?.currency || "USD",
      plannedTotal: num(input.trip?.totalBudget),
      proposals: budgetFacts,
      finalisedTotal,
      memberCaps,
      lowestMemberCap: memberCaps.length
        ? Math.min(...memberCaps.map(c => c.cap))
        : null,
    },
    dates,
    destinations,
    accommodations,
    participation: {
      proposalCount: allProposals.length,
      proposalsWithNoVotes,
      membersWhoHaveNotVotedAtAll,
    },
    dataGaps,
  };
}

/**
 * The two messages sent to the model, built from a context and nothing else.
 *
 * Returned as plain strings rather than `llm.ts` message objects so a test can
 * read them without importing the provider SDK.
 */
export function buildRefereePrompt(context: RefereeContext): {
  system: string;
  user: string;
} {
  const system = `You are the Back To Travelling Referee: an impartial reader of one group's trip plan. You advise. The group decides.

Rules, in order of importance:

1. FACTS BEFORE OPINION. Every fact you state must appear in the CONTEXT JSON you are given. Name proposals, people, vote counts, preferences and prices exactly as they are written there. Do not invent a proposal, a person, a vote, a preference or a price, and do not restate a number in a different currency or unit.
2. NEVER INFER MISSING DATA. If something is not in the context — a price, a person's opinion, why someone voted as they did, whether a stay suits someone — say it is not recorded. "dataGaps" lists what this trip does not know; treat it as part of your answer. Admitting a gap is always better than filling it.
3. MUST-HAVES ARE CONSTRAINTS, NOT PREFERENCES. A proposal that fails someone's stated must-have is disqualified until that person says otherwise. Never average a failed must-have against other members' enthusiasm, and never soften it into a "concern" or a "trade-off".
4. SEPARATE WHAT YOU OBSERVED FROM WHAT YOU RECOMMEND, using the headings below. Nothing under an observation heading may contain advice; nothing under the recommendation heading may present itself as an observed fact.
5. ONE RECOMMENDATION, WITH ITS COST. Name the specific trade-off it makes: what the group gives up, and who is worse off for it. A recommendation with no stated cost is not finished.
6. YOU HAVE DECIDED NOTHING. Never write that you have chosen, picked, settled, ruled or decided anything, and never say the group has agreed unless the votes in the context show it.

Reply in Markdown, under 220 words, using exactly these five headings and nothing else:

**What I can see** — observed facts only: who is in, what is proposed, how the votes fell.
**Where it's stuck** — conflicts, failed must-haves, budget breaches and deadlocks, each tied to the named proposal and the named person. If the context shows none, say so plainly rather than manufacturing one.
**What's missing** — the gaps from "dataGaps", in your own words. Write "Nothing significant" only if that list is empty.
**What I'd suggest** — one recommendation, and the trade-off it costs.
**Next step** — one concrete action, and who should take it.

Be warm and plain-spoken. At most one emoji. No preamble, no sign-off.`;

  const user = `Read this group's trip and mediate.

How to read the CONTEXT JSON:
- "preferences" is what each member wrote they need. "mustHaves" are hard constraints. "membersWithoutPreferences" names people who wrote nothing — you know nothing about them, so say that rather than assuming they are content.
- Each entry under "dates", "destinations" and "accommodations" is one proposal. "votes" tallies how the group voted on it, "notVoted" names the members who have not voted on it, and "finalised" means the group has already locked it in.
- On a stay, "perPersonShare" and "exceedsBudgetCapFor" are already calculated from the stored price and each member's own cap. Quote them; do not recompute them.
- "matchAnalysis" on a stay is an earlier AI scoring of that stay against the members' stated preferences, saved with the trip. Its "flags", "resentmentRisk" and "memberMatches" are findings you may cite as already recorded — say that is where they came from. A stay whose "matchAnalysis" is null has never been analysed, which is not the same as a stay that scored well.
- "dataGaps" is what this trip does not record. It is not optional context.

CONTEXT:
${JSON.stringify(context)}`;

  return { system, user };
}

export type RefereeUnavailableReason = "no-provider" | "model-error";

/**
 * What the referee says when it could not read the trip.
 *
 * The message this replaces was an encouraging nudge — "Keep the momentum
 * going — every vote counts! 🎯" — stored as though it were an analysis. A
 * reader could not tell a failed request from a trip with no conflicts, which
 * is the most misleading thing this feature could do.
 */
export function refereeUnavailableMessage(
  reason: RefereeUnavailableReason
): string {
  const cause =
    reason === "no-provider"
      ? "This deployment has no AI provider configured, so no analysis was attempted."
      : "I tried, but the model did not answer, so the analysis did not run.";
  const remedy =
    reason === "no-provider"
      ? "An administrator has to configure the AI provider before the referee can read a trip."
      : "Try again in a few minutes. If it keeps failing, tell an administrator.";

  return [
    "**Analysis unavailable — I have not read this trip.**",
    "",
    `${cause} Nothing here is a finding about your group: silence means a failed request, **not** a trip without conflicts.`,
    "",
    "Your proposals, votes, preferences and budget are exactly as you left them.",
    "",
    remedy,
  ].join("\n");
}
