import nodemailer from "nodemailer";
import { config } from "../_core/env";
import { logger } from "../_core/logger";

const log = logger.child({ scope: "mailer" });

/**
 * Returns a configured transport, or `null` when SMTP is not set up.
 * Without SMTP the app stays usable: links are written to the log instead of
 * being emailed, which is what local development relies on.
 */
function getTransport() {
  if (!config.smtp.isConfigured) return null;
  return {
    transport: nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    }),
    from: config.smtp.from,
  };
}

export async function sendMagicLinkEmail(to: string, magicUrl: string) {
  const transport = getTransport();
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

  if (transport) {
    await transport.transport.sendMail({
      from: transport.from,
      to,
      subject,
      text,
      html,
    });
    log.info("magic link email sent", { to });
  } else {
    log.warn(
      "SMTP not configured — magic link written to log instead of sent",
      {
        to,
        magicUrl,
      }
    );
  }
}

export async function sendTripInviteEmail(
  to: string,
  inviterName: string,
  tripName: string,
  inviteUrl: string
) {
  const transport = getTransport();
  const subject = `${inviterName} invited you to join "${tripName}" on Harmony`;
  const text = `${inviterName} has invited you to join the trip "${tripName}" on Harmony.\n\nClick the link to join:\n${inviteUrl}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#10b981">You're invited to a trip!</h2>
      <p><strong>${inviterName}</strong> has invited you to join <strong>"${tripName}"</strong> on Harmony.</p>
      <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Join the Trip</a>
      <p style="color:#6b7280;font-size:13px">Or paste this link in your browser:<br/><code>${inviteUrl}</code></p>
    </div>`;

  if (transport) {
    await transport.transport.sendMail({
      from: transport.from,
      to,
      subject,
      text,
      html,
    });
    log.info("trip invite email sent", { to, tripName });
  } else {
    log.warn(
      "SMTP not configured — trip invite written to log instead of sent",
      {
        to,
        tripName,
        inviteUrl,
      }
    );
  }
}
