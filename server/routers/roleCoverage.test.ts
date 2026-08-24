/**
 * Every procedure states the role it needs, and every screen asks before it
 * offers a control.
 *
 * The watcher rules were written once and then only half-applied: the API had
 * `requireTripRole` on nearly everything (`comments.list` was the exception,
 * and it checked nothing at all), while the client had the contribute rule on
 * the dashboard and nowhere else — so a watcher opening `/trips/1/dates` was
 * shown vote buttons, an Add button and a comment box, all of which the server
 * then refused.
 *
 * Testing one page, or one endpoint, is what let that happen. These two sweeps
 * are deliberately structural: they fail when the *next* endpoint or screen is
 * added without a role on it, which is the only failure mode worth catching
 * here. The behaviour of the rules themselves is asserted in `roles.test.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRIP_ROLES } from "../../shared/roles.js";
import { appRouter } from "./index.js";
import type { TrpcContext } from "../_core/context.js";

const routerDir = import.meta.dirname;
const clientPages = join(routerDir, "..", "..", "client", "src", "pages");
const readRouter = (file: string) =>
  readFileSync(join(routerDir, file), "utf8");
const readPage = (file: string) =>
  readFileSync(join(clientPages, file), "utf8");

/**
 * Splits a router file into `{ name, body }` per procedure.
 *
 * Crude on purpose — a real parser would be a dependency, and the shape it
 * relies on ("  name: xProcedure") is the shape every router in this directory
 * already has. A file that stops matching it fails loudly here rather than
 * quietly dropping out of the sweep, because `expect(procedures).not.toHaveLength(0)`
 * runs for every file.
 */
function proceduresOf(source: string): Array<{ name: string; body: string }> {
  const header = /^ {2}(\w+): (?:public|protected|admin)Procedure/gm;
  const starts: Array<{ name: string; at: number }> = [];
  for (const m of source.matchAll(header)) {
    starts.push({ name: m[1], at: m.index! });
  }
  return starts.map((s, i) => ({
    name: s.name,
    body: source.slice(s.at, starts[i + 1]?.at ?? source.length),
  }));
}

/**
 * The routers that answer for something other than a trip, and why.
 *
 * Everything else in this directory is trip-scoped and swept below. Naming the
 * exceptions rather than the subjects is deliberate: a new router file has to
 * be classified here before this suite will pass, so it cannot join the API by
 * being overlooked — which is how a hardcoded list of ten would eventually
 * miss the eleventh.
 */
const NOT_TRIP_SCOPED: Record<string, string> = {
  "admin.ts": "App admins, held by the person not the membership.",
  "auth.ts": "Sessions. There is no trip yet.",
  "passkeys.ts": "Credentials on an account.",
  "notifications.ts": "A user's own feed, scoped by user id in every query.",
  "matchAnalysis.ts": "Helpers, not a router — it exports no procedures.",
  "index.ts": "The table of contents.",
  "_shared.ts": "Helpers, including `requireTripRole` itself.",
};

/**
 * Trip-scoped routers, and the procedures in them that legitimately carry no
 * trip role — each with the reason, because "it doesn't need one" is exactly
 * the assumption that put `comments.list` in the clear for a year.
 */
const TRIP_ROUTERS: Record<string, Record<string, string>> = {
  "dates.ts": {},
  "destinations.ts": {},
  "accommodations.ts": {},
  "budget.ts": {},
  "groups.ts": {},
  "preferences.ts": {},
  "referee.ts": {},
  "comments.ts": {
    delete: "Finds the comment first, then checks the role on its own trip.",
  },
  "suggestions.ts": {},
  "contacts.ts": {
    list: "A user's own address book. Not trip-scoped.",
    add: "A user's own address book. Not trip-scoped.",
    remove: "A user's own address book, scoped by owner in the query.",
    groups: "A user's own saved families. Not trip-scoped.",
    createGroup: "A user's own address book. Not trip-scoped.",
    renameGroup: "A user's own address book, scoped by owner in the query.",
    removeGroup: "A user's own address book, scoped by owner in the query.",
    removeGroupMember:
      "A user's own address book, scoped by owner through the group.",
  },
  "trips.ts": {
    list: "The caller's own memberships.",
    myRole: "Answers 'what am I here', so it cannot require being anything.",
    getByInviteCode: "Public by design — the marketing tour reads it.",
    create: "There is no trip yet to have a role on.",
    join: "The caller is becoming a member; membership is what it checks.",
    declineInvite: "Refusing an invite is not an act on the trip.",
  },
};

