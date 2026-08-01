import nodemailer from "nodemailer";

/**
 * `not_configured` means no provider exists at all — an operator problem.
 * `provider_rejected` means a provider was reached and refused the send, which needs a
 * different message: telling someone to set an API key that is already set sends them
 * chasing the wrong thing.
 */
export type DeliveryResult = {
  delivered: boolean;
  reason?: "not_configured" | "provider_rejected";
  error?: string;
};

/** Resend's shared sender needs no domain verification, but only delivers to the Resend account owner. */
const RESEND_SANDBOX_FROM = "onboarding@resend.dev";

function getFromAddress() {
  return process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || RESEND_SANDBOX_FROM;
}

function getSmtpTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = parseInt(SMTP_PORT || "587");
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/** True when a provider is configured; when false, emails can only be logged, never delivered. */
export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY) || getSmtpTransport() !== null;
}

type Message = { to: string; subject: string; text: string; html: string };

async function sendViaResend(apiKey: string, msg: Message) {
  const from = getFromAddress();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${body.slice(0, 500)}`);
  }
}

/** Providers to try, in order. MAIL_PROVIDER pins one when both are configured. */
function getProviders(): Array<{ name: string; send: (msg: Message) => Promise<void> }> {
  const resendKey = process.env.RESEND_API_KEY;
  const smtp = getSmtpTransport();
  const preferred = process.env.MAIL_PROVIDER?.toLowerCase();

  const providers: Array<{ name: string; send: (msg: Message) => Promise<void> }> = [];
  if (resendKey && preferred !== "smtp") {
    providers.push({ name: "Resend", send: (msg) => sendViaResend(resendKey, msg) });
  }
  // SMTP is the fallback rather than the default: serverless platforms often block outbound SMTP ports.
  if (smtp && preferred !== "resend") {
    providers.push({
      name: "SMTP",
      send: async (msg) => {
        await smtp.sendMail({ from: getFromAddress(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      },
    });
  }
  return providers;
}

/**
 * Tries each configured provider in turn and reports what happened.
 * Never throws — callers get the delivery status so they can tell the user the truth.
 */
async function deliver(msg: Message, consoleLabel: string, consoleLines: string[]): Promise<DeliveryResult> {
  const providers = getProviders();

  if (providers.length === 0) {
    console.warn(`\n========== ${consoleLabel.toUpperCase()} (NOT SENT — no email provider configured) ==========`);
    console.warn(`To: ${msg.to}`);
    for (const line of consoleLines) console.warn(line);
    console.warn("Set RESEND_API_KEY (or SMTP_HOST/SMTP_USER/SMTP_PASS) to deliver this email.");
    console.warn("================================================================\n");
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
      console.log(`[Mailer] ${consoleLabel} sent to ${msg.to} via ${provider.name}`);
      return { delivered: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[Mailer] ${provider.name} failed to send ${consoleLabel} to ${msg.to}: ${lastError}`);
    }
  }

  // Every provider rejected the send. The most common cause is an unverified sender domain,
  // so name the sender we actually used — that is what has to change.
  console.error(`[Mailer] ${consoleLabel} to ${msg.to} was not delivered. Sender in use: ${getFromAddress()}`);
  return { delivered: false, reason: "provider_rejected", error: lastError };
}

export async function sendMagicLinkEmail(to: string, magicUrl: string): Promise<DeliveryResult> {
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

  return deliver({ to, subject, text, html }, "Magic link", [`Link: ${magicUrl}`]);
}

export async function sendTripInviteEmail(
  to: string,
  inviterName: string,
  tripName: string,
  inviteUrl: string,
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

  return deliver({ to, subject, text, html }, "Trip invite", [`Trip: ${tripName}`, `Link: ${inviteUrl}`]);
}
