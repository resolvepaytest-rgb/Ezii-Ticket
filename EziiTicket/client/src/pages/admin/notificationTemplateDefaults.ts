/** Default email template copy per `event_key` when none is saved yet (HTML bodies for rich email + preview). */

export type NotificationTemplateDefaults = {
  template_name: string;
  subject: string;
  body: string;
};

const EZII_LOGO = `<div style="text-align:center;margin-bottom:28px;">
  <span style="font-size:22px;font-weight:800;color:#1E88E5;letter-spacing:0.14em;">EZII</span>
</div>`;

const EZII_FOOTER = `<div style="margin-top:32px;padding-top:22px;border-top:1px solid #e5e7eb;text-align:center;">
  <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">Ezii System Admin • 123 Tech Plaza, SF</p>
  <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;line-height:1.45;">You received this because notification settings are enabled for your workspace.</p>
</div>`;

function layout(inner: string): string {
  return `${EZII_LOGO}${inner}${EZII_FOOTER}`;
}

const ticketInfoBox = `<div style="margin:24px 0;border-radius:12px;background:#f0f7fd;border-left:4px solid #1E88E5;padding:20px 22px;">
  <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr><td style="padding:4px 0 2px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;">TICKET ID</td></tr>
    <tr><td style="padding:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">#{{ticket_id}}</td></tr>
    <tr><td style="padding:4px 0 2px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;">PRIORITY</td></tr>
    <tr><td style="padding:0 0 16px;">
      <span style="display:inline-block;background:#dc2626;color:#ffffff;padding:6px 16px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.04em;">{{priority}}</span>
    </td></tr>
    <tr><td style="padding:4px 0 2px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;">SUBJECT</td></tr>
    <tr><td style="padding:0;font-size:15px;font-weight:700;color:#0f172a;line-height:1.4;">{{ticket_subject}}</td></tr>
  </table>
</div>`;

const ctaReview = `<div style="text-align:center;margin:28px 0 8px;">
  <a href="{{ticket_url}}" style="display:inline-block;background:#1E88E5;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 16px rgba(30,136,229,0.35);">Review Ticket Details</a>
</div>`;