/**
 * Wrappers that stand in for a direct `requireTripRole` call, each asserted
 * below to make one. The list is short on purpose: every entry is a place the
 * sweep is reading a name instead of a check.
 */
const VERIFIED_WRAPPERS = ["requireGroupAccess("] as const;

describe("every trip-scoped procedure states the role it needs", () => {
  it("every wrapper the sweep trusts really does check a role", () => {
    const groups = readRouter("groups.ts");
    const wrapper = groups.slice(
      groups.indexOf("async function requireGroupAccess(")
    );
    const body = wrapper.slice(0, wrapper.indexOf("\n}"));
    // It must demand at least a tripmate, and it must refuse anyone acting on
    // a group that is not theirs unless they are an admin.
    expect(body).toContain('requireTripRole(tripId, userId, "tripmate")');
    expect(body).toContain('member.role === "admin"');
    expect(body).toContain("FORBIDDEN");
  });

  it("knows about every router in the directory", () => {
    const onDisk = readdirSync(routerDir).filter(
      f => f.endsWith(".ts") && !f.endsWith(".test.ts")
    );
    const classified = new Set([
      ...Object.keys(TRIP_ROUTERS),
      ...Object.keys(NOT_TRIP_SCOPED),
    ]);
    // A new router must be called trip-scoped or not before it can ship. This
    // caught nothing on the day it was written; it exists for the day a domain
    // is added and this sweep would otherwise have quietly skipped it.
    expect(onDisk.filter(f => !classified.has(f))).toEqual([]);
  });

  for (const [file, exempt] of Object.entries(TRIP_ROUTERS)) {
    const procedures = proceduresOf(readRouter(file));

    it(`${file} is still shaped the way this sweep reads`, () => {
      expect(procedures.length).toBeGreaterThan(0);
    });

    for (const { name, body } of procedures) {
      const reason = exempt[name];
      if (reason) {
        it(`${file} · ${name} is exempt: ${reason}`, () => {
          expect(reason.length).toBeGreaterThan(0);
        });
        continue;
      }

      it(`${file} · ${name} checks the caller's role`, () => {
        const checks =
          /requireTripRole\(|tripRoleOf\(/.test(body) &&
          // …against a real role, not a typo that silently passes.
          (body.includes("tripRoleOf(") ||
            TRIP_ROLES.some(role => body.includes(`"${role}"`)));
        // A named wrapper counts, but only one this suite has verified calls
        // `requireTripRole` itself — see the assertion below. A wrapper is
        // otherwise exactly how a role check disappears while still reading
        // like one at the call site.
        expect(checks || VERIFIED_WRAPPERS.some(w => body.includes(w))).toBe(
          true
        );
      });
    }
  }
});

/**
 * The screens. Not a rendering test — there is no DOM in this suite — but a
 * check that each page derives its permissions from the one hook and gates the
 * controls that need it. It is the cheapest thing that fails when screen number
 * eleven arrives with vote buttons and no role.
 */
const CONTRIBUTE_MUTATIONS =
  /\.(propose|vote|unvote|create|add|edit|delete|clone|save)\.useMutation/;

const TRIP_PAGES = [
  "TripDashboard.tsx",
  "TripDates.tsx",
  "TripDestinations.tsx",
  "TripAccommodations.tsx",
  "TripBudget.tsx",
  "TripPreferences.tsx",
  "TripMembers.tsx",
  "TripReferee.tsx",
];

describe("every trip screen asks for the role before offering a control", () => {
  for (const page of TRIP_PAGES) {
    const source = readPage(page);

    it(`${page} gets its role from useTripRole`, () => {
      expect(source).toContain("useTripRole(tripId)");
    });

    it(`${page} never re-derives the caller's role itself`, () => {
      // `myRole?.role === "admin"` in nine files, and the contribute rule in
      // exactly one of them, is what the hook replaced. Reading the query
      // directly is how that drifts apart again — comparing some *other*
      // member's role is fine, which is why this looks for `myRole` and not
      // for the strings.
      expect(source).not.toContain("trips.myRole.useQuery");
      expect(source).not.toContain("myRole?.role");
    });

    it(`${page} gates its write controls on the role it fetched`, () => {
      if (!CONTRIBUTE_MUTATIONS.test(source)) return; // read-only screen
      expect(source).toMatch(/canContribute|canAdminister|canSeeDetails/);
    });
  }
});

describe("the comment thread is never rendered without a role", () => {
  for (const page of [
    "TripDates.tsx",
    "TripDestinations.tsx",
    "TripAccommodations.tsx",
  ]) {
    it(`${page} passes canContribute to ProposalComments`, () => {
      const source = readPage(page);
      const at = source.indexOf("<ProposalComments");
      expect(at).toBeGreaterThan(-1);
      const element = source.slice(at, source.indexOf("/>", at));
      expect(element).toContain("canContribute={canContribute}");
    });
  }
});

/**
 * And the checks actually run, before anything else does.
 *
 * With no connection string configured `getDb()` returns null, so the
 * membership lookup finds nothing and every trip-scoped procedure must refuse.
 * That is the property worth asserting without a database: the refusal comes
 * from the role check at the top, not from a query failing later on.
 */
function callerFor(userId = 1) {
  const ctx: TrpcContext = {
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
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describe("the server refuses a non-member on every trip-scoped read", () => {
  const caller = callerFor();

  const reads: Array<[string, () => Promise<unknown>]> = [
    ["dates.list", () => caller.dates.list({ tripId: 1 })],
    ["destinations.list", () => caller.destinations.list({ tripId: 1 })],
    ["accommodations.list", () => caller.accommodations.list({ tripId: 1 })],
    ["budget.list", () => caller.budget.list({ tripId: 1 })],
    ["budget.summary", () => caller.budget.summary({ tripId: 1 })],
    ["preferences.getMy", () => caller.preferences.getMy({ tripId: 1 })],
    ["referee.messages", () => caller.referee.messages({ tripId: 1 })],
    ["trips.members", () => caller.trips.members({ tripId: 1 })],
    ["trips.invites", () => caller.trips.invites({ tripId: 1 })],
    [
      "comments.list",
      () =>
        caller.comments.list({
          tripId: 1,
          proposalType: "date",
          proposalId: 1,
        }),
    ],
    [
      "comments.voters",
      () =>
        caller.comments.voters({
          tripId: 1,
          proposalType: "date",
          proposalId: 1,
        }),
    ],
  ];

  for (const [name, call] of reads) {
    it(`${name} refuses`, async () => {
      await expect(call()).rejects.toThrow(/not a member|Watchers|admins/i);
    });
  }
});

describe("the paid AI helpers are trip-scoped too", () => {
  const caller = callerFor();

  it("dates.parseNatural refuses a non-member before calling a model", async () => {
    await expect(
      caller.dates.parseNatural({ tripId: 1, text: "any weekend in July" })
    ).rejects.toThrow(/not a member/i);
  });

  it("accommodations.fetchFromUrl refuses a non-member", async () => {
    await expect(
      caller.accommodations.fetchFromUrl({
        tripId: 1,
        url: "https://example.com/listing",
      })
    ).rejects.toThrow(/not a member/i);
  });

  it("accommodations.parseAttributes refuses a non-member", async () => {
    await expect(
      caller.accommodations.parseAttributes({ tripId: 1, text: "pool, wifi" })
    ).rejects.toThrow(/not a member/i);
  });
});
