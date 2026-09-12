/**
 * Outbound email.
 *
 * Providers are tried in order — Resend first, SMTP second, because serverless
 * platforms commonly block outbound SMTP ports. Nothing here throws: callers
 * get a `DeliveryResult` so they can tell the user the truth rather than
 * claiming an email was sent when it wasn't.
 *
 * Whether email is configured at all, and whether it can reach anyone other
 * than the operator, is decided in `_core/env.ts` — see `isEmailConfigured`
 * and `canEmailAnyRecipient`.
 */
import nodemailer from "nodemailer";
import { config } from "../_core/env.js";
import { logger } from "../_core/logger.js";

const log = logger.child({ scope: "mailer" });

/**
 * `not_configured` means no provider exists at all — an operator problem.
 * `provider_rejected` means a provider was reached and refused the send, which
 * needs a different message: telling someone to set an API key that is already
 * set sends them chasing the wrong thing.
 */
export type DeliveryResult = {
  delivered: boolean;
  reason?: "not_configured" | "provider_rejected";
  error?: string;
};

type Message = { to: string; subject: string; text: string; html: string };

function getSmtpTransport() {
  if (!config.mail.smtp.isConfigured) return null;
  const { host, port, user, pass } = config.mail.smtp;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * A send worth trying again: the request never reached the provider, or the
 * provider asked us to back off. A refusal (bad key, unverified domain) is not
 * one of these — retrying that just fails three times instead of once.
 */
class TransientSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransientSendError";
  }
}

/**
 * Node's `fetch` collapses every transport failure into the same useless
 * `"fetch failed"` and puts the real errno on `cause`. Logging the message
 * alone makes a DNS failure, a refused connection and an expired certificate
 * indistinguishable — which is exactly the hole a production outage falls
 * into. Walk the chain so the log names the thing that actually broke.
 */
function describeError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < 4; depth++) {
    const code = (current as NodeJS.ErrnoException).code;
    parts.push(code ? `${current.message} (${code})` : current.message);
    current = current.cause;
  }
  return parts.length > 0 ? parts.join(" <- ") : String(err);
}

/** Connection-level errnos, for the SMTP path — nodemailer sets `code`. */
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ESOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function isTransient(err: unknown): boolean {
  if (err instanceof TransientSendError) return true;
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < 4; depth++) {
    const code = (current as NodeJS.ErrnoException).code;
    if (code && TRANSIENT_CODES.has(code)) return true;
    current = current.cause;
  }
  return false;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One connection failure used to lose an invitation permanently — the send was
 * attempted once, the caller was told it succeeded, and nobody found out until
 * a guest asked why they had heard nothing. Short and bounded: the invite is
 * sent inside a request somebody is waiting on.
 */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = [250, 1000];

async function sendViaResend(apiKey: string, msg: Message) {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.mail.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
    });
  } catch (err) {
    // The API was never reached. Nothing was sent, so a retry cannot duplicate.
    throw new TransientSendError("Resend was unreachable", { cause: err });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const message = `Resend responded ${res.status}: ${body.slice(0, 500)}`;
    // 429 is a rate limit and 5xx is their side failing; both pass on a retry.
    // Everything else is a refusal that will be refused again.
    if (res.status === 429 || res.status >= 500)
      throw new TransientSendError(message);
    throw new Error(message);
  }
}

/** Providers to try, in order. MAIL_PROVIDER pins one when both are configured. */
function getProviders(): Array<{
  name: string;
  send: (msg: Message) => Promise<void>;
}> {
  const { resendApiKey, preferredProvider } = config.mail;
  const smtp = getSmtpTransport();
  const providers: Array<{
    name: string;
    send: (msg: Message) => Promise<void>;
  }> = [];

  if (resendApiKey && preferredProvider !== "smtp") {
    providers.push({
      name: "resend",
      send: msg => sendViaResend(resendApiKey, msg),
    });
  }
  if (smtp && preferredProvider !== "resend") {
    providers.push({
      name: "smtp",
      send: async msg => {
        await smtp.sendMail({
          from: config.mail.from,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        });
      },
    });
  }
  return providers;
}

/**
 * Tries each configured provider in turn and reports what happened.
 * Never throws.
 *
 * `context` is logged alongside a failure so an undelivered link can still be
 * recovered from the logs — which is what local sign-in relies on when no
 * provider is configured.
 */