export const DEFAULT_NOTIFICATION_TEMPLATES: Record<string, NotificationTemplateDefaults> = {
  ticket_created: {
    template_name: "Ticket created — email",
    subject: "New Ticket Created: #{{ticket_id}}",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">Hello {{agent_name}},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#64748b;">A new high-priority ticket has been assigned to your workspace. Our systems detected a potential SLA risk based on the current workload.</p>
${ticketInfoBox}
${ctaReview}`
    ),
  },

  agent_reply_added: {
    template_name: "Agent reply added — email",
    subject: "Update on ticket [#{{ticket_id}}]",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">Hi {{customer_name}},</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#64748b;">{{agent_name}} posted a new reply on your ticket.</p>
${ticketInfoBox}
<div style="margin:20px 0;padding:16px 18px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
  <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;">MESSAGE</p>
  <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">{{latest_message}}</p>
</div>
${ctaReview}`
    ),
  },

  customer_reply_added: {
    template_name: "Customer reply added — email",
    subject: "Customer replied — [#{{ticket_id}}]",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">Hi {{agent_name}},</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#64748b;"><strong style="color:#0f172a;">{{customer_name}}</strong> sent a new message on this ticket.</p>
${ticketInfoBox}
<div style="margin:20px 0;padding:16px 18px;background:#fff7ed;border-radius:10px;border-left:4px solid #f97316;">
  <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;">CUSTOMER MESSAGE</p>
  <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">{{latest_message}}</p>
</div>
${ctaReview}`
    ),
  },

  ticket_status_changed: {
    template_name: "Ticket status changed — email",
    subject: "Ticket [#{{ticket_id}}] status updated",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">Hello,</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#64748b;">The status of your ticket has changed. Here are the current details.</p>
${ticketInfoBox}
<p style="margin:16px 0 0;font-size:13px;color:#64748b;">Handled by <strong style="color:#0f172a;">{{agent_name}}</strong> · {{product}}</p>
${ctaReview}`
    ),
  },

  sla_warning: {
    template_name: "SLA warning (75%) — email",
    subject: "SLA warning: ticket [#{{ticket_id}}] approaching deadline",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">Hi {{agent_name}},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#64748b;">This ticket is approaching its SLA threshold (~75%). Please prioritize to avoid a breach.</p>
${ticketInfoBox}
<div style="margin:20px 0;padding:14px 18px;background:#fffbeb;border-radius:10px;border:1px solid #fcd34d;">
  <p style="margin:0;font-size:13px;color:#92400e;"><strong>Due:</strong> {{sla_deadline}}</p>
</div>
${ctaReview}`
    ),
  },

  sla_breached: {
    template_name: "SLA breached — email",
    subject: "URGENT: SLA breached for ticket [#{{ticket_id}}]",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#b91c1c;">Hi {{agent_name}},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#64748b;"><strong style="color:#b91c1c;">SLA has been breached</strong> for the following ticket. Immediate action is required.</p>
${ticketInfoBox}
<div style="margin:20px 0;padding:14px 18px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;">
  <p style="margin:0;font-size:13px;color:#991b1b;"><strong>Deadline was:</strong> {{sla_deadline}}</p>
</div>
${ctaReview}`
    ),
  },

  team_lead_no_assignee: {
    template_name: "No available agent — Team Lead alert",
    subject: "[{{context_label}}] No agent auto-assigned — {{ticket_code}}",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">Hi {{recipient_name}},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#64748b;">Automatic assignment could not pick an available agent for team <strong style="color:#0f172a;">{{team_name}}</strong> (members may be out of office or at capacity). Please review and assign manually.</p>
<div style="margin:24px 0;border-radius:12px;background:#fffbeb;border-left:4px solid #f59e0b;padding:20px 22px;">
  <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr><td style="padding:4px 0 2px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;">CONTEXT</td></tr>
    <tr><td style="padding:0 0 12px;font-size:14px;font-weight:700;color:#92400e;">{{context_label}}</td></tr>
    <tr><td style="padding:4px 0 2px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;">TICKET</td></tr>
    <tr><td style="padding:0 0 8px;font-size:16px;font-weight:700;color:#0f172a;">{{ticket_code}}</td></tr>
    <tr><td style="padding:4px 0 2px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;">SUBJECT</td></tr>
    <tr><td style="padding:0;font-size:15px;font-weight:700;color:#0f172a;line-height:1.4;">{{ticket_subject}}</td></tr>
  </table>
</div>
${ctaReview}`
    ),
  },

  ticket_escalated: {
    template_name: "Ticket escalated — email",
    subject: "Ticket [#{{ticket_id}}] has been escalated",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">Hello,</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#64748b;">This ticket has been <strong>escalated</strong> for faster resolution. Routing may change — watch for reassignment updates.</p>
${ticketInfoBox}
<p style="margin:16px 0 0;font-size:13px;color:#64748b;">Product: <strong style="color:#0f172a;">{{product}}</strong></p>
${ctaReview}`
    ),
  },

  ticket_resolved: {
    template_name: "Ticket resolved — email",
    subject: "Resolved: [#{{ticket_id}}] {{ticket_subject}}",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">Hi {{customer_name}},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#64748b;">Your ticket has been <strong style="color:#15803d;">resolved</strong>. We hope your issue is fully addressed.</p>
${ticketInfoBox}
<div style="margin:24px 0;text-align:center;">
  <p style="margin:0 0 12px;font-size:13px;color:#64748b;">How did we do?</p>
  <a href="{{csat_link}}" style="display:inline-block;background:#1E88E5;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 24px;border-radius:10px;">Take quick survey</a>
</div>
<p style="margin:20px 0 0;font-size:13px;color:#64748b;text-align:center;">Need more help? Reply to this email and we can reopen your ticket.</p>`
    ),
  },

  ticket_reopened: {
    template_name: "Ticket reopened — email",
    subject: "Ticket [#{{ticket_id}}] reopened",
    body: layout(
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">Hi {{agent_name}},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#64748b;">This ticket was <strong>reopened</strong>. Please review the latest activity and continue the conversation.</p>
${ticketInfoBox}
<p style="margin:16px 0 0;font-size:13px;color:#64748b;">Product: <strong style="color:#0f172a;">{{product}}</strong></p>
${ctaReview}`
    ),
  },
};

export function getDefaultNotificationTemplate(eventKey: string): NotificationTemplateDefaults {
  return (
    DEFAULT_NOTIFICATION_TEMPLATES[eventKey] ?? {
      template_name: "Notification — email",
      subject: "Notification: #{{ticket_id}}",
      body: layout(
        `<p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#64748b;">This is an automated message regarding ticket <strong style="color:#0f172a;">#{{ticket_id}}</strong>.</p>
${ticketInfoBox}
${ctaReview}`
      ),
    }
  );
}
