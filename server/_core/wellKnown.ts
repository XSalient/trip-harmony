/**
 * The two files Apple and Google fetch to believe a link belongs to this app.
 *
 * Without them, a magic link or a trip invite opens Safari or Chrome instead of
 * the app, and a passkey created in the app is not offered on the web. There is
 * no error either platform will show you: the fetch fails or returns the wrong
 * thing, and links simply keep opening the browser.
 *
 * **Served by Express, not as static files, and that is deliberate.**
 * `vercel.json` rewrites `/((?!api/).*)` to `/index.html`, so a file dropped in
 * `client/public/.well-known/` would be served the SPA shell — HTML, to a
 * fetcher expecting JSON, with a 200 status. It needs an explicit rewrite to
 * reach here, which `vercel.json` now has.
 *
 * Both files are built from `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`,
 * `ANDROID_PACKAGE_NAME` and `ANDROID_CERT_FINGERPRINT`. Until those are set,
 * these endpoints answer 404 rather than serving a document full of
 * placeholders — a well-formed file naming an app that does not exist is worse
 * than an absent one, because both platforms cache what they fetch.
 */
import type { Express, Request, Response } from "express";

import { config } from "./env.js";
import { logger } from "./logger.js";

const log = logger.child({ scope: "well-known" });

/**
 * Apple's `apple-app-site-association`.
 *
 * Three requirements that are easy to get wrong and give no feedback when you
 * do: no `.json` extension, `Content-Type: application/json`, and no redirect
 * on the way to it.
 *
 * `appIDs` carries `<TeamID>.<BundleID>`. The paths are every route a link can
 * legitimately land on — a magic link, a trip invite — and `NOT` entries would
 * go first if any path ever needed excluding.
 */
function appleAppSiteAssociation() {
  const appId = `${config.native.appleTeamId}.${config.native.iosBundleId}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [appId],
          components: [
            // Sign-in links from email.
            { "/": "/auth/magic/*", comment: "magic sign-in link" },
            // Trip invitations.
            { "/": "/join/*", comment: "trip invite" },
            // A trip somebody shared with a member who already has the app.
            { "/": "/trips/*", comment: "a trip" },
          ],
        },
      ],
    },
    /**
     * What lets a passkey created in the app be offered on the website, and the
     * reverse. Separate from `applinks` on purpose: a deployment can want deep
     * links without passkeys, and Apple reads the two independently.
     */
    webcredentials: { apps: [appId] },
  };
}

/** Google's Digital Asset Links. */
function assetLinks() {
  return [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: config.native.androidPackage,
        /**
         * With Play App Signing this must be the certificate **Play re-signs
         * with**, not the upload key's. Taking it from a local keystore is the
         * commonest way to get silently non-working App Links, because the file
         * is then perfectly valid and simply describes a different app.
         */
        sha256_cert_fingerprints: [config.native.androidCertFingerprint],
      },
    },
  ];
}

/**
 * Serve one of the two, or 404 when the identifiers are not configured.
 *
 * Cached for an hour: both platforms fetch these rarely and cache them
 * themselves, and an hour is short enough that fixing a wrong fingerprint does
 * not mean waiting a day.
 */
function serve(res: Response, body: unknown) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(JSON.stringify(body, null, 2));
}

export function registerWellKnownRoutes(app: Express) {
  app.get(
    "/.well-known/apple-app-site-association",
    (_req: Request, res: Response) => {
      if (!config.native.appleTeamId || !config.native.iosBundleId) {
        log.debug("AASA requested but the iOS identifiers are not configured");
        return res.status(404).json({ error: "not configured" });
      }
      return serve(res, appleAppSiteAssociation());
    }
  );

  app.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
    if (
      !config.native.androidPackage ||
      !config.native.androidCertFingerprint
    ) {
      log.debug(
        "assetlinks requested but the Android identifiers are not configured"
      );
      return res.status(404).json({ error: "not configured" });
    }
    return serve(res, assetLinks());
  });
}
