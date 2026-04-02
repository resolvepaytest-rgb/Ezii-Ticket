import { pool } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { getNotificationEmailTemplate } from "./loadNotificationEmailTemplate.js";
import { insertNotificationEmailLog } from "./notificationEmailLog.js";
import { resolveNotificationRecipientEmail } from "./organizationEmailStatus.js";
import { renderNotificationPlaceholders } from "./renderTemplate.js";
import { sendSmtpEmail } from "./sendSmtpEmail.js";

const EVENT_KEY = "team_lead_no_assignee" as const;
const PRODUCT = "ticket" as const;

export async function sendTeamLeadNoAssigneeEmails(args: {
  organisationId: number;
  recipients: { email: string; name: string }[];
  ticketId: number;
  ticketCode: string;
  ticketSubject: string;
  teamName: string;
  context: "create" | "escalate";
}): Promise<void> {
  if (args.recipients.length === 0) return;

  const statusRes = await pool.query<{ status: string }>(
    "select status from tickets where id = $1 and organisation_id = $2",
    [args.ticketId, args.organisationId]
  );
  const ticketStatus = statusRes.rows[0]?.status ?? null;

  const tmpl = await getNotificationEmailTemplate(args.organisationId, EVENT_KEY);
  const contextLabel = args.context === "create" ? "Ticket creation" : "Escalation";
  const ticketUrl = `${env.ticketPortalBaseUrl}/t/${encodeURIComponent(args.ticketCode)}`;

  const baseVars: Record<string, string> = {
    ticket_id: String(args.ticketId),
    ticket_code: args.ticketCode,
    ticket_subject: args.ticketSubject,
    team_name: args.teamName,
    context_label: contextLabel,
    ticket_url: ticketUrl,
  };

  const baseLogContext: Record<string, unknown> = {
    notification_key: EVENT_KEY,
    product: PRODUCT,
    organisation_id: args.organisationId,
    ticket_id: args.ticketId,
    ticket_code: args.ticketCode,
    ticket_status: ticketStatus,
    team_name: args.teamName,
    routing_context: args.context,
    ticket_url: ticketUrl,
  };

  for (const r of args.recipients) {
    const addr = String(r.email ?? "").trim();
    if (!addr) continue;
    const vars = {
      ...baseVars,
      recipient_name: (r.name ?? "").trim() || "Team Lead",
    };
    const subject = renderNotificationPlaceholders(tmpl.subject || "[Ezii]", vars);
    const html = renderNotificationPlaceholders(tmpl.body, vars);
    let recipientActualAfterRouting: string | null = null;
    try {
      const resolved = await resolveNotificationRecipientEmail({
        organisationId: args.organisationId,
        intendedTo: addr,
        product: "ticket",
      });
      if (!resolved.ok) {
        console.warn(
          `[notifications] team_lead_no_assignee skipped (${resolved.reason}) org=${args.organisationId} intended=${addr}`
        );
        await insertNotificationEmailLog({
          organisationId: args.organisationId,
          ticketId: args.ticketId,
          ticketStatus,
          notificationKey: EVENT_KEY,
          product: PRODUCT,
          mailFrom: env.smtpFrom,
          recipientIntended: addr,
          recipientActual: null,
          subject,
          sendStatus: "skipped",
          errorMessage: resolved.reason,
          contextJson: {
            ...baseLogContext,
            skip_reason: resolved.reason,
            html_length: html.length,
          },
        });
        continue;
      }
      recipientActualAfterRouting = resolved.to;
      const smtp = await sendSmtpEmail({ to: resolved.to, subject, html });
      const sendStatus = smtp.sent
        ? "sent"
        : smtp.reason === "notifications_disabled"
          ? "disabled"
          : "no_smtp";
      await insertNotificationEmailLog({
        organisationId: args.organisationId,
        ticketId: args.ticketId,
        ticketStatus,
        notificationKey: EVENT_KEY,
        product: PRODUCT,
        mailFrom: env.smtpFrom,
        recipientIntended: addr,
        recipientActual: resolved.to,
        subject,
        sendStatus,
        errorMessage: smtp.sent ? null : (smtp.reason ?? null),
        contextJson: {
          ...baseLogContext,
          html_length: html.length,
          routed_to_sandbox: resolved.to !== addr,
        },
      });
    } catch (err) {
      console.error(`[notifications] team_lead_no_assignee email failed for ${addr}`, err);
      const msg = err instanceof Error ? err.message : String(err);
      await insertNotificationEmailLog({
        organisationId: args.organisationId,
        ticketId: args.ticketId,
        ticketStatus,
        notificationKey: EVENT_KEY,
        product: PRODUCT,
        mailFrom: env.smtpFrom,
        recipientIntended: addr,
        recipientActual: recipientActualAfterRouting,
        subject,
        sendStatus: "failed",
        errorMessage: msg,
        contextJson: {
          ...baseLogContext,
          html_length: html.length,
          error_name: err instanceof Error ? err.name : "Error",
        },
      });
    }
  }
}
