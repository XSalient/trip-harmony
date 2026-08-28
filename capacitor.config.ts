import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell around the same SPA the web serves.
 *
 * There is no second app here: `webDir` points at exactly what `pnpm build`
 * already produces, so the iOS and Android builds run the bundle the web build
 * runs, and a fix ships to all three at once.
 *
 * **`ios/` and `android/` are not in this repository.** Generating them needs
 * Xcode and the Android SDK — `npx cap add ios` runs `pod install`, which is
 * macOS-only — so they are created on a developer machine:
 *
 * ```bash
 * pnpm build && npx cap add ios && npx cap add android
 * npx cap sync            # after every pnpm build
 * npx cap open ios        # or: npx cap open android
 * ```
 *
 * Commit them once they exist: they carry the icons, the splash screens and the
 * signing configuration, and regenerating them loses all three.
 */
const config: CapacitorConfig = {
  /**
   * Must match `IOS_BUNDLE_ID` / `ANDROID_PACKAGE_NAME` in the environment —
   * the association files are built from those, and a bundle id that disagrees
   * with them breaks universal links with no visible error.
   *
   * Read from the environment so one checkout can build more than one flavour,
   * with a placeholder that is obviously a placeholder rather than a real-looking
   * default somebody might ship.
   */
  appId: process.env.IOS_BUNDLE_ID || "com.example.backtotravelling",
  appName: "Back To Travelling",
  webDir: "dist/public",

  server: {
    /**
     * `https` rather than Capacitor's older `http` default, so the Android
     * WebView's origin is `https://localhost`. It matters beyond tidiness:
     * WebAuthn, the clipboard and several other APIs refuse to run in a
     * non-secure context, and `http://localhost` is only sometimes treated as
     * one.
     *
     * Both native origins are listed in `shared/native.ts`, which is what the
     * server checks before it will hand a session token to a response body.
     */
    androidScheme: "https",
  },

  ios: {
    /**
     * The web app draws its own background; without this the WebView flashes
     * white between the splash screen and the first paint, which reads as a
     * crash on a dark theme.
     */
    backgroundColor: "#ffffff",
    /** Let the page manage its own scrolling — `AppShell` already does. */
    contentInset: "always",
  },

  android: {
    backgroundColor: "#ffffff",
    /**
     * Keep the WebView from being debuggable in a release build. Capacitor
     * defaults this on for debug builds only, but stating it is cheap and the
     * cost of getting it wrong is a shipped app anyone can inspect.
     */
    webContentsDebuggingEnabled: false,
  },
};

export default config;
