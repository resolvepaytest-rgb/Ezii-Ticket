import { pool } from "../../db/pool.js";

export type NotificationEmailSendStatus =
  | "sent"
  | "skipped"
  | "failed"
  | "disabled"
  | "no_smtp";

export type InsertNotificationEmailLogRow = {
  organisationId: number;
  ticketId: number | null;
  ticketStatus: string | null;
  notificationKey: string;
  product: string;
  mailFrom: string;
  recipientIntended: string | null;
  recipientActual: string | null;
  subject: string | null;
  sendStatus: NotificationEmailSendStatus;
  errorMessage: string | null;
  contextJson: Record<string, unknown>;
};

/**
 * Persists one notification email attempt. Errors are swallowed so logging never breaks sends.
 */
export async function insertNotificationEmailLog(row: InsertNotificationEmailLogRow): Promise<void> {
  try {
    await pool.query(
      `insert into notification_email_logs (
         organisation_id, ticket_id, ticket_status, notification_key, product,
         mail_from, recipient_intended, recipient_actual, subject,
         send_status, error_message, context_json
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [
        row.organisationId,
        row.ticketId,
        row.ticketStatus,
        row.notificationKey,
        row.product,
        row.mailFrom,
        row.recipientIntended,
        row.recipientActual,
        row.subject,
        row.sendStatus,
        row.errorMessage,
        JSON.stringify(row.contextJson),
      ]
    );
  } catch (e) {
    console.error("[notification_email_logs] insert failed", e);
  }
}
