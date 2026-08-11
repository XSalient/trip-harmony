/**
 * The seeder's safety policy is the half that deletes rows, so it is tested
 * without a database in the way. Everything here is about refusing, because
 * that is the behaviour a mistake needs.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEMO_PASSWORD,
  DEMO_PASSWORD_ENV_VAR,
  UsageError,
  databaseHost,
  decideRun,
  isLocalDatabase,
  parseArgs,
} from "./options.js";

const LOCAL = "postgresql://postgres@127.0.0.1:5432/back_to_travelling_dev";
const REMOTE =
  "postgresql://postgres.abcdef:secret@aws-0-eu-west-2.pooler.supabase.com:5432/postgres";

const options = (argv: string[] = []) => parseArgs(argv, {});

/** `parseArgs` with only the password variable set. */
const withEnvPassword = (value: string, argv: string[] = []) =>
  parseArgs(argv, { [DEMO_PASSWORD_ENV_VAR]: value });

describe(`${DEMO_PASSWORD_ENV_VAR}`, () => {
  const GOOD = "not-the-published-one";

  it("supplies the password, so it never becomes an argument", () => {
    const parsed = withEnvPassword(GOOD);
    expect(parsed.password).toBe(GOOD);
    expect(parsed.passwordWasGiven).toBe(true);
  });

  it("unlocks a production run on its own", () => {
    const decision = decideRun(
      { databaseUrl: REMOTE, appEnv: "production" },
      withEnvPassword(GOOD, ["--allow-production"])
    );
    expect(decision.allowed).toBe(true);
  });

  it("does not let the published password through by the back door", () => {
    // The whole point of the production guard: putting the known password in
    // the environment must not count as having chosen one.
    const parsed = withEnvPassword(DEFAULT_DEMO_PASSWORD);
    expect(parsed.passwordWasGiven).toBe(false);

    const decision = decideRun(
      { databaseUrl: REMOTE, appEnv: "production" },
      withEnvPassword(DEFAULT_DEMO_PASSWORD, ["--allow-production"])
    );
    expect(decision.allowed).toBe(false);
  });

  it("ignores a value too short to be a password", () => {
    expect(withEnvPassword("short").passwordWasGiven).toBe(false);
    expect(withEnvPassword("short").password).toBe(DEFAULT_DEMO_PASSWORD);
  });

  it("ignores whitespace left by a careless copy-paste", () => {
    expect(withEnvPassword("   ").passwordWasGiven).toBe(false);
    expect(withEnvPassword(`  ${GOOD}  `).password).toBe(GOOD);
  });

  it("yields to an explicit --password", () => {
    const parsed = withEnvPassword(GOOD, ["--password=chosen-on-the-line"]);
    expect(parsed.password).toBe("chosen-on-the-line");
  });
});

describe("parseArgs", () => {
  it("seeds by default", () => {
    const parsed = options();
    expect(parsed.mode).toBe("seed");
    expect(parsed.password).toBe(DEFAULT_DEMO_PASSWORD);
    expect(parsed.passwordWasGiven).toBe(false);
  });

  it("reads the flags", () => {
    const parsed = options([
      "--clean",
      "--allow-remote",
      "--allow-production",
      "--password=something-else",
    ]);
    expect(parsed).toMatchObject({
      mode: "clean",
      allowRemote: true,
      allowProduction: true,
      password: "something-else",
      passwordWasGiven: true,
    });
  });

  it("rejects a password too short to be accepted at registration", () => {
    // `auth.register` requires eight characters, so a shorter one would seed
    // accounts nobody could re-create through the UI.
    expect(() => options(["--password=short"])).toThrow(UsageError);
  });

  it("rejects an argument it does not know", () => {
    expect(() => options(["--force"])).toThrow(/Unknown argument/);
  });
});

describe("databaseHost", () => {
  it("names the host without the credentials", () => {
    expect(databaseHost(REMOTE)).toBe("aws-0-eu-west-2.pooler.supabase.com");
    expect(databaseHost(REMOTE)).not.toContain("secret");
  });

  it("is null for something that is not a URL", () => {
    expect(databaseHost("not-a-url")).toBeNull();
  });
});

describe("isLocalDatabase", () => {
  it("recognises the loopback hosts", () => {
    expect(isLocalDatabase(LOCAL)).toBe(true);
    expect(isLocalDatabase("postgresql://u@localhost:5432/db")).toBe(true);
  });

  it("treats anything it cannot recognise as remote", () => {
    expect(isLocalDatabase(REMOTE)).toBe(false);
    // The failure that matters is calling a managed host local, so an
    // unparseable string is remote rather than local.
    expect(isLocalDatabase("garbage")).toBe(false);
  });
});

describe("decideRun", () => {
  it("allows a local development database with no flags", () => {
    const decision = decideRun(
      { appEnv: "development", databaseUrl: LOCAL },
      options()
    );
    expect(decision).toMatchObject({ allowed: true, local: true });
  });

  it("refuses when nothing is configured", () => {
    const decision = decideRun(
      { appEnv: "development", databaseUrl: "" },
      options()
    );
    expect(decision).toMatchObject({ allowed: false });
    expect((decision as { reason: string }).reason).toMatch(/DATABASE_URL/);
  });

  it("refuses a remote database until it is named out loud", () => {
    const decision = decideRun(
      { appEnv: "development", databaseUrl: REMOTE },
      options()
    );
    expect(decision.allowed).toBe(false);
    expect((decision as { reason: string }).reason).toMatch(/--allow-remote/);
  });

  it("names the host it refused, so the mistake is visible", () => {
    const decision = decideRun(
      { appEnv: "development", databaseUrl: REMOTE },
      options()
    );
    expect((decision as { reason: string }).reason).toContain(
      "aws-0-eu-west-2.pooler.supabase.com"
    );
  });

  it("allows a remote database once --allow-remote is passed", () => {
    const decision = decideRun(
      { appEnv: "development", databaseUrl: REMOTE },
      options(["--allow-remote"])
    );
    expect(decision).toMatchObject({ allowed: true, local: false });
  });

  it("refuses production even with --allow-remote", () => {
    // --allow-remote is the weaker claim; it must not be mistaken for consent
    // to write to production.
    const decision = decideRun(
      { appEnv: "production", databaseUrl: REMOTE },
      options(["--allow-remote"])
    );
    expect(decision.allowed).toBe(false);
    expect((decision as { reason: string }).reason).toMatch(
      /--allow-production/
    );
  });

  it("refuses production with the published default password", () => {
    const decision = decideRun(
      { appEnv: "production", databaseUrl: REMOTE },
      options(["--allow-production"])
    );
    expect(decision.allowed).toBe(false);
    expect((decision as { reason: string }).reason).toMatch(/default password/);
  });

  it("allows production when it is asked for deliberately and given a password", () => {
    const decision = decideRun(
      { appEnv: "production", databaseUrl: REMOTE },
      options(["--allow-production", "--password=not-the-published-one"])
    );
    expect(decision).toMatchObject({ allowed: true, local: false });
  });

  it("lets --allow-production stand in for --allow-remote", () => {
    // Production is remote by definition; demanding both flags would be
    // ceremony rather than safety.
    const decision = decideRun(
      { appEnv: "production", databaseUrl: REMOTE },
      options(["--allow-production", "--password=not-the-published-one"])
    );
    expect(decision.allowed).toBe(true);
  });
});
