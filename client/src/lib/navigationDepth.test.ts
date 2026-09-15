/**
 * The rule the back arrow depends on: is there a screen of ours behind this one?
 *
 * Modelled against a fake `history` rather than a real browser, in the same
 * spirit as `sessionCache.test.ts` — the rule is a plain function over a
 * history-shaped object, which is why it can be tested without a DOM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  canGoBack,
  depthOf,
  fromOf,
  isBehind,
  trackNavigationDepth,
} from "./navigationDepth";

/**
 * A history stack that behaves like the browser's: pushing truncates anything
 * ahead, going back moves the cursor and fires `popstate`, and `replaceState`
 * rewrites the entry under the cursor without moving it.
 *
 * `pushState` dispatches an event because wouter patches the real one to do
 * exactly that — it is the only way to observe a push you did not make.
 */
class FakeHistory {
  entries: unknown[] = [null];
  /** What each entry is showing, so the tracker can read a path off it. */
  paths: string[] = ["/"];
  index = 0;
  readonly target = new EventTarget();

  get state() {
    return this.entries[this.index];
  }

  /** Enough of `window.location` for the tracker. */
  readonly location = {
    pathname: "/",
  };

  private show() {
    this.location.pathname = this.paths[this.index];
  }

  pushState(state: unknown, path = "/") {
    this.entries = this.entries.slice(0, this.index + 1);
    this.paths = this.paths.slice(0, this.index + 1);
    this.entries.push(state);
    this.paths.push(path);
    this.index += 1;
    this.show();
    this.target.dispatchEvent(new Event("pushState"));
  }

  replaceState(state: unknown, path?: string) {
    this.entries[this.index] = state;
    if (path !== undefined) {
      this.paths[this.index] = path;
      this.show();
    }
    this.target.dispatchEvent(new Event("replaceState"));
  }

  back() {
    if (this.index === 0) return false;
    this.index -= 1;
    this.show();
    this.target.dispatchEvent(new Event("popstate"));
    return true;
  }
}

let history: FakeHistory;
let stop: () => void;

const start = () => {
  stop = trackNavigationDepth(history.target, history, history.location);
};

beforeEach(() => {
  history = new FakeHistory();
  start();
  return () => stop();
});

describe("depthOf", () => {
  it("reads nothing out of an entry the app never stamped", () => {
    expect(depthOf(null)).toBe(0);
    expect(depthOf(undefined)).toBe(0);
    expect(depthOf({ unrelated: "wouter puts null here" })).toBe(0);
  });

  it("ignores a value that is not a usable depth", () => {
    expect(depthOf({ __btNavDepth: "3" })).toBe(0);
    expect(depthOf({ __btNavDepth: Number.NaN })).toBe(0);
    expect(depthOf({ __btNavDepth: -1 })).toBe(0);
  });
});

describe("canGoBack", () => {
  it("is false on the screen the document loaded on", () => {
    expect(canGoBack()).toBe(false);
  });

  it("is true once the app has pushed a screen of its own", () => {
    history.pushState(null);
    expect(canGoBack()).toBe(true);
  });

  it("is false again after popping back to where the document started", () => {
    history.pushState(null);
    history.back();
    expect(canGoBack()).toBe(false);
  });

  /**
   * The bug this exists to prevent: the trip page's back arrow pushed `/`
   * instead of popping, so the browser's own back button then replayed the
   * trail forwards. Popping is only safe while a screen of ours is behind.
   */
  it("tracks a walk down and back up without drifting", () => {
    history.pushState(null); // /trips/5
    history.pushState(null); // /trips/5/dates
    expect(canGoBack()).toBe(true);

    history.back(); // /trips/5
    expect(canGoBack()).toBe(true);

    history.back(); // /
    expect(canGoBack()).toBe(false);
  });

  it("survives a reload, because the depth lives on the history entry", () => {
    history.pushState(null);
    stop();

    // A reload builds the module state from scratch against the same entry.
    start();

    expect(canGoBack()).toBe(true);
  });

  it("stops counting once detached", () => {
    stop();
    history.pushState(null);
    expect(canGoBack()).toBe(false);
  });
});

describe("fromOf", () => {
  it("reads nothing out of an entry the app never stamped", () => {
    expect(fromOf(null)).toBe(null);
    expect(fromOf({ unrelated: "wouter puts null here" })).toBe(null);
  });

  it("ignores a value that is not a path", () => {
    expect(fromOf({ __btNavFrom: 3 })).toBe(null);
    expect(fromOf({ __btNavFrom: "" })).toBe(null);
  });
});

/**
 * The rule the *up* arrow depends on: is the screen behind this one the very
 * screen the arrow was going to anyway?
 *
 * The bug: the arrow called `history.back()` whenever there was anything
 * behind, which answers a different question. Reached from a notification, the
 * entry behind a trip's section screen is the notifications list — so the
 * arrow beside "Accommodations" went sideways instead of up to the trip.
 */
