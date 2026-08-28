/**
 * Telling the native app apart from the web, and why the server cares.
 *
 * The session is an `httpOnly` cookie. In a Capacitor WebView that cookie is
 * third-party — the page's origin is `capacitor://localhost`, not the API's
 * domain — and iOS drops it, so the native builds have to carry the same JWT in
 * an `Authorization: Bearer` header instead.
 *
 * That means the token has to reach the client in a response body, which is
 * exactly what `httpOnly` exists to prevent. So it is returned **only** to a
 * request whose `Origin` is one of the WebView origins below.
 *
 * Why the origin and not a header the client sets: a header can be forged by
 * anything that can make a request, including script injected into the web app,
 * and an XSS that could ask for the session token and read it back would have
 * defeated the cookie's whole purpose. `Origin` is set by the browser and
 * cannot be written by page script, so a web page cannot ask for the token by
 * pretending to be the app. Neither can a cross-site page: it would carry its
 * own origin.
 */

/**
 * The origins a Capacitor WebView presents.
 *
 * - `capacitor://localhost` — iOS, Capacitor's default scheme.
 * - `https://localhost` — Android, from `androidScheme: "https"` in
 *   `capacitor.config.ts`. Deliberately `https` so the WebView is a secure
 *   context; WebAuthn and the clipboard refuse to run otherwise.
 * - `ionic://localhost` — older Capacitor and Ionic shells. Harmless to accept
 *   and cheap insurance against a plugin that still uses it.
 *
 * Note what is **not** here: `http://localhost`. That is the local web dev
 * server, and accepting it would hand a token to every browser tab a developer
 * has open.
 */
export const NATIVE_ORIGINS = [
  "capacitor://localhost",
  "https://localhost",
  "ionic://localhost",
] as const;

/**
 * Whether this request came from a native shell.
 *
 * Exact string equality, not a prefix or a substring test: `https://localhost`
 * must not also match `https://localhost.evil.example`, which is precisely the
 * mistake a `startsWith` here would make.
 */
export function isNativeOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  return (NATIVE_ORIGINS as readonly string[]).includes(origin.trim());
}

/**
 * The header the native client sends its session in.
 *
 * Standard `Authorization: Bearer <jwt>`. Named here so the client and the
 * server cannot disagree about it.
 */
export const AUTH_HEADER = "authorization";
export const BEARER_PREFIX = "Bearer ";
