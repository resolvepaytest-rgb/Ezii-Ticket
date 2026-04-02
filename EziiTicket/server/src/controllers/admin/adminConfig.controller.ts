import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";

function canViewCrossTenantAudit(req: Request): boolean {
  const rn = String(req.user?.role_name ?? "").toLowerCase();
  if (rn === "system_admin") return true;
  return isEziiSystemAdmin(req);
}

export async function listCannedResponses(req: Request, res: Response) {
  const orgId = req.query.organisation_id ? asInt(req.query.organisation_id) : null;
  const result = await pool.query(
    `select id, organisation_id, product_id, title, body, audience, is_active, created_at, updated_at
     from canned_responses
     where ($1::bigint is null or organisation_id = $1::bigint)
     order by id desc`,
    [orgId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function createCannedResponse(req: Request, res: Response) {
  const { organisation_id, product_id, title, body, audience, is_active } = req.body ?? {};
  const orgId = asInt(organisation_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  if (!title || typeof title !== "string") return res.status(400).json({ ok: false, error: "title is required" });
  if (!body || typeof body !== "string") return res.status(400).json({ ok: false, error: "body is required" });

  const result = await pool.query(
    `insert into canned_responses (organisation_id, product_id, title, body, audience, is_active)
     values ($1,$2,$3,$4,coalesce($5,'all'),coalesce($6,true))
     returning id, organisation_id, product_id, title, body, audience, is_active, created_at, updated_at`,
    [orgId, asInt(product_id), title, body, audience ?? null, typeof is_active === "boolean" ? is_active : null]
  );
  await appendAdminAudit(req, orgId, "Canned Responses", "create", `Created response "${title}"`);
  return res.status(201).json({ ok: true, data: result.rows[0] });
}

export async function updateCannedResponse(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const { product_id, title, body, audience, is_active } = req.body ?? {};
  const result = await pool.query(
    `update canned_responses
     set product_id = coalesce($2, product_id),
         title = coalesce($3, title),
         body = coalesce($4, body),
         audience = coalesce($5, audience),
         is_active = coalesce($6, is_active),
         updated_at = now()
     where id=$1
     returning id, organisation_id, product_id, title, body, audience, is_active, created_at, updated_at`,
    [id, asInt(product_id), title ?? null, body ?? null, audience ?? null, typeof is_active === "boolean" ? is_active : null]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, Number(row.organisation_id), "Canned Responses", "update", `Updated response "${row.title}"`);
  return res.json({ ok: true, data: row });
}

export async function deleteCannedResponse(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const result = await pool.query("delete from canned_responses where id=$1 returning id, organisation_id", [id]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, Number(row.organisation_id), "Canned Responses", "delete", `Deleted response id=${id}`);
  return res.json({ ok: true, data: { id } });
}

export async function listCustomFields(req: Request, res: Response) {
  const orgId = req.query.organisation_id ? asInt(req.query.organisation_id) : null;
  const result = await pool.query(
    `select id, organisation_id, product_id, label, field_key, field_type, is_required, visibility, options_json, is_active, created_at, updated_at
     from custom_fields
     where ($1::bigint is null or organisation_id = $1::bigint)
     order by id desc`,
    [orgId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function createCustomField(req: Request, res: Response) {
  const { organisation_id, product_id, label, field_key, field_type, is_required, visibility, options_json, is_active } = req.body ?? {};
  const orgId = asInt(organisation_id);
  const productId = asInt(product_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  if (!productId) return res.status(400).json({ ok: false, error: "product_id is required" });
  if (!label || typeof label !== "string") return res.status(400).json({ ok: false, error: "label is required" });
  if (!field_key || typeof field_key !== "string") return res.status(400).json({ ok: false, error: "field_key is required" });
  if (!field_type || typeof field_type !== "string") return res.status(400).json({ ok: false, error: "field_type is required" });

  const result = await pool.query(
    `insert into custom_fields (organisation_id, product_id, label, field_key, field_type, is_required, visibility, options_json, is_active)
     values ($1,$2,$3,$4,$5,coalesce($6,false),coalesce($7,'agent_only'),$8,coalesce($9,true))
     returning id, organisation_id, product_id, label, field_key, field_type, is_required, visibility, options_json, is_active, created_at, updated_at`,
    [
      orgId,
      productId,
      label,
      field_key,
      field_type,
      typeof is_required === "boolean" ? is_required : null,
      visibility ?? null,
      options_json ?? null,
      typeof is_active === "boolean" ? is_active : null,
    ]
  );
  await appendAdminAudit(req, orgId, "Custom Fields", "create", `Added field "${label}"`);
  return res.status(201).json({ ok: true, data: result.rows[0] });
}

export async function updateCustomField(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const { label, field_type, is_required, visibility, options_json, is_active } = req.body ?? {};
  const result = await pool.query(
    `update custom_fields
     set label = coalesce($2, label),
         field_type = coalesce($3, field_type),
         is_required = coalesce($4, is_required),
         visibility = coalesce($5, visibility),
         options_json = coalesce($6, options_json),
         is_active = coalesce($7, is_active),
         updated_at = now()
     where id=$1
     returning id, organisation_id, product_id, label, field_key, field_type, is_required, visibility, options_json, is_active, created_at, updated_at`,
    [id, label ?? null, field_type ?? null, typeof is_required === "boolean" ? is_required : null, visibility ?? null, options_json ?? null, typeof is_active === "boolean" ? is_active : null]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, Number(row.organisation_id), "Custom Fields", "update", `Updated field "${row.label}"`);
  return res.json({ ok: true, data: row });
}

export async function deleteCustomField(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const result = await pool.query("delete from custom_fields where id=$1 returning id, organisation_id", [id]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, Number(row.organisation_id), "Custom Fields", "delete", `Deleted field id=${id}`);
  return res.json({ ok: true, data: { id } });
}

export async function listApiTokens(req: Request, res: Response) {
  const orgId = req.query.organisation_id ? asInt(req.query.organisation_id) : null;
  const result = await pool.query(
    `select id, organisation_id, token_name, token_masked, is_active, created_at, updated_at
     from api_tokens
     where ($1::bigint is null or organisation_id = $1::bigint)
     order by id desc`,
    [orgId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function createApiToken(req: Request, res: Response) {
  const { organisation_id, token_name, is_active } = req.body ?? {};
  const orgId = asInt(organisation_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  if (!token_name || typeof token_name !== "string") return res.status(400).json({ ok: false, error: "token_name is required" });
  const generatedRaw = `ez_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const tokenMasked = `${generatedRaw.slice(0, 6)}...${generatedRaw.slice(-4)}`;
  const result = await pool.query(
    `insert into api_tokens (organisation_id, token_name, token_masked, is_active)
     values ($1,$2,$3,coalesce($4,true))
     returning id, organisation_id, token_name, token_masked, is_active, created_at, updated_at`,
    [orgId, token_name, tokenMasked, typeof is_active === "boolean" ? is_active : null]
  );
  await appendAdminAudit(req, orgId, "API & Webhooks", "create_token", `Generated API token "${token_name}"`);
  return res.status(201).json({ ok: true, data: { ...result.rows[0], token_raw: generatedRaw } });
}

export async function updateApiToken(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const { is_active } = req.body ?? {};
  const result = await pool.query(
    `update api_tokens
     set is_active = coalesce($2, is_active),
         updated_at = now()
     where id=$1
     returning id, organisation_id, token_name, token_masked, is_active, created_at, updated_at`,
    [id, typeof is_active === "boolean" ? is_active : null]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, Number(row.organisation_id), "API & Webhooks", "update_token", `${row.is_active ? "Enabled" : "Disabled"} token "${row.token_name}"`);
  return res.json({ ok: true, data: row });
}

export async function listWebhooks(req: Request, res: Response) {
  const orgId = req.query.organisation_id ? asInt(req.query.organisation_id) : null;
  const result = await pool.query(
    `select id, organisation_id, webhook_name, endpoint, events_json, is_active, created_at, updated_at
     from webhooks
     where ($1::bigint is null or organisation_id = $1::bigint)
     order by id desc`,
    [orgId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function createWebhook(req: Request, res: Response) {
  const { organisation_id, webhook_name, endpoint, events_json, is_active } = req.body ?? {};
  const orgId = asInt(organisation_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  if (!webhook_name || typeof webhook_name !== "string") return res.status(400).json({ ok: false, error: "webhook_name is required" });
  if (!endpoint || typeof endpoint !== "string") return res.status(400).json({ ok: false, error: "endpoint is required" });
  const result = await pool.query(
    `insert into webhooks (organisation_id, webhook_name, endpoint, events_json, is_active)
     values ($1,$2,$3,coalesce($4,'[]'),coalesce($5,true))
     returning id, organisation_id, webhook_name, endpoint, events_json, is_active, created_at, updated_at`,
    [orgId, webhook_name, endpoint, events_json ?? null, typeof is_active === "boolean" ? is_active : null]
  );
  await appendAdminAudit(req, orgId, "API & Webhooks", "create_webhook", `Created webhook "${webhook_name}"`);
  return res.status(201).json({ ok: true, data: result.rows[0] });
}

export async function updateWebhook(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const { webhook_name, endpoint, events_json, is_active } = req.body ?? {};
  const result = await pool.query(
    `update webhooks
     set webhook_name = coalesce($2, webhook_name),
         endpoint = coalesce($3, endpoint),
         events_json = coalesce($4, events_json),
         is_active = coalesce($5, is_active),
         updated_at = now()
     where id=$1
     returning id, organisation_id, webhook_name, endpoint, events_json, is_active, created_at, updated_at`,
    [id, webhook_name ?? null, endpoint ?? null, events_json ?? null, typeof is_active === "boolean" ? is_active : null]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, Number(row.organisation_id), "API & Webhooks", "update_webhook", `Updated webhook "${row.webhook_name}"`);
  return res.json({ ok: true, data: row });
}

export async function deleteWebhook(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const result = await pool.query("delete from webhooks where id=$1 returning id, organisation_id", [id]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, Number(row.organisation_id), "API & Webhooks", "delete_webhook", `Deleted webhook id=${id}`);
  return res.json({ ok: true, data: { id } });
}

export async function listAdminAuditLogs(req: Request, res: Response) {
  const orgId = req.query.organisation_id ? asInt(req.query.organisation_id) : null;
  if (orgId === null && !canViewCrossTenantAudit(req)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const limitRaw = asInt(req.query.limit);
  if (limitRaw == null) {
    const result = await pool.query(
      `select id, organisation_id, module, action, summary, actor_user_id, actor_role_name, created_at
       from admin_audit_logs
       where ($1::bigint is null or organisation_id = $1::bigint)
       order by created_at desc, id desc`,
      [orgId]
    );
    return res.json({ ok: true, data: result.rows });
  }
  const limit = Math.min(500, Math.max(1, limitRaw));
  const result = await pool.query(
    `select id, organisation_id, module, action, summary, actor_user_id, actor_role_name, created_at
     from admin_audit_logs
     where ($1::bigint is null or organisation_id = $1::bigint)
     order by created_at desc, id desc
     limit $2`,
    [orgId, limit]
  );
  return res.json({ ok: true, data: result.rows });
}
