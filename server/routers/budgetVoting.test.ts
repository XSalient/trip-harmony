/**
 * Budget as a voting section.
 *
 * The section was a journal — append-only rows, no proposal, no vote, no
 * finalise — and the risk in converting it is that it ends up *almost* like the
 * other three. Almost is where the bugs live: a lock that behaves like a
 * destination's rather than a date's, a list that skips the watcher projection
 * (which is exactly how `budget.summary` came to hand every member's cap to
 * anyone who asked), an edit that works on a finalised figure.
 *
 * Input validation runs through a real caller, as `wevotrip.test.ts`
 * does; the rules that need a database are read off the source, as
 * `locking.test.ts` does.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { appRouter } from "./index.js";
import type { TrpcContext } from "../_core/context.js";

const routerDir = import.meta.dirname;
const budget = readFileSync(join(routerDir, "budget.ts"), "utf8");
const db = readFileSync(join(routerDir, "..", "db.ts"), "utf8");

function dbFunction(name: string): string {
  const start = db.indexOf(`export async function ${name}(`);
  expect(start, `${name} should exist in db.ts`).toBeGreaterThan(-1);
  const next = db.indexOf("\nexport ", start + 1);
  return db.slice(start, next === -1 ? undefined : next);
}

function callerFor(userId = 1) {
  const ctx = {
    user: {
      id: userId,
      openId: `test-user-${userId}`,
      email: `test${userId}@example.com`,
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as unknown as TrpcContext;
  return appRouter.createCaller(ctx);
}

describe("proposing a budget", () => {
  it("rejects an amount that is not money", async () => {
    const caller = callerFor();
    await expect(
      caller.budget.create({
        tripId: 1,
        title: "Modest",
        amount: "about a grand",
        scope: "per_person",
      })
    ).rejects.toThrow();
  });

  it("rejects a scope that is not one of the four", async () => {
    const caller = callerFor();
    await expect(
      caller.budget.create({
        tripId: 1,
        title: "Modest",
        amount: "1000",
        scope: "per_household" as any,
      })
    ).rejects.toThrow();
  });

  it("rejects an empty title", async () => {
    const caller = callerFor();
    await expect(
      caller.budget.create({
        tripId: 1,
        title: "",
        amount: "1000",
        scope: "trip_total",
      })
    ).rejects.toThrow();
  });

  it("counts as a Yes, as suggesting a destination does", () => {
    expect(budget).toMatch(/createBudgetProposal[\s\S]{0,900}vote: "love"/);
  });

  it("takes the trip's currency rather than assuming dollars", () => {
    // The alert this section replaced quoted "$" while the trip carried EUR.
    expect(budget).toContain('trip?.currency ?? "USD"');
    expect(budget).not.toContain("($$");
  });
});

describe("finalising", () => {
  const body = dbFunction("setBudgetLock");

  it("clears the trip first — exactly one budget at a time", () => {
    // A trip has several places to sleep and one answer to "how much". This is
    // the `lockDateProposal` shape, not `setDestinationLock`, and getting it
    // the other way round would let two budgets be finalised at once with
    // nothing on screen saying which one counts.
    expect(body).toContain("eq(budgetProposals.tripId, tripId)");
    expect(body).toMatch(
      /selected: false[\s\S]{0,200}tripId[\s\S]{0,200}if \(locked\)/
    );
  });

  it("is admin-only", () => {
    expect(budget).toMatch(
      /setLock:[\s\S]{0,600}requireTripRole\([^)]*"admin"/
    );
  });

  it("alerts once, on finalise, and only those over their own cap", () => {
    expect(budget).toMatch(/if \(input\.locked\)[\s\S]{0,2000}budget_alert/);
    expect(budget).toContain('m.role === "watcher") continue');
    expect(budget).toContain("if (cap == null) continue");
  });
});

describe("a finalised budget is not editable", () => {
  for (const proc of ["edit", "delete"]) {
    it(`${proc} refuses while it is locked`, () => {
      const start = budget.indexOf(`  ${proc}: protectedProcedure`);
      expect(start).toBeGreaterThan(-1);
      const body = budget.slice(start, budget.indexOf("}),", start));
      expect(body).toContain("proposal.selected");
      expect(body).toContain("FORBIDDEN");
    });

    it(`${proc} is for the proposer or an admin, nobody else`, () => {
      const start = budget.indexOf(`  ${proc}: protectedProcedure`);
      const body = budget.slice(start, budget.indexOf("}),", start));
      expect(body).toContain("proposal.proposedBy !== ctx.user.id");
      expect(body).toContain("isTripAdmin");
    });
  }
});

describe("what leaves the process", () => {
  it("projects the list, which the journal never did", () => {
    expect(budget).toMatch(
      /list: protectedProcedure[\s\S]{0,800}projectProposalsForRole/
    );
  });

  it("keeps every cap and the over-cap count away from a watcher", () => {
    expect(budget).toContain("canSeeMemberDetails(role) && leading");
    expect(budget).toContain("canSeeMemberDetails(role) && me");
    expect(budget).toContain("let votersOverCap: number | null = null");
  });

  it("counts people over their cap without naming one of them", () => {
    const summary = budget.slice(
      budget.indexOf("  summary: protectedProcedure")
    );
    expect(summary).toContain(".length");
    // A name or a figure here publishes somebody's finances to the group.
    expect(summary).not.toContain("overBudget: m");
    expect(summary).not.toMatch(
      /votersOverCap[\s\S]{0,200}\.map\(m => m\.user/
    );
  });
});

describe("the group's cap supersedes the member's", () => {
  it("resolves to the group when there is one", () => {
    expect(budget).toContain("function resolvedCap");
    expect(budget).toContain("groupCap ?? member.budgetMax");
  });

  it("is written to the group by the cap dialog, not to the person", () => {
    const trips = readFileSync(join(routerDir, "trips.ts"), "utf8");
    expect(trips).toMatch(
      /updateMemberBudget[\s\S]{0,900}member\.groupId != null[\s\S]{0,200}updateTripGroup/
    );
  });
});

describe("the expense journal is gone", () => {
  it("leaves nothing behind in the server", () => {
    for (const file of ["budget.ts", "referee.ts"]) {
      const src = readFileSync(join(routerDir, file), "utf8");
      expect(src).not.toContain("budgetItem");
      expect(src).not.toContain("BudgetItem");
    }
    expect(db).not.toContain("budgetItems");
  });

  it("takes the table and its two enums with it, in its own migration", () => {
    const sql = readFileSync(
      join(routerDir, "..", "..", "drizzle", "0011_drop_budget_items.sql"),
      "utf8"
    );
    expect(sql).toContain('DROP TABLE IF EXISTS "budget_items"');
    expect(sql).toContain('DROP TYPE IF EXISTS "budget_category"');
    expect(sql).toContain('DROP TYPE IF EXISTS "split_type"');
    // Alone, so it can be held back for a release while the rest lands.
    expect(sql).not.toContain("CREATE TABLE");
  });
});
