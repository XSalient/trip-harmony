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
  pendingVoteCount,
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

/**
 * Nobody is ever told to do something they are not allowed to do.
 *
 * The trip page derived "waiting on your vote" by filtering for proposals with
 * no vote from the reader — which is every open proposal when the reader is a
 * watcher, because a watcher cannot vote on any of them. The screen showed
 * "9 waiting on your vote" directly above the notice saying voting is for
 * tripmates.
 *
 * The count takes the role now, so the rule cannot be left out by accident.
 * These are the boundaries worth pinning: the role gate, the loading state,
 * and the two ways a proposal stops counting.
 */
describe("pendingVoteCount", () => {
  const ME = 7;
  const open = { selected: false, votes: [{ userId: 99 }] };
  const mine = { selected: false, votes: [{ userId: 99 }, { userId: ME }] };
  const finalised = { selected: true, votes: [{ userId: 99 }] };

  it("is zero for a watcher, however many proposals are open", () => {
    expect(pendingVoteCount([open, open, open], ME, "watcher")).toBe(0);
  });

  it("counts open proposals the member has not voted on", () => {
    expect(pendingVoteCount([open, open, mine], ME, "tripmate")).toBe(2);
    expect(pendingVoteCount([open, open, mine], ME, "admin")).toBe(2);
  });

  it("does not count a proposal the group has finalised", () => {
    expect(pendingVoteCount([finalised, open], ME, "tripmate")).toBe(1);
  });

  it("is zero before the role is known, and for a non-member", () => {
    expect(pendingVoteCount([open, open], ME, null)).toBe(0);
    expect(pendingVoteCount([open, open], ME, undefined)).toBe(0);
  });

  it("is zero when there is no signed-in reader to be waiting on", () => {
    expect(pendingVoteCount([open], undefined, "tripmate")).toBe(0);
    expect(pendingVoteCount([open], null, "tripmate")).toBe(0);
  });

  it("handles an absent or empty proposal list", () => {
    expect(pendingVoteCount(undefined, ME, "tripmate")).toBe(0);
    expect(pendingVoteCount(null, ME, "tripmate")).toBe(0);
    expect(pendingVoteCount([], ME, "tripmate")).toBe(0);
  });

  it("counts a proposal nobody has voted on at all", () => {
    expect(pendingVoteCount([{ selected: false }], ME, "tripmate")).toBe(1);
  });
});
