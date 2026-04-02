import { pool } from "../../db/pool.js";

type CreateUserNotificationInput = {
  organisationId: number;
  userId: number;
  ticketId?: number | null;
  eventKey: string;
  title: string;
  message: string;
  navigateUrl: string;
  createdByUserId?: number | null;
};

export async function createUserNotification(input: CreateUserNotificationInput) {
  await pool.query(
    `insert into user_notifications
      (organisation_id, user_id, ticket_id, event_key, title, message, navigate_url, is_read, created_by_user_id, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,false,$8,now(),now())`,
    [
      input.organisationId,
      input.userId,
      input.ticketId ?? null,
      input.eventKey,
      input.title,
      input.message,
      input.navigateUrl,
      input.createdByUserId ?? null,
    ]
  );
}

