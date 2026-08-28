/**
 * Where the native builds keep their session, and why the web keeps none.
 *
 * On the web the session is an `httpOnly` cookie: the browser sends it, this
 * file never sees it, and page script cannot read it even if something hostile
 * is running. That is the arrangement worth protecting, so **nothing here runs
 * on the web** — `isNative()` is false and every function is a no-op.
 *
 * In a Capacitor WebView the page's origin is `capacitor://localhost`, so the
 * cookie for the API's domain is third-party and iOS drops it. There the same
 * JWT travels in an `Authorization` header, which means it has to be stored
 * somewhere — Preferences, which is the Keychain on iOS and
 * EncryptedSharedPreferences on Android, rather than `localStorage`.
 */
import { Preferences } from "@capacitor/preferences";

const KEY = "session_token";

/**
 * Whether this build is running inside a native shell.
 *
 * Capacitor defines `window.Capacitor`. Checked at call time rather than
 * captured once, because the web build must be able to tree-shake nothing and
 * still take the no-op path.
 */
export function isNative(): boolean {
  return typeof window !== "undefined" && "Capacitor" in window;
}

/**
 * The stored token, or null.
 *
 * Cached after the first read: this is on the path of every tRPC request, and
 * Preferences is an async bridge call to native code. The cache is only ever
 * populated from storage or from `setSessionToken`, so it cannot drift.
 */
let cached: string | null | undefined;

export async function getSessionToken(): Promise<string | null> {
  if (!isNative()) return null;
  if (cached !== undefined) return cached;
  try {
    const { value } = await Preferences.get({ key: KEY });
    cached = value ?? null;
  } catch {
    // A storage that will not answer means signed out, not broken: the app
    // shows the landing page and the person signs in again. Throwing here
    // would take down every request instead.
    cached = null;
  }
  return cached;
}

export async function setSessionToken(token: string): Promise<void> {
  if (!isNative()) return;
  cached = token;
  await Preferences.set({ key: KEY, value: token });
}

export async function clearSessionToken(): Promise<void> {
  if (!isNative()) return;
  cached = null;
  await Preferences.remove({ key: KEY });
}

/**
 * Store the token a sign-in returned, if there was one.
 *
 * The server returns `sessionToken` only to a native origin — see
 * `shared/native.ts` — so on the web this is always absent and this is a no-op.
 * One helper because five procedures sign somebody in, and a client that
 * remembered the token after four of them would fail in a way that looks random.
 */
export async function rememberSession(result: {
  sessionToken?: string;
}): Promise<void> {
  if (result.sessionToken) await setSessionToken(result.sessionToken);
}
