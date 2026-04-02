import { pool } from "../../db/pool.js";
import { TEAM_LEAD_NO_ASSIGNEE_EMAIL_DEFAULT } from "./notificationEmailDefaults.js";

export type LoadedEmailTemplate = {
  template_name: string;
  subject: string;
  body: string;
};

export async function getNotificationEmailTemplate(
  organisationId: number,
  eventKey: string
): Promise<LoadedEmailTemplate> {
  const r = await pool.query<{ subject: string | null; body: string; template_name: string }>(
    `select subject, body, template_name
     from notification_templates
     where organisation_id = $1 and event_key = $2 and channel = 'email' and is_active = true
     limit 1`,
    [organisationId, eventKey]
  );
  const row = r.rows[0];
  if (row?.body?.trim()) {
    return {
      template_name: row.template_name,
      subject: row.subject ?? "",
      body: row.body,
    };
  }
  if (eventKey === "team_lead_no_assignee") {
    return { ...TEAM_LEAD_NO_ASSIGNEE_EMAIL_DEFAULT };
  }
  return {
    template_name: "Notification — email",
    subject: "Notification",
    body: "<p>Notification</p>",
  };
}
