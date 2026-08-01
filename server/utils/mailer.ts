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

async function sendViaResend(apiKey: string, msg: Message) {
  const res = await fetch("https://api.resend.com/emails", {
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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${body.slice(0, 500)}`);
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
    try {
      await provider.send(msg);
      log.info(`${kind} sent`, { to: msg.to, provider: provider.name });
      return { delivered: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log.error(`${kind} failed to send`, {
        to: msg.to,
        provider: provider.name,
        reason: lastError,
      });
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
  const subject = "Your Harmony sign-in link";
  const text = `Click the link below to sign in to Harmony. It expires in 15 minutes.\n\n${magicUrl}\n\nIf you didn't request this, you can safely ignore this email.`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#10b981">Sign in to Harmony</h2>
      <p>Click the button below to sign in. This link expires in <strong>15 minutes</strong>.</p>
      <a href="${magicUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Sign In to Harmony</a>
      <p style="color:#6b7280;font-size:13px">Or paste this link in your browser:<br/><code>${magicUrl}</code></p>
      <p style="color:#9ca3af;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
    </div>`;

  return deliver({ to, subject, text, html }, "magic link", { magicUrl });
}

export async function sendTripInviteEmail(
  to: string,
  inviterName: string,
  tripName: string,
  inviteUrl: string
): Promise<DeliveryResult> {
  const subject = `${inviterName} invited you to join "${tripName}" on Harmony`;
  const text = `${inviterName} has invited you to join the trip "${tripName}" on Harmony.\n\nClick the link to join:\n${inviteUrl}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#10b981">You're invited to a trip!</h2>
      <p><strong>${inviterName}</strong> has invited you to join <strong>"${tripName}"</strong> on Harmony.</p>
      <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Join the Trip</a>
      <p style="color:#6b7280;font-size:13px">Or paste this link in your browser:<br/><code>${inviteUrl}</code></p>
    </div>`;

  return deliver({ to, subject, text, html }, "trip invite", {
    tripName,
    inviteUrl,
  });
}

// Re-exported so routers can ask about email capability without reaching into
// the config module directly.
export { isEmailConfigured, canEmailAnyRecipient } from "../_core/env.js";
