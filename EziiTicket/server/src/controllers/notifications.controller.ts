import type { Request, Response } from "express";
import { pool } from "../db/pool.js";
import { asInt } from "./admin/adminUtils.js";

function currentOrgId(req: Request): number | null {
  return asInt(req.user?.org_id);
}

function currentUserId(req: Request): number | null {
  return asInt(req.user?.user_id);
}

export async function listMyNotifications(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  if (!orgId || !userId) return res.status(400).json({ ok: false, error: "invalid user context" });

  const status = String(req.query.status ?? "unread").toLowerCase();
  const limitRaw = asInt(req.query.limit);
  const limit = Math.min(100, Math.max(1, limitRaw ?? 50));
  const readFilter = status === "read" ? true : status === "all" ? null : false;

  const items = await pool.query(
    `select id, organisation_id, user_id, ticket_id, event_key, title, message, navigate_url, is_read, created_by_user_id, created_at, updated_at
     from user_notifications
     where organisation_id = $1
       and user_id = $2
       and created_at >= now() - interval '30 days'
       and ($3::boolean is null or is_read = $3)
     order by created_at desc
     limit $4`,
    [orgId, userId, readFilter, limit]
  );

  const unreadCount = await pool.query<{ c: string }>(
    `select count(*)::text as c
     from user_notifications
     where organisation_id = $1
       and user_id = $2
       and is_read = false
       and created_at >= now() - interval '30 days'`,
    [orgId, userId]
  );

  return res.json({
    ok: true,
    data: {
      items: items.rows,
      unread_count: Number(unreadCount.rows[0]?.c ?? 0),
    },
  });
}

export async function markNotificationRead(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  const id = asInt(req.params.id);
  if (!orgId || !userId || !id) return res.status(400).json({ ok: false, error: "invalid request" });

  const updated = await pool.query(
    `update user_notifications
     set is_read = true, updated_at = now()
     where id = $1 and organisation_id = $2 and user_id = $3
     returning id`,
    [id, orgId, userId]
  );
  if (updated.rowCount === 0) return res.status(404).json({ ok: false, error: "notification not found" });

  return res.json({ ok: true, data: { id } });
}

export async function markAllNotificationsRead(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  if (!orgId || !userId) return res.status(400).json({ ok: false, error: "invalid user context" });

  await pool.query(
    `update user_notifications
     set is_read = true, updated_at = now()
     where organisation_id = $1
       and user_id = $2
       and is_read = false
       and created_at >= now() - interval '30 days'`,
    [orgId, userId]
  );

  return res.json({ ok: true });
}

