/**
 * The content filter, and mostly what it must *not* catch.
 *
 * A filter that rejects abuse is easy; a filter that rejects "we scraped
 * through" or a trip to Scunthorpe gets switched off by the first person it
 * embarrasses. The false-positive cases below are the ones worth having.
 */
import { describe, expect, it } from "vitest";
import {
  blockedTermMessage,
  findBlockedTerm,
  normaliseForFilter,
} from "./moderation.js";

describe("normaliseForFilter", () => {
  it("folds case, accents and punctuation away", () => {
    expect(normaliseForFilter("Héllo, WORLD!")).toBe("hello world");
  });

  it("collapses a letter run of three or more, but leaves doubles alone", () => {
    expect(normaliseForFilter("soooo")).toBe("so");
    expect(normaliseForFilter("pass all")).toBe("pass all");
  });

  it("maps the substitutions used to slip past a wordlist", () => {
    expect(normaliseForFilter("h3ll0")).toBe("hello");
    expect(normaliseForFilter("@sk")).toBe("ask");
  });

  it("is empty for a string with no letters in it", () => {
    expect(normaliseForFilter("123 !!! ***")).toBe("");
  });
});

describe("findBlockedTerm", () => {
  it("passes ordinary trip talk", () => {
    for (const text of [
      "Can we push the dates back a week?",
      "The villa sleeps eight and has parking.",
      "£1200 a family, flights not included.",
      "I'd rather not do the 6am flight again.",
      "",
    ]) {
      expect(findBlockedTerm(text), text).toBeNull();
    }
  });

  it("catches abuse, and names the term it caught", () => {
    expect(findBlockedTerm("this is shit")).toBe("shit");
    expect(findBlockedTerm("you absolute bastard")).toBe("bastard");
  });

  it("sees through padding, case and substitutions", () => {
    for (const text of ["F.U.C.K this", "fuuuuck", "sh1t", "SHIT", "$hit"]) {
      expect(findBlockedTerm(text), text).not.toBeNull();
    }
  });

  it("catches compounds of the infix terms", () => {
    expect(findBlockedTerm("that's bullshit")).toBe("shit");
    expect(findBlockedTerm("motherfucker")).toBe("fuck");
  });

  it("catches ordinary inflections of the prefix terms", () => {
    expect(findBlockedTerm("bitches")).toBe("bitch");
    expect(findBlockedTerm("whores")).toBe("whore");
  });

  // The whole reason the prefix and infix rules are separate.
  it("does not fire on innocent words that contain a term", () => {
    for (const text of [
      "we scraped through customs",
      "grapes and cheese for the picnic",
      "the classic route",
      "book an assistant",
      "a glass of wine",
      "therapist appointment",
      "shiitake mushrooms",
    ]) {
      expect(findBlockedTerm(text), text).toBeNull();
    }
  });

  it("does not fire on the place names a wordlist classically breaks on", () => {
    for (const text of [
      "three nights in Scunthorpe",
      "driving through Penistone",
      "Cockburn Street, Edinburgh",
    ]) {
      expect(findBlockedTerm(text), text).toBeNull();
    }
  });
});

describe("blockedTermMessage", () => {
  it("names both the field and the word, so the fix is obvious", () => {
    const msg = blockedTermMessage("comment", "shit");
    expect(msg).toContain("comment");
    expect(msg).toContain("shit");
  });
});
