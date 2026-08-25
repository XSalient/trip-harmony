/**
 * What counts as somebody stating a budget or a date, and what does not.
 *
 * The expensive failure here is a false positive, not a missed one. A wrong
 * suggestion is offered to the whole group under somebody's name, and the
 * cost is that nobody reads the next one — so the numbers that are *not*
 * money ("no more than 10 stairs", "minimum 3 bathrooms") are asserted as
 * carefully as the ones that are.
 *
 * The second thing asserted is idempotence. The same text saved twice must
 * produce the same fingerprints, or nothing suppresses anything and the same
 * card returns on every save.
 */
import { describe, it, expect } from "vitest";
import {
  budgetFingerprint,
  capSuggestion,
  dateFingerprint,
  detectSuggestions,
  suppress,
  type Suggestion,
} from "./suggestions.js";

const today = new Date("2026-08-24T00:00:00Z");
const detect = (fields: Record<string, string>) =>
  detectSuggestions(fields as any, { today, currency: "GBP" });

const budgets = (s: Suggestion[]) => s.filter(x => x.kind === "budget");
const dates = (s: Suggestion[]) => s.filter(x => x.kind === "date");

describe("money", () => {
  it("reads a figure per family as a per-family proposal", () => {
    const [b] = budgets(
      detect({ strongPreferences: "We can do about £1,200 a family." })
    );
    expect(b).toMatchObject({
      amount: "1200.00",
      currency: "GBP",
      scope: "per_group",
    });
    expect(b.excerpt).toContain("1,200");
  });

  it("reads per person, per adult and a trip total", () => {
    expect(
      budgets(detect({ openComments: "£600 each works" }))[0]
    ).toMatchObject({ scope: "per_person" });
    expect(
      budgets(detect({ openComments: "£900 per adult" }))[0]
    ).toMatchObject({ scope: "per_adult" });
    expect(budgets(detect({ openComments: "£5,000 all in" }))[0]).toMatchObject(
      { scope: "trip_total", amount: "5000.00" }
    );
  });

  it("takes a three-letter code over the trip's currency", () => {
    expect(
      budgets(detect({ openComments: "Happy up to EUR 1500 each" }))[0]
    ).toMatchObject({ currency: "EUR", scope: "per_person" });
  });

  it("reads a bare figure only when the sentence says it is money", () => {
    expect(
      budgets(detect({ openComments: "Budget is around 1500 per person" }))
    ).toHaveLength(1);
  });

  it("never turns a number that is not money into a budget", () => {
    // Every one of these is real text from the placeholder copy on the form.
    for (const text of [
      "No more than 10 stairs",
      "minimum 3 attached bathrooms",
      "large kitchen with 4+ burners",
      "secure bike storage for 4 adults",
      "Ground floor or elevator only",
    ])
      expect(budgets(detect({ mustHaves: text })), text).toHaveLength(0);
  });

  it("offers nothing from the dealbreakers box", () => {
    // "Nothing over £2,000" is a limit. Proposing it to the group inverts it.
    expect(detect({ avoids: "Nothing over £2,000 per family" })).toEqual([]);
  });

  it("does not read a shouted three-letter word as a currency", () => {
    // The failure this whole module is shaped around: a bare [A-Z]{3} beside a
    // number made "WE ARE FREE IN MAY 2027" a budget of 2027 MAY, and a flight
    // reference a budget of 1234 ABC — both offered to the group by name.
    for (const text of [
      "WE ARE FREE IN MAY 2027",
      "Flight ref ABC 1234 is booked",
      "Kids in ROW 12 please",
    ])
      expect(budgets(detect({ openComments: text })), text).toHaveLength(0);
  });

  it("reads the currency written after the figure, and written as a word", () => {
    expect(
      budgets(detect({ openComments: "around 1200 GBP per family" }))[0]
    ).toMatchObject({ currency: "GBP", amount: "1200.00", scope: "per_group" });
    expect(
      budgets(detect({ openComments: "2000 euros per household" }))[0]
    ).toMatchObject({ currency: "EUR", scope: "per_group" });
    expect(
      budgets(detect({ openComments: "1500 usd all in" }))[0]
    ).toMatchObject({ currency: "USD", scope: "trip_total" });
  });

  it("reads pp stuck to the figure as per person", () => {
    // "£1200pp" is how it is typed, and \bpp\b sees no boundary after a digit.
    expect(budgets(detect({ openComments: "£1200pp" }))[0]).toMatchObject({
      scope: "per_person",
      amount: "1200.00",
    });
    expect(budgets(detect({ openComments: "1200pp works" }))[0]).toMatchObject({
      scope: "per_person",
    });
  });

  it("keeps a headcount next to the word budget out of it", () => {
    expect(
      budgets(detect({ openComments: "budget for 10 people, 3 nights" }))
    ).toHaveLength(0);
  });

  it("leaves a nightly figure alone, having no scope to say it in", () => {
    // There is no per-night scope, and calling £150 a night a trip total says
    // something the person did not say.
    for (const text of [
      "keep it under $150 a night",
      "budget of 90 per person per day",
    ])
      expect(budgets(detect({ openComments: text })), text).toHaveLength(0);
  });

  it("quotes the whole sentence, decimal point and all", () => {
    const [b] = budgets(
      detect({ openComments: "We could do £1,200.50 per family." })
    );
    expect(b.amount).toBe("1200.50");
    expect(b.excerpt).toBe("We could do £1,200.50 per family");
  });
});

