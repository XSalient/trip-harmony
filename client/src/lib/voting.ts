import {
  Ban,
  Check,
  Heart,
  HelpCircle,
  type LucideIcon,
  Users,
  X,
} from "lucide-react";
import {
  DATE_VOTES,
  MAJORITY_VOTE,
  PREFERENCE_VOTES,
  VOTE_LABELS,
  VOTE_WEIGHTS,
  scoreVotes,
} from "@shared/votes";

/**
 * Presentation for a vote value — icons and grouping only.
 *
 * The weights, labels and the scoring rule deliberately are NOT redefined
 * here. `shared/votes.ts` owns them, and the comment on VoteScore records why:
 * the badge, the card ordering and the referee's reasoning had each grown their
 * own copy of the rule, and the three drifted. This module adds the one thing
 * shared/ has no opinion about — which glyph goes with which value — and
 * re-exports the rest so a component needs a single import.
 */

export type VoteStance = "up" | "mid" | "down" | "abstain";

export interface VoteScale {
  id: "availability" | "preference";
  /** In display order, abstain last — it is a different kind of answer. */
  values: readonly string[];
  /** stance -> the value the API expects */
  byStance: Record<Exclude<VoteStance, "abstain">, string>;
  icons: Record<string, LucideIcon>;
}

export const AVAILABILITY_SCALE: VoteScale = {
  id: "availability",
  values: DATE_VOTES,
  byStance: { up: "available", mid: "maybe", down: "unavailable" },
  icons: {
    available: Check,
    maybe: HelpCircle,
    unavailable: X,
    [MAJORITY_VOTE]: Users,
  },
};

export const PREFERENCE_SCALE: VoteScale = {
  id: "preference",
  values: PREFERENCE_VOTES,
  byStance: { up: "love", mid: "fine", down: "veto" },
  icons: {
    love: Heart,
    fine: Check,
    veto: Ban,
    [MAJORITY_VOTE]: Users,
  },
};

export const STANCES = ["up", "mid", "down"] as const;

/** Which stance a wire value represents, for tone and grouping. */
export function stanceOf(
  scale: VoteScale,
  wire: string | null | undefined
): VoteStance | undefined {
  if (!wire) return undefined;
  if (wire === MAJORITY_VOTE) return "abstain";
  const found = STANCES.find(s => scale.byStance[s] === wire);
  return found;
}

/** Semantic tone per stance, so status colour is never chosen ad hoc. */
export const STANCE_TONE: Record<
  VoteStance,
  "success" | "warning" | "danger" | "neutral"
> = {
  up: "success",
  mid: "warning",
  down: "danger",
  abstain: "neutral",
};

export interface Tally {
  up: number;
  mid: number;
  down: number;
  abstain: number;
  total: number;
  /** Weighted group score, from shared/votes.ts — not recomputed here. */
  score: number;
}

/** Counts per stance plus the shared score. */
export function tally(
  scale: VoteScale,
  votes: ReadonlyArray<{ vote: string }> | null | undefined
): Tally {
  const counts = { up: 0, mid: 0, down: 0, abstain: 0 };
  for (const v of votes ?? []) {
    const stance = stanceOf(scale, v.vote);
    if (stance) counts[stance] += 1;
  }
  return {
    ...counts,
    total: counts.up + counts.mid + counts.down + counts.abstain,
    score: scoreVotes(votes as { vote: string }[] | null | undefined),
  };
}

export { MAJORITY_VOTE, VOTE_LABELS, VOTE_WEIGHTS, scoreVotes };
