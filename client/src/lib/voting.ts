import { Ban, Check, Heart, HelpCircle, type LucideIcon, X } from "lucide-react";

/**
 * The app has exactly two vote wire-vocabularies, but all six call sites render
 * the same three choices. Modelling that as one stance with two scales removes
 * six divergent copies of the same UI.
 */
export type VoteStance = "up" | "mid" | "down";

export interface VoteScale<W extends string = string> {
  id: "availability" | "preference";
  /** stance -> the value the API expects */
  values: Record<VoteStance, W>;
  labels: Record<VoteStance, string>;
  /** Short form for dense/icon layouts. */
  shortLabels: Record<VoteStance, string>;
  icons: Record<VoteStance, LucideIcon>;
  /** Scoring weights. Down is punitive so one veto outweighs one yes. */
  weight: Record<VoteStance, number>;
}

const WEIGHT: Record<VoteStance, number> = { up: 2, mid: 1, down: -3 };

export const AVAILABILITY_SCALE: VoteScale<"available" | "maybe" | "unavailable"> = {
  id: "availability",
  values: { up: "available", mid: "maybe", down: "unavailable" },
  labels: { up: "I'm free", mid: "Maybe", down: "Can't make it" },
  shortLabels: { up: "Yes", mid: "Maybe", down: "No" },
  icons: { up: Check, mid: HelpCircle, down: X },
  weight: WEIGHT,
};

export const PREFERENCE_SCALE: VoteScale<"love" | "fine" | "veto"> = {
  id: "preference",
  values: { up: "love", mid: "fine", down: "veto" },
  labels: { up: "Love it", mid: "Fine", down: "Veto" },
  shortLabels: { up: "Love", mid: "Fine", down: "Veto" },
  icons: { up: Heart, mid: HelpCircle, down: Ban },
  weight: WEIGHT,
};

export const STANCES: VoteStance[] = ["up", "mid", "down"];

/** Map an API value back to its stance. */
export function stanceOf<W extends string>(
  scale: VoteScale<W>,
  wire: W | null | undefined
): VoteStance | undefined {
  if (!wire) return undefined;
  return STANCES.find(s => scale.values[s] === wire);
}

export interface Tally {
  up: number;
  mid: number;
  down: number;
  total: number;
  /** Weighted group score; higher is better. */
  score: number;
}

/**
 * Count votes and compute the weighted score. Replaces the duplicated reduce
 * that lived in both TripDestinations and TripAccommodations.
 */
export function tally<W extends string>(
  scale: VoteScale<W>,
  votes: ReadonlyArray<{ vote: W | string }> | null | undefined
): Tally {
  const counts: Record<VoteStance, number> = { up: 0, mid: 0, down: 0 };
  for (const v of votes ?? []) {
    const stance = stanceOf(scale, v.vote as W);
    if (stance) counts[stance] += 1;
  }
  const total = counts.up + counts.mid + counts.down;
  const score =
    counts.up * scale.weight.up +
    counts.mid * scale.weight.mid +
    counts.down * scale.weight.down;
  return { ...counts, total, score };
}

/** Semantic tone for a stance, so status colour is never chosen ad hoc. */
export const STANCE_TONE: Record<VoteStance, "success" | "warning" | "danger"> = {
  up: "success",
  mid: "warning",
  down: "danger",
};
