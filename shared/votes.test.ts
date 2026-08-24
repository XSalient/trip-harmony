/**
 * The vote weights and the finalise rule, tested where they live.
 *
 * Both failures this guards against are invisible on screen:
 *
 * - **A vote value with no weight.** An unweighted value scores zero and looks
 *   exactly like an abstention, so a card silently ranks below where it should.
 * - **`isAllMajority([])` returning true.** An unvoted proposal has always been
 *   finalisable. Getting that boundary wrong takes a working admin action away
 *   and nothing on the page explains why the padlock stopped working.
 */
import { describe, it, expect } from "vitest";
import {
  DATE_VOTES,
  MAJORITY_VOTE,
  PREFERENCE_VOTES,
  VOTE_LABELS,
  VOTE_WEIGHTS,
  countAbstentions,
  finaliseBlockReason,
  isAllMajority,
  scoreVotes,
} from "./votes.js";

const votes = (...vs: string[]) => vs.map(vote => ({ vote }));

describe("every vote value is weighted and labelled", () => {
  it("covers both enums", () => {
    for (const v of [...DATE_VOTES, ...PREFERENCE_VOTES]) {
      expect(VOTE_WEIGHTS[v]).toBeTypeOf("number");
      expect(VOTE_LABELS[v]).toBeTruthy();
    }
  });

  it("going with the majority is worth nothing", () => {
    expect(VOTE_WEIGHTS[MAJORITY_VOTE]).toBe(0);
  });

  it("scores the mixes the cards already showed, unchanged", () => {
    expect(scoreVotes(votes("love", "love", "fine"))).toBe(5);
    expect(scoreVotes(votes("love", "veto"))).toBe(-1);
    expect(scoreVotes(votes("available", "unavailable"))).toBe(-1);
    expect(scoreVotes([])).toBe(0);
    expect(scoreVotes(null)).toBe(0);
  });

  it("an abstention changes no score", () => {
    expect(scoreVotes(votes("love", MAJORITY_VOTE))).toBe(
      scoreVotes(votes("love"))
    );
  });

  it("counts abstentions separately, so a screen can show them", () => {
    expect(countAbstentions(votes("love", MAJORITY_VOTE, MAJORITY_VOTE))).toBe(
      2
    );
    expect(countAbstentions([])).toBe(0);
  });
});

describe("a proposal nobody has an opinion about is not decided", () => {
  it("blocks when every cast vote is going with the majority", () => {
    expect(isAllMajority(votes(MAJORITY_VOTE, MAJORITY_VOTE))).toBe(true);
    expect(finaliseBlockReason(votes(MAJORITY_VOTE))).toContain("no majority");
  });

  it("does not block a proposal nobody has voted on", () => {
    expect(isAllMajority([])).toBe(false);
    expect(finaliseBlockReason([])).toBeNull();
    expect(finaliseBlockReason(null)).toBeNull();
  });

  it("stops blocking as soon as one person states a preference", () => {
    expect(isAllMajority(votes(MAJORITY_VOTE, "veto"))).toBe(false);
    expect(finaliseBlockReason(votes(MAJORITY_VOTE, "love"))).toBeNull();
  });
});
