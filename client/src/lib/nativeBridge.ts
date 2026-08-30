/**
 * The handful of things a WebView has to be told, that a browser does for free.
 *
 * All of it is inert on the web: every function returns early when
 * `isNative()` is false, so the browser build sets up no listeners and the
 * plugins are never called.
 *
 * Four behaviours, each of which is a bug report if it is missing:
 *
 * 1. **Deep links.** A universal link hands the app a full URL and expects it
 *    to route there itself. Without this, tapping a magic link opens the app on
 *    the landing page and the person is still signed out.
 * 2. **The Android back button.** It is a hardware key, not history. Left
 *    alone, Capacitor closes the app from any screen — so pressing back once on
 *    a trip page exits rather than going up.
 * 3. **The status bar.** iOS draws the WebView under it; text is invisible
 *    against the app's own background until it is told which style to use.
 * 4. **The splash screen.** It hides itself on a timer by default, which is a
 *    race with the first paint — too early flashes white, too late is a stall.
 */
import { App as CapApp } from "@capacitor/app";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

import { isNative } from "./session";

/**
 * Turn a deep link into a path this app's router understands.
 *
 * Returns null for anything that is not one of ours. A universal link can only
 * arrive for a domain the association file claims, so this is belt and braces —
 * but the value ends up in `history.pushState`, and a caller that trusted it
 * blindly would be one association-file mistake away from an open redirect.
 */
export function pathFromDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Custom schemes (`capacitor://`) are the app's own; anything else must be
    // http(s), because those are the only schemes a universal link uses.
    if (!/^https?:$/.test(parsed.protocol) && parsed.protocol !== "capacitor:")
      return null;
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    // A path, never a URL: "//evil.example" is a protocol-relative URL, and
    // pushing it would navigate off-site.
    if (!path.startsWith("/") || path.startsWith("//")) return null;
    return path;
  } catch {
    return null;
  }
}

/**
 * Wire the WebView up. Returns a cleanup function.
 *
 * `navigate` is wouter's, passed in rather than imported so this file stays
 * free of React and can be tested as the plain functions it is.
 */
export function startNativeBridge(
  navigate: (path: string) => void
): () => void {
  if (!isNative()) return () => {};

  const listeners: Array<{ remove: () => void }> = [];

  // 1. Deep links.
  void CapApp.addListener("appUrlOpen", event => {
    const path = pathFromDeepLink(event.url);
    if (path) navigate(path);
  }).then(handle => listeners.push(handle));

  /**
   * 2. The Android back button.
   *
   * `canGoBack` is Capacitor's own reading of the WebView history, which is
   * what wouter pushes to, so it is the right question. At the root there is
   * nowhere to go up to and closing the app is what people expect — minimising
   * instead would leave a back press doing nothing at all, which reads as a
   * frozen app.
   */
  void CapApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void CapApp.exitApp();
  }).then(handle => listeners.push(handle));

  // 3. The status bar. Dark text, because the app's background is light; the
  //    theme toggle does not change this, since the header stays light in both.
  void StatusBar.setStyle({ style: Style.Light }).catch(() => {
    // Android 15 and up refuse `setStyle` in edge-to-edge mode. Not worth
    // failing startup over — the bar is simply left as the system drew it.
  });

  /**
   * 4. The keyboard resizes the WebView rather than covering it, so a text
   *    field near the bottom of a form scrolls into view instead of sitting
   *    underneath the keyboard. `Native` is the mode that leaves scroll
   *    position alone, which the proposal screens depend on.
   */
  void Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => {});

  // 5. Hide the splash once React has painted, rather than on a timer that is
  //    racing it.
  void SplashScreen.hide().catch(() => {});

  return () => {
    for (const handle of listeners) handle.remove();
  };
}