describe("isBehind", () => {
  it("is false on the screen the document loaded on", () => {
    expect(isBehind("/")).toBe(false);
  });

  it("is true when the parent is the entry we came from", () => {
    history.pushState(null, "/trips/5");
    history.pushState(null, "/trips/5/accommodations");
    expect(isBehind("/trips/5")).toBe(true);
  });

  it("is false when we arrived from somewhere else entirely", () => {
    history.pushState(null, "/notifications");
    history.pushState(null, "/trips/5/accommodations");
    expect(isBehind("/trips/5")).toBe(false);
  });

  it("ignores a trailing slash, a query and a hash", () => {
    history.pushState(null, "/trips/5?from=email");
    history.pushState(null, "/trips/5/dates");
    expect(isBehind("/trips/5/")).toBe(true);
  });

  it("answers for the entry in front once we walk back up", () => {
    history.pushState(null, "/trips/5");
    history.pushState(null, "/trips/5/dates");
    history.back();
    // Back on the trip page, whose parent is the list of trips.
    expect(isBehind("/trips/5")).toBe(false);
    expect(isBehind("/")).toBe(true);
  });

  it("survives a reload, because the path lives on the history entry", () => {
    history.pushState(null, "/trips/5");
    history.pushState(null, "/trips/5/dates");
    stop();
    start();
    expect(isBehind("/trips/5")).toBe(true);
  });

  it("keeps its stamp when wouter replaces the entry under it", () => {
    history.pushState(null, "/trips/5");
    history.pushState(null, "/trips/5/dates");
    // What `navigate(to, { replace: true })` does: wouter writes its own state
    // through the same call, which would otherwise wipe both facts.
    history.replaceState(null, "/trips/5/budget");
    expect(canGoBack()).toBe(true);
    expect(isBehind("/trips/5")).toBe(true);
  });

  it("is false with nothing named to go up to", () => {
    history.pushState(null, "/trips/5");
    expect(isBehind(undefined)).toBe(false);
  });
});

/**
 * The three call sites this rule exists for.
 *
 * Asserted against the source in the same spirit as the server's router tests:
 * there is no DOM here, and what went wrong was never the logic inside a
 * handler — it was which browser API the handler reached for. `href` and
 * `navigate(x)` both push; a redirect and a back arrow must not.
 */
describe("navigation that must not stack history entries", () => {
  /**
   * Comments stripped: these files explain at length which call they no longer
   * make, and an assertion that cannot tell prose from code reads the warning
   * as the offence.
   */
  const read = (relative: string) =>
    readFileSync(join(import.meta.dirname, relative), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  it("bounces to the landing page by replacing, in the auth watcher", () => {
    const src = read("../_core/hooks/useAuth.ts");
    expect(src).toContain("window.location.replace(redirectPath)");
    expect(src).not.toContain("window.location.href =");
  });

  it("bounces to the landing page by replacing, in the error subscriber", () => {
    const src = read("../main.tsx");
    expect(src).toContain("window.location.replace(LOGIN_PATH)");
    expect(src).not.toContain("window.location.href =");
  });

  it("gives auth.me a link of its own so no batch inherits its timeout", () => {
    const src = read("../main.tsx");
    expect(src).toContain('condition: op => op.path === "auth.me"');
    // The sniff that made the timeout everyone's problem.
    expect(src).not.toContain('includes("auth.me")');
  });

  it("climbs to the parent for the back arrow, and never pushes it", () => {
    const src = read("../components/AppShell.tsx");
    // Up, not back: the pop is conditional on the parent being what is behind.
    expect(src).toContain("isBehind(backHref)");
    expect(src).toContain("window.history.back()");
    expect(src).toContain("navigate(backHref, { replace: true })");
    // The original: a push dressed as a back button.
    expect(src).not.toMatch(/navigate\(backHref\)/);
  });
});

/**
 * The client half of the "a blip is not a sign-out" rule.
 *
 * The server now refuses to answer `auth.me` when it could not determine the
 * session, but a refusal still leaves `user` null — so without this guard the
 * watcher would read the error as signed out and redirect anyway, and the
 * server-side fix would buy nothing.
 */
describe("the auth watcher", () => {
  const src = readFileSync(
    join(import.meta.dirname, "../_core/hooks/useAuth.ts"),
    "utf8"
  );

  it("redirects only when it got an answer, not when it got an error", () => {
    const effect = src.slice(src.indexOf("if (!redirectOnUnauthenticated)"));
    const guard = effect.slice(0, effect.indexOf("window.location.replace"));
    expect(guard).toContain("meQuery.error");
  });

  it("re-runs the check when the error clears", () => {
    const after = src.slice(
      src.indexOf("window.location.replace(redirectPath)")
    );
    // Up to the first `]`, which closes the effect's dependency array.
    expect(after.slice(0, after.indexOf("]"))).toContain("meQuery.error");
  });
});
