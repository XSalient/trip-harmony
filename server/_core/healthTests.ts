/**
 * Exercising a service for real, as opposed to inspecting it.
 *
 * `healthChecks.ts` asks each dependency whether it is there and whether its
 * settings are coherent. That is strictly better than reading environment
 * variables, and it is still not the same as the thing working: Resend can be
 * reachable, the key good and the domain verified while mail never arrives,
 * because the account is suspended or over its limit. Postgres can answer
 * `select 1` from a replica that will refuse the next write.
 *
 * So these do the actual work — send the mail, write the row, call the model,
 * fetch the page — and report what came back. They are separate from the
 * checks, and separate from page load, because each one costs something real:
 * an email in somebody's inbox, a scraper credit, a model call. Nothing here
 * runs unless a person pressed a button, and that person is the **system**
 * admin (`users.role`), not a trip admin (`trip_members.role`) — the spend is
 * the deployment's, so the authority has to be the deployment's too.
 */
import { sql } from "drizzle-orm";

import { config } from "./env.js";
import { describeError, sendHealthTestEmail } from "../utils/mailer.js";
import { invokeLLM } from "./llm.js";
import { logger } from "./logger.js";
import * as db from "../db.js";
import { scrapeListingPage } from "../utils/scraper/index.js";

const log = logger.child({ scope: "healthTest" });

export const SERVICES = ["database", "email", "ai", "scraper"] as const;
export type Service = (typeof SERVICES)[number];

export type TestResult = {
  service: Service;
  /** `false` is a real failure. Something inconclusive says so in `summary`. */
  passed: boolean;
  /** True when the run did not reach a verdict — neither pass nor fail. */
  inconclusive?: boolean;
  summary: string;
  detail?: string;
  durationMs: number;
  facts?: Record<string, string | number | null>;
};

/**
 * A neutral, permanently available page. IANA reserves example.com precisely so
 * that software can point at something without inconveniencing an owner, which
 * is what a smoke test needs and what a real listing URL would not be.
 */
const SCRAPER_PROBE_URL = "https://example.com/";

/**
 * How long a service must rest between tests.
 *
 * Not a security control — it is in memory, and on serverless each cold start
 * forgets it. It is there to stop the ordinary accident: a page left open, a
 * double click, a refresh loop, each one sending another email or spending
 * another scraper credit. The real control on all of these is that the
 * endpoint is admin-only.
 */
const COOLDOWN_MS: Record<Service, number> = {
  database: 0,
  ai: 5_000,
  email: 30_000,
  scraper: 30_000,
};

const lastRunAt = new Map<Service, number>();

/**
 * Test-only. The cooldown is deliberate product behaviour, so it is not
 * configurable at runtime — but one test's run must not decide another's
 * verdict, which is exactly the accident the cooldown is designed to cause.
 */
export function resetHealthTestCooldowns(): void {
  lastRunAt.clear();
}

function cooldownRemaining(service: Service): number {
  const last = lastRunAt.get(service);
  if (last === undefined) return 0;
  return Math.max(0, COOLDOWN_MS[service] - (Date.now() - last));
}

/**
 * A real write, in a transaction, touching nothing that exists.
 *
 * `select 1` proves a connection. It does not prove this connection can write
 * — a read-only replica, a failed-over pooler and an exhausted disk all answer
 * it happily. A temp table with `on commit drop` writes, reads back and cleans
 * itself up inside one transaction, which also pins one pooled client for the
 * whole sequence; without that the create and the insert could land on
 * different backends and the table would not be there.
 */
async function testDatabase(): Promise<Omit<TestResult, "durationMs">> {
  const conn = await db.getDb();
  if (!conn) {
    return {
      service: "database",
      passed: false,
      summary: "There is no database connection to test",
    };
  }

  let readBack: number | null = null;
  await conn.transaction(async tx => {
    await tx.execute(
      sql`create temp table health_write_probe (n integer) on commit drop`
    );
    await tx.execute(sql`insert into health_write_probe (n) values (42)`);
    const result = await tx.execute(sql`select n from health_write_probe`);
    const row = (result.rows as Array<{ n: unknown }>)[0];
    readBack = row?.n == null ? null : Number(row.n);
  });

  if (readBack !== 42) {
    return {
      service: "database",
      passed: false,
      summary: "A row was written but did not read back",
      detail: `Expected 42, got ${String(readBack)}. That should be impossible inside one transaction; treat the connection as suspect.`,
    };
  }

  // Worth knowing on a pass, not just a failure: a replica answers reads and
  // would have refused a write to a real table.
  const meta = await conn.execute(
    sql`select version() as version, pg_is_in_recovery() as replica, current_database() as db`
  );
  const row = (meta.rows as Array<Record<string, unknown>>)[0] ?? {};

  return {
    service: "database",
    passed: true,
    summary: "Wrote a row, read it back, and rolled it away",
    facts: {
      database: String(row.db ?? ""),
      readOnlyReplica: String(row.replica ?? ""),
      // The product and major version; the full string is a paragraph.
      server: String(row.version ?? "")
        .split(" ")
        .slice(0, 2)
        .join(" "),
    },
  };
}

/**
 * Sends a real email, to the address of the person who pressed the button and
 * to no other address. See `sendHealthTestEmail` for why that is not a
 * parameter.
 */
