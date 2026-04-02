import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";

export async function listNotificationTemplates(req: Request, res: Response) {
  const orgId = req.query.organisation_id ? asInt(req.query.organisation_id) : null;
  const result = await pool.query(
    `select id, organisation_id, event_key, channel, template_name, subject, body, is_active, created_at, updated_at
     from notification_templates
     where ($1::bigint is null or organisation_id = $1::bigint)
     order by organisation_id asc, event_key asc, channel asc, id asc`,
    [orgId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function createNotificationTemplate(req: Request, res: Response) {
  const { organisation_id, event_key, channel, template_name, subject, body, is_active } =
    req.body ?? {};
  const orgId = asInt(organisation_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  if (!event_key || typeof event_key !== "string") return res.status(400).json({ ok: false, error: "event_key is required" });
  if (!template_name || typeof template_name !== "string") return res.status(400).json({ ok: false, error: "template_name is required" });
  if (!body || typeof body !== "string") return res.status(400).json({ ok: false, error: "body is required" });

  const result = await pool.query(
    `insert into notification_templates (organisation_id, event_key, channel, template_name, subject, body, is_active)
     values ($1,$2,coalesce($3,'email'),$4,$5,$6,coalesce($7,true))
     returning id, organisation_id, event_key, channel, template_name, subject, body, is_active, created_at, updated_at`,
    [
      orgId,
      event_key,
      channel ?? null,
      template_name,
      subject ?? null,
      body,
      typeof is_active === "boolean" ? is_active : null,
    ]
  );

  await appendAdminAudit(
    req,
    orgId,
    "Notification Templates",
    "create",
    `Created template "${template_name}" for event "${event_key}"`
  );
  return res.status(201).json({ ok: true, data: result.rows[0] });
}

export async function updateNotificationTemplate(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const { event_key, channel, template_name, subject, body, is_active } = req.body ?? {};

  const result = await pool.query(
    `update notification_templates
     set event_key = coalesce($2, event_key),
         channel = coalesce($3, channel),
         template_name = coalesce($4, template_name),
         subject = coalesce($5, subject),
         body = coalesce($6, body),
         is_active = coalesce($7, is_active),
         updated_at = now()
     where id=$1
     returning id, organisation_id, event_key, channel, template_name, subject, body, is_active, created_at, updated_at`,
    [
      id,
      event_key ?? null,
      channel ?? null,
      template_name ?? null,
      subject ?? null,
      body ?? null,
      typeof is_active === "boolean" ? is_active : null,
    ]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "Notification Templates",
    "update",
    `Updated template "${row.template_name}" for event "${row.event_key}"`
  );
  return res.json({ ok: true, data: row });
}

export async function deleteNotificationTemplate(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const result = await pool.query(
    "delete from notification_templates where id=$1 returning id, organisation_id, template_name, event_key",
    [id]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "Notification Templates",
    "delete",
    `Deleted template "${row.template_name}" for event "${row.event_key}"`
  );
  return res.json({ ok: true, data: { id: row.id } });
}

