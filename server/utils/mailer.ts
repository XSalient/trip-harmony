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
export function describeError(err: unknown): string {
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

/**
 * The domain an address belongs to, from either `a@b.com` or `Name <a@b.com>`.
 * Null when `from` is not an address at all, which is itself worth reporting.
 */
function senderDomain(from: string): string | null {
  const angled = from.match(/<([^>]+)>/);
  const address = (angled ? angled[1] : from).trim();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  return address.slice(at + 1).toLowerCase();
}

/**
 * What a *live* look at the mail provider says, as opposed to what the
 * environment variables claim.
 *
 * `canEmailAnyRecipient()` only knows that `MAIL_FROM` is not Resend's sandbox
 * address. It cannot tell a verified domain from one somebody typed in, and it
 * cannot tell whether the provider is reachable at all — which is how a run of
 * invites came to be reported as sent while `api.resend.com` was unreachable.
 * This asks.
 *
 * Never throws, and never sends anything: the point is to answer the question
 * without putting mail in anyone's inbox.
 */
export type EmailProbe = {
  /** The provider a send would actually use right now. */
  provider: "resend" | "smtp" | "none";
  /** `unknown` when the provider answered but would not say — see `detail`. */
  verdict: "ok" | "unknown" | "broken";
  summary: string;
  detail?: string;
  sender: string;
  facts: Record<string, string | number | null>;
};

async function probeResend(apiKey: string): Promise<EmailProbe> {
  const sender = config.mail.from;
  const domain = senderDomain(sender);
  const facts: Record<string, string | number | null> = {
    sender,
    senderDomain: domain,
  };

  let res: Response;
  const startedAt = Date.now();
  try {
    res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    // The exact shape of the invite outage: no response at all. Naming the
    // errno is the whole point — "fetch failed" on its own sends people to
    // rotate a key that was never the problem.
    return {
      provider: "resend",
      verdict: "broken",
      summary: "Resend is unreachable from this server",
      detail: `${describeError(err)}. Nothing will be delivered until this clears. This is not an API key or a sender-domain problem — neither of those can stop the request reaching Resend.`,
      sender,
      facts,
    };
  }
  facts.latencyMs = Date.now() - startedAt;

  // Any refusal here is a statement about *this endpoint*, never about
  // sending.
  //
  // This read "Resend rejected the API key" on a 401 and it was wrong, in the
  // most misleading direction available: a key scoped to one domain — the
  // normal thing to create — cannot list domains and is answered 401, while
  // sending with it works perfectly. The page therefore showed a red "rejected
  // the API key" next to an email test that had just delivered.
  //
  // `/domains` is not the sending endpoint, and permission to read it is a
  // different grant from permission to send. The only thing that can prove a
  // key cannot send is a send, which is what the Test button does. So every
  // non-2xx here is "could not verify", and the row says so.
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    const restricted =
      res.status === 401 || res.status === 403 || res.status === 422;
    return {
      provider: "resend",
      verdict: "unknown",
      summary: restricted
        ? "Resend is reachable, but this key may not list domains"
        : `Resend is reachable but answered ${res.status} when asked for domains`,
      detail: restricted
        ? `Responded ${res.status}. A key scoped to a single domain — or any sending-only key — has no domains:read permission, so whether the sender domain is verified cannot be checked from here. That is not evidence of a bad key: run the email test, which actually sends. If that fails too, then suspect the key.`
        : `Responded ${res.status}${body ? `: ${body}` : ""}. Sending is unaffected by this endpoint; run the email test to settle it.`,
      sender,
      facts,
    };
  }

  type ResendDomain = { name?: string; status?: string; region?: string };
  let domains: ResendDomain[] = [];
  try {
    const body = (await res.json()) as { data?: ResendDomain[] };
    domains = Array.isArray(body.data) ? body.data : [];
  } catch {
    return {
      provider: "resend",
      verdict: "unknown",
      summary: "Resend is reachable, but its domain list could not be read",
      sender,
      facts,
    };
  }
  facts.domainsInAccount = domains.length;

  if (!domain) {
    return {
      provider: "resend",
      verdict: "broken",
      summary: "MAIL_FROM is not an email address",
      detail: `Resend has nothing to send as. Set MAIL_FROM to an address on a verified domain, either "you@example.com" or "Name <you@example.com>".`,
      sender,
      facts,
    };
  }

  const match = domains.find(d => d.name?.toLowerCase() === domain);
  if (!match) {
    return {
      provider: "resend",
      verdict: "broken",
      summary: `${domain} is not a domain in this Resend account`,
      detail: `Resend will refuse every send to anyone but the account owner. The account has ${domains.length === 0 ? "no domains" : `: ${domains.map(d => d.name).join(", ")}`}. Add and verify ${domain}, or point MAIL_FROM at one that is already there.`,
      sender,
      facts,
    };
  }

  facts.domainStatus = match.status ?? null;
  facts.domainRegion = match.region ?? null;

  if (match.status !== "verified") {
    return {
      provider: "resend",
      verdict: "broken",
      summary: `${domain} is "${match.status ?? "unknown"}", not verified`,
      detail:
        "Resend only delivers to third parties from a verified domain; until the DNS records are in place, invites reach the account owner and nobody else. Finish verification in the Resend dashboard.",
      sender,
      facts,
    };
  }

  return {
    provider: "resend",
    verdict: "ok",
    summary: `Resend reachable, ${domain} verified`,
    sender,
    facts,
  };
}