async function deliver(
  msg: Message,
  kind: string,
  context: Record<string, unknown>
): Promise<DeliveryResult> {
  const providers = getProviders();

  if (providers.length === 0) {
    log.warn(`${kind} not sent — no email provider configured`, {
      to: msg.to,
      ...context,
      hint: "set RESEND_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS",
    });
    return {
      delivered: false,
      reason: "not_configured",
      error: "No email provider is configured (set RESEND_API_KEY or SMTP_*).",
    };
  }

  let lastError = "";
  for (const provider of providers) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await provider.send(msg);
        log.info(`${kind} sent`, {
          to: msg.to,
          provider: provider.name,
          ...(attempt > 1 ? { attempt } : {}),
        });
        return { delivered: true };
      } catch (err) {
        lastError = describeError(err);
        const willRetry = isTransient(err) && attempt < MAX_ATTEMPTS;
        log.error(`${kind} failed to send`, {
          to: msg.to,
          provider: provider.name,
          attempt,
          reason: lastError,
          willRetry,
        });
        if (!willRetry) break;
        await sleep(RETRY_DELAY_MS[attempt - 1]);
      }
    }
  }

  // Every provider rejected the send. The most common cause is an unverified
  // sender domain, so name the sender actually used — that is what has to change.
  log.error(`${kind} was not delivered by any provider`, {
    to: msg.to,
    sender: config.mail.from,
    ...context,
  });
  return { delivered: false, reason: "provider_rejected", error: lastError };
}

export async function sendMagicLinkEmail(
  to: string,
  magicUrl: string
): Promise<DeliveryResult> {
  const subject = "Your WeVoTrip sign-in link";
  const text = `Click the link below to sign in to WeVoTrip. It expires in 15 minutes.\n\n${magicUrl}\n\nIf you didn't request this, you can safely ignore this email.`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#10b981">Sign in to WeVoTrip</h2>
      <p>Click the button below to sign in. This link expires in <strong>15 minutes</strong>.</p>
      <a href="${magicUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Sign In to WeVoTrip</a>
      <p style="color:#6b7280;font-size:13px">Or paste this link in your browser:<br/><code>${magicUrl}</code></p>
      <p style="color:#9ca3af;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
    </div>`;

  // The URL is a live 15-minute credential, so it goes in the failure log only
  // where the log is the developer's own terminal. That is the whole reason the
  // context exists — recovering the link when no provider is configured locally
  // — and `deliver` logs its context at ERROR on total failure, which on a
  // deployment means writing a working sign-in link into the platform's log
  // stream and any drain attached to it. `onDeployedPlatform` rather than
  // `isProduction` for the reason given in `_core/env.ts`: APP_ENV is a string
  // somebody sets, and on this project it said "development" in production.
  const context = config.onDeployedPlatform ? {} : { magicUrl };
  return deliver({ to, subject, text, html }, "magic link", context);
}

export async function sendTripInviteEmail(
  to: string,
  inviterName: string,
  tripName: string,
  inviteUrl: string
): Promise<DeliveryResult> {
  const subject = `${inviterName} invited you to join "${tripName}" on WeVoTrip`;
  const text = `${inviterName} has invited you to join the trip "${tripName}" on WeVoTrip.\n\nClick the link to join:\n${inviteUrl}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#10b981">You're invited to a trip!</h2>
      <p><strong>${inviterName}</strong> has invited you to join <strong>"${tripName}"</strong> on WeVoTrip.</p>
      <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Join the Trip</a>
      <p style="color:#6b7280;font-size:13px">Or paste this link in your browser:<br/><code>${inviteUrl}</code></p>
    </div>`;

  // The invite token grants membership of the trip at the role it was issued
  // for, so it is a credential and it follows the same rule as the magic link:
  // logged where the log is a developer's own terminal and a failed send has to
  // stay recoverable, never into a deployment's log stream. Same
  // `onDeployedPlatform` reasoning too — APP_ENV said "development" in
  // production on this project, so `isProduction` would not have held.
  const context = config.onDeployedPlatform
    ? { tripName }
    : { tripName, inviteUrl };

  return deliver({ to, subject, text, html }, "trip invite", context);
}

// Re-exported so routers can ask about email capability without reaching into
// the config module directly.
export { isEmailConfigured, canEmailAnyRecipient } from "../_core/env.js";