async function testEmail(
  actor: HealthTestActor
): Promise<Omit<TestResult, "durationMs">> {
  if (!actor.email) {
    return {
      service: "email",
      passed: false,
      summary: "Your account has no email address to send to",
      detail:
        "This test only ever sends to the signed-in admin's own address, so there is nowhere to send it. Add an address to your profile.",
    };
  }

  const delivery = await sendHealthTestEmail(actor.email, actor.name);

  if (!delivery.delivered) {
    return {
      service: "email",
      passed: false,
      summary:
        delivery.reason === "not_configured"
          ? "No email provider is configured, so nothing was sent"
          : "The provider refused the send",
      detail: delivery.error,
      facts: { to: actor.email, sender: config.mail.from },
    };
  }

  return {
    service: "email",
    passed: true,
    // Deliberately not "email works". The provider accepted it; an inbox is
    // the only thing that can confirm the rest, and the reader has one.
    summary: `Accepted for delivery to ${actor.email} — check that it arrives`,
    detail:
      "The provider took the message. Spam filtering and the recipient's own rules happen after this point, so an accepted send that never appears means the problem is downstream of us.",
    facts: { to: actor.email, sender: config.mail.from },
  };
}

/** A real model call, the smallest one that still proves the round trip. */
async function testAi(): Promise<Omit<TestResult, "durationMs">> {
  if (!config.ai.isConfigured) {
    return {
      service: "ai",
      passed: false,
      summary: "AI is switched off or has no key",
    };
  }

  const result = await invokeLLM({
    messages: [
      {
        role: "user",
        content: "Reply with the single word: ready",
      },
    ],
  });

  const text = String(result.choices[0]?.message.content ?? "").trim();
  if (!text) {
    return {
      service: "ai",
      passed: false,
      summary: "The model answered with nothing at all",
      detail:
        "A round trip completed but the response carried no text — usually a safety block or a model that rejected the request shape.",
      facts: { model: result.model },
    };
  }

  return {
    service: "ai",
    passed: true,
    summary: `${result.model} answered: "${text.slice(0, 60)}"`,
    facts: { model: result.model },
  };
}

/** One real request through whichever unblocking vendor is configured. */
async function testScraper(): Promise<Omit<TestResult, "durationMs">> {
  const page = await scrapeListingPage(SCRAPER_PROBE_URL);

  if (page.ok) {
    return {
      service: "scraper",
      passed: true,
      summary: `Fetched ${SCRAPER_PROBE_URL} through ${page.provider ?? "the provider"}`,
      facts: { provider: page.provider ?? null, url: SCRAPER_PROBE_URL },
    };
  }

  // Not every refusal is a broken scraper, and saying so is the point.
  if (page.reason === "not-configured") {
    return {
      service: "scraper",
      passed: false,
      inconclusive: true,
      summary: "No scraper is configured, so there was nothing to test",
    };
  }
  if (page.reason === "host-not-allowed") {
    return {
      service: "scraper",
      passed: true,
      inconclusive: true,
      summary:
        "The scraper is configured, but its host allowlist refused the probe URL",
      detail: `SCRAPER_HOSTS does not include ${SCRAPER_PROBE_URL}. The vendor was never called, so this says nothing about whether it works — it does confirm the allowlist is being enforced.`,
      facts: { provider: page.provider ?? null },
    };
  }

  return {
    service: "scraper",
    passed: false,
    summary: `The scraper returned "${page.reason}"`,
    detail:
      page.reason === "misconfigured"
        ? "A provider is set but its settings do not resolve into a request."
        : "The vendor was called and the fetch did not succeed. Check the account's credit balance first.",
    facts: { provider: page.provider ?? null, url: SCRAPER_PROBE_URL },
  };
}

/** Who asked. Never widened to carry a destination — see `testEmail`. */
export type HealthTestActor = {
  id: number;
  name: string;
  email: string | null;
};

export async function runServiceTest(
  service: Service,
  actor: HealthTestActor
): Promise<TestResult> {
  const waitMs = cooldownRemaining(service);
  if (waitMs > 0) {
    return {
      service,
      passed: false,
      inconclusive: true,
      summary: `Just ran — try again in ${Math.ceil(waitMs / 1000)}s`,
      detail:
        "Each run costs something real (an email, a scraper credit, a model call), so they are spaced out.",
      durationMs: 0,
    };
  }
  lastRunAt.set(service, Date.now());

  const startedAt = Date.now();
  try {
    const result =
      service === "database"
        ? await testDatabase()
        : service === "email"
          ? await testEmail(actor)
          : service === "ai"
            ? await testAi()
            : await testScraper();

    const finished = { ...result, durationMs: Date.now() - startedAt };
    log.info("health test run", {
      service,
      passed: finished.passed,
      actorUserId: actor.id,
      durationMs: finished.durationMs,
    });
    return finished;
  } catch (err) {
    // A thrown error is a result, not a crash: the screen exists to report
    // what the dependency did, and "it threw this" is exactly that.
    log.error("health test threw", { service, actorUserId: actor.id, err });
    return {
      service,
      passed: false,
      summary: "The test threw before it could finish",
      detail: describeError(err),
      durationMs: Date.now() - startedAt,
    };
  }
}