describe("dates", () => {
  it("reads a day range with a month", () => {
    const [d] = dates(detect({ openComments: "We're free 12-19 September." }));
    expect(d).toMatchObject({
      startDate: "2026-09-12",
      endDate: "2026-09-19",
    });
  });

  it("assumes the next occurrence of a month that has passed", () => {
    // August 2026 is now; "in March" means 2027, not eighteen months ago.
    const [d] = dates(detect({ openComments: "Best for us in March" }));
    expect(d.startDate).toBe("2027-03-01");
    expect(d.endDate).toBe("2027-03-31");
  });

  it("reads a bare month as the whole month, ending on its real last day", () => {
    const [d] = dates(detect({ openComments: "Anytime in February 2028" }));
    // A leap year: 29 days, not 28 and not a hardcoded 30.
    expect(d.endDate).toBe("2028-02-29");
  });

  it("reads an explicit ISO range", () => {
    const [d] = dates(
      detect({ openComments: "2027-03-01 to 2027-03-08 suits us" })
    );
    expect(d).toMatchObject({
      startDate: "2027-03-01",
      endDate: "2027-03-08",
    });
  });

  it("ignores a backwards or impossible range", () => {
    expect(dates(detect({ openComments: "19-12 September" }))).toHaveLength(0);
    expect(dates(detect({ openComments: "3-45 September" }))).toHaveLength(0);
  });

  it("reads the month written before the days, and ordinals", () => {
    // Half of everybody writes it this way round, and "Sept" is not spelled out.
    for (const text of [
      "September 12-19 2026",
      "Sept 12th–19th 2026",
      "12th to 19th of September 2026",
      "free 12 until 19 Sep 2026",
    ]) {
      const [d] = dates(detect({ openComments: text }));
      expect(d, text).toMatchObject({
        startDate: "2026-09-12",
        endDate: "2026-09-19",
      });
    }
  });

  it("reads a month and a year with no preposition in front", () => {
    const found = dates(detect({ openComments: "Free JUL 2027 or AUG 2027" }));
    expect(found.map(d => d.startDate)).toEqual(["2027-07-01", "2027-08-01"]);
  });

  it("offers a range once, not also as the whole month it sits in", () => {
    expect(
      dates(detect({ openComments: "12-19 September 2027" }))
    ).toHaveLength(1);
  });

  it("refuses a day the month does not have", () => {
    expect(dates(detect({ openComments: "29-31 September" }))).toHaveLength(0);
    expect(dates(detect({ openComments: "28-30 February 2027" }))).toHaveLength(
      0
    );
  });

  it("does not offer dates that have already been", () => {
    // Nobody proposes last January, and the group cannot vote on it.
    expect(dates(detect({ openComments: "2020-01-01 to 2020-01-08" }))).toEqual(
      []
    );
  });
});

describe("the private cap, offered out loud", () => {
  it("defaults to a family figure for somebody in a family", () => {
    expect(
      capSuggestion("1400", { currency: "GBP", inGroup: true })
    ).toMatchObject({ scope: "per_group", amount: "1400.00" });
  });

  it("defaults to a per-person figure for somebody in none", () => {
    expect(capSuggestion("1400", { currency: "GBP" })).toMatchObject({
      scope: "per_person",
    });
  });

  it("offers nothing when there is no cap", () => {
    expect(capSuggestion(null, {})).toBeNull();
    expect(capSuggestion("0", {})).toBeNull();
    expect(capSuggestion("not a number", {})).toBeNull();
  });
});

describe("a suggestion does not come back", () => {
  const text = { strongPreferences: "About £1,200 a family, free in March." };

  it("gives the same text the same fingerprints every time", () => {
    expect(detect(text).map(s => s.fingerprint)).toEqual(
      detect(text).map(s => s.fingerprint)
    );
  });

  it("is dropped once it is a proposal on the trip", () => {
    const found = detect(text);
    const asProposals = [budgetFingerprint("1200.00", "per_group")];
    expect(suppress(found, asProposals, [])).toHaveLength(found.length - 1);
  });

  it("is dropped once somebody has dismissed it", () => {
    const found = detect(text);
    expect(
      suppress(found, [], [dateFingerprint("2027-03-01", "2027-03-31")])
    ).toHaveLength(found.length - 1);
  });

  it("offers the same figure written twice only once", () => {
    expect(
      budgets(
        detect({
          mustHaves: "£1,200 a family",
          openComments: "again, £1,200 per family",
        })
      )
    ).toHaveLength(1);
  });
});
