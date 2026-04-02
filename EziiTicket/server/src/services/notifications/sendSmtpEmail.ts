import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

let cached: nodemailer.Transporter | null | undefined;

function getTransporter(): nodemailer.Transporter | null {
  if (cached !== undefined) return cached;
  if (!env.smtpHost.trim()) {
    cached = null;
    return null;
  }
  cached = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth:
      env.smtpUser.trim() && env.smtpPass
        ? { user: env.smtpUser, pass: env.smtpPass }
        : undefined,
  });
  return cached;
}

export type SendSmtpResult = { sent: boolean; reason?: string };

/**
 * Sends HTML email when SMTP is configured and notifications are enabled.
 * Otherwise logs a single-line hint (dev-friendly).
 */
export async function sendSmtpEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendSmtpResult> {
  if (!env.notificationEmailEnabled) {
    return { sent: false, reason: "notifications_disabled" };
  }
  const transport = getTransporter();
  if (!transport) {
    console.info(
      `[notifications] SMTP not configured; skip email to ${args.to} — "${args.subject.slice(0, 80)}"`
    );
    return { sent: false, reason: "no_smtp" };
  }
  await transport.sendMail({
    from: env.smtpFrom,
    to: args.to,
    subject: args.subject,
    html: args.html,
  });
  return { sent: true };
}