async function probeSmtp(): Promise<EmailProbe> {
  const sender = config.mail.from;
  const facts: Record<string, string | number | null> = {
    sender,
    host: config.mail.smtp.host,
    port: config.mail.smtp.port,
  };
  const transport = getSmtpTransport();
  if (!transport) {
    return {
      provider: "smtp",
      verdict: "broken",
      summary: "SMTP is only half configured",
      detail: "All of SMTP_HOST, SMTP_USER and SMTP_PASS are needed.",
      sender,
      facts,
    };
  }
  const startedAt = Date.now();
  try {
    // Connects and authenticates. Sends nothing.
    await transport.verify();
    facts.latencyMs = Date.now() - startedAt;
    return {
      provider: "smtp",
      verdict: "ok",
      summary: `SMTP reachable and authenticated at ${config.mail.smtp.host}`,
      sender,
      facts,
    };
  } catch (err) {
    facts.latencyMs = Date.now() - startedAt;
    return {
      provider: "smtp",
      verdict: "broken",
      summary: "SMTP would not accept this server",
      detail: describeError(err),
      sender,
      facts,
    };
  }
}

export async function probeEmail(): Promise<EmailProbe> {
  const providers = getProviders();
  if (providers.length === 0) {
    return {
      provider: "none",
      verdict: "broken",
      summary: "No email provider is configured",
      detail:
        "Nothing can be delivered: sign-in links and invites are written to the log instead. Set RESEND_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS.",
      sender: config.mail.from,
      facts: {},
    };
  }

  // The first provider is the one a send would use; probing a fallback that
  // would never be reached first would report a health the app does not have.
  return providers[0].name === "resend"
    ? probeResend(config.mail.resendApiKey)
    : probeSmtp();
}

/**
 * The one email nobody has to interpret: it either lands in your inbox or it
 * does not.
 *
 * Every other check in the diagnostics screen reasons about delivery — the
 * provider answers, the key is good, the domain is verified. All three can be
 * true while mail still fails somewhere past the API: a suspended account, a
 * sending limit, a recipient's provider refusing the sender. This is the end
 * to end one.
 *
 * The caller passes its own signed-in address and nothing else can be passed.
 * An admin-only endpoint that sends to an arbitrary address is a relay with a
 * login on it, and it would be the first thing worth abusing here.
 */
export async function sendHealthTestEmail(
  to: string,
  requestedBy: string
): Promise<DeliveryResult> {
  const sentAt = new Date().toISOString();
  const subject = "WeVoTrip health check";
  const text = `This is a test email from the WeVoTrip health page, sent at ${sentAt} because ${requestedBy} asked for it.\n\nIf you are reading it, outbound email works: provider reachable, sender accepted, delivery completed.`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#10b981">Email is working</h2>
      <p>Sent from the WeVoTrip health page at <strong>${sentAt}</strong>, because ${requestedBy} asked for it.</p>
      <p style="color:#6b7280;font-size:13px">If you are reading this, outbound email works end to end — the provider was reachable, the sender was accepted, and delivery completed. Nothing else about this message matters.</p>
    </div>`;

  return deliver({ to, subject, text, html }, "health test", {});
}

// Re-exported so routers can ask about email capability without reaching into
// the config module directly.
export { isEmailConfigured, canEmailAnyRecipient } from "../_core/env.js";
