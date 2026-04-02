import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";
import { ensureTenantAndDefaultsByOrgId } from "../../services/provisioning/ensureTenantAndDefaults.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";

const APPLY_MODES = new Set(["all", "reportees", "attribute", "sub_attribute"]);

function parseApplyRolePayload(
  body: Record<string, unknown> | undefined | null,
  defaults?: {
    apply_role_to?: string;
    apply_attribute_id?: string | null;
    apply_sub_attribute_id?: string | null;
    apply_worker_type_id?: number | null;
  }
): {
  apply_role_to: string;
  apply_attribute_id: string | null;
  apply_sub_attribute_id: string | null;
  apply_worker_type_id: number | null;
} | { error: string } {
  const raw = body ?? {};
  const d = defaults ?? {};
  const apply_role_to =
    typeof raw.apply_role_to === "string" && APPLY_MODES.has(raw.apply_role_to)
      ? raw.apply_role_to
      : d.apply_role_to && APPLY_MODES.has(d.apply_role_to)
        ? d.apply_role_to!
        : "all";
  const apply_attribute_id =
    raw.apply_attribute_id === null || raw.apply_attribute_id === undefined
      ? d.apply_attribute_id ?? null
      : String(raw.apply_attribute_id).trim() || null;
  const apply_sub_attribute_id =
    raw.apply_sub_attribute_id === null || raw.apply_sub_attribute_id === undefined
      ? d.apply_sub_attribute_id ?? null
      : String(raw.apply_sub_attribute_id).trim() || null;
  const wt = raw.apply_worker_type_id !== undefined ? raw.apply_worker_type_id : d.apply_worker_type_id;
  const apply_worker_type_id =
    wt === null || wt === undefined || wt === ""
      ? null
      : Number(wt);
  if (apply_worker_type_id != null && !Number.isFinite(apply_worker_type_id)) {
    return { error: "invalid apply_worker_type_id" };
  }
  if (apply_role_to === "attribute" && !apply_attribute_id) {
    return { error: "apply_attribute_id is required when apply_role_to is attribute" };
  }
  if (apply_role_to === "sub_attribute" && (!apply_attribute_id || !apply_sub_attribute_id)) {
    return { error: "apply_attribute_id and apply_sub_attribute_id are required for sub_attribute" };
  }
  return {
    apply_role_to,
    apply_attribute_id,
    apply_sub_attribute_id,
    apply_worker_type_id,
  };
}

export async function getRoles(req: Request, res: Response) {
  const authOrgId = asInt(req.user?.org_id);
  if (!authOrgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  const requestedOrgId = asInt(req.query.organisation_id);
  const orgId = isEziiSystemAdmin(req) && requestedOrgId ? requestedOrgId : authOrgId;
  await ensureTenantAndDefaultsByOrgId(orgId);
  const result = await pool.query(
    `select id, organisation_id, name, description, is_default, permissions_json,
            apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id
     from roles where organisation_id = $1 order by id asc`,
    [orgId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function createRole(req: Request, res: Response) {
  const { name, description, permissions_json, organisation_id } = req.body ?? {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  if (typeof description !== "string" && description !== null && description !== undefined) {
    return res.status(400).json({ ok: false, error: "description must be string or null" });
  }

  const rolePermissions =
    permissions_json && typeof permissions_json === "object" ? permissions_json : {};
  const authOrgId = asInt(req.user?.org_id);
  if (!authOrgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  const requestedOrgId = asInt(organisation_id);
  const orgId = isEziiSystemAdmin(req) && requestedOrgId ? requestedOrgId : authOrgId;

  await ensureTenantAndDefaultsByOrgId(orgId);
  const apply = parseApplyRolePayload(req.body as Record<string, unknown>);
  if ("error" in apply) return res.status(400).json({ ok: false, error: apply.error });
  const rolePermissionsStr = JSON.stringify(rolePermissions);
  const result = await pool.query(
    `insert into roles (organisation_id, name, description, permissions_json, is_default,
                        apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id)
     values ($1,$2,$3,coalesce($4::jsonb,'{}'::jsonb),false,$5,$6,$7,$8)
     returning id, organisation_id, name, description, is_default, permissions_json,
               apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id`,
    [
      orgId,
      name.trim(),
      description ?? null,
      rolePermissionsStr,
      apply.apply_role_to,
      apply.apply_attribute_id,
      apply.apply_sub_attribute_id,
      apply.apply_worker_type_id,
    ]
  );

  const row = result.rows[0];
  await appendAdminAudit(req, orgId, "Roles", "create", `Created role "${row.name}"`);
  return res.status(201).json({ ok: true, data: row });
}

export async function updateRole(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const existing = await pool.query("select id, organisation_id, name, is_default from roles where id=$1", [id]);
  const row0 = existing.rows[0];
  if (!row0) return res.status(404).json({ ok: false, error: "not found" });

  const { name, description, permissions_json } = req.body ?? {};
  const nextName = name != null ? (typeof name === "string" ? name.trim() : null) : null;

  const rolePermissions = permissions_json && typeof permissions_json === "object" ? permissions_json : null;
  const orgId = asInt(req.user?.org_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  if (Number(row0.organisation_id) !== orgId) return res.status(403).json({ ok: false, error: "forbidden" });
  await ensureTenantAndDefaultsByOrgId(orgId);
  const existingApply = await pool.query<{
    apply_role_to: string;
    apply_attribute_id: string | null;
    apply_sub_attribute_id: string | null;
    apply_worker_type_id: string | null;
  }>(
    `select apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id::text
     from roles where id = $1 and organisation_id = $2`,
    [id, orgId]
  );
  const ea = existingApply.rows[0];
  const apply = parseApplyRolePayload(req.body as Record<string, unknown>, {
    apply_role_to: ea?.apply_role_to,
    apply_attribute_id: ea?.apply_attribute_id,
    apply_sub_attribute_id: ea?.apply_sub_attribute_id,
    apply_worker_type_id:
      ea?.apply_worker_type_id != null && ea.apply_worker_type_id !== ""
        ? Number(ea.apply_worker_type_id)
        : null,
  });
  if ("error" in apply) return res.status(400).json({ ok: false, error: apply.error });
  const rolePermissionsStr = rolePermissions ? JSON.stringify(rolePermissions) : null;
  const isEziiOrg = orgId === 1;
  if (isEziiOrg && row0.is_default && nextName && nextName !== row0.name) {
    return res.status(403).json({ ok: false, error: "default role names cannot be changed in org 1" });
  }
  const result = await pool.query(
    `update roles
     set name = coalesce($2, name),
         description = coalesce($3, description),
         permissions_json = coalesce($4::jsonb, permissions_json),
         apply_role_to = $6,
         apply_attribute_id = $7,
         apply_sub_attribute_id = $8,
         apply_worker_type_id = $9
     where id=$1 and organisation_id = $5
     returning id, organisation_id, name, description, is_default, permissions_json,
               apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id`,
    [
      id,
      nextName,
      description ?? null,
      rolePermissionsStr,
      orgId,
      apply.apply_role_to,
      apply.apply_attribute_id,
      apply.apply_sub_attribute_id,
      apply.apply_worker_type_id,
    ]
  );

  const row = result.rows[0];
  await appendAdminAudit(req, orgId, "Roles", "update", `Updated role "${row.name}"`);
  return res.json({ ok: true, data: row });
}

export async function deleteRole(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const existing = await pool.query("select id, organisation_id, name, is_default from roles where id=$1", [id]);
  const row0 = existing.rows[0];
  if (!row0) return res.status(404).json({ ok: false, error: "not found" });

  const orgId = asInt(req.user?.org_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  if (Number(row0.organisation_id) !== orgId) return res.status(403).json({ ok: false, error: "forbidden" });
  const isEziiOrg = orgId === 1;
  if (isEziiOrg && row0.is_default) {
    return res.status(403).json({ ok: false, error: "default role cannot be deleted in org 1" });
  }
  await ensureTenantAndDefaultsByOrgId(orgId);
  await pool.query("delete from roles where id=$1 and organisation_id=$2", [id, orgId]);
  await appendAdminAudit(req, orgId, "Roles", "delete", `Deleted role "${row0.name}"`);
  return res.json({ ok: true, data: { id } });
}

export async function listOrgSupportLevels(req: Request, res: Response) {
  const authOrgId = asInt(req.user?.org_id);
  if (!authOrgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  const requestedOrgId = asInt(req.query.organisation_id);
  const orgId = isEziiSystemAdmin(req) && requestedOrgId ? requestedOrgId : authOrgId;

  const result = await pool.query(
    `select id, organisation_id, code, name, description, is_default, created_at, updated_at
     from org_support_levels
     where organisation_id = $1
     order by id asc`,
    [orgId]
  );
  return res.json({ ok: true, data: result.rows });
}

/** @deprecated Use listOrgSupportLevels */
export const listDesignations = listOrgSupportLevels;

export async function createOrgSupportLevel(req: Request, res: Response) {
  const { code, name, description, organisation_id } = req.body ?? {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ ok: false, error: "code is required" });
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  if (typeof description !== "string" && description !== null && description !== undefined) {
    return res.status(400).json({ ok: false, error: "description must be string or null" });
  }

  const authOrgId = asInt(req.user?.org_id);
  if (!authOrgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  const requestedOrgId = asInt(organisation_id);
  const orgId = isEziiSystemAdmin(req) && requestedOrgId ? requestedOrgId : authOrgId;

  const codeTrim = code.trim();
  const nameTrim = name.trim();

  const existing = await pool.query(
    `select id, organisation_id, code, name, description, is_default, created_at, updated_at
     from org_support_levels
     where organisation_id = $1 and lower(trim(code)) = lower(trim($2))
     limit 1`,
    [orgId, codeTrim]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    return res.status(200).json({ ok: true, data: row, existing: true });
  }

  const result = await pool.query(
    `insert into org_support_levels (organisation_id, code, name, description, is_default)
     values ($1, $2, $3, $4, false)
     returning id, organisation_id, code, name, description, is_default, created_at, updated_at`,
    [orgId, codeTrim, nameTrim, description ?? null]
  );

  const row = result.rows[0];
  await appendAdminAudit(req, orgId, "Roles", "create_org_support_level", `Created org support level "${row.name}"`);
  return res.status(201).json({ ok: true, data: row });
}

export const createDesignation = createOrgSupportLevel;

export async function updateOrgSupportLevel(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const existing = await pool.query("select id, organisation_id, name from org_support_levels where id=$1", [id]);
  const row0 = existing.rows[0];
  if (!row0) return res.status(404).json({ ok: false, error: "not found" });

  const orgId = asInt(req.user?.org_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  if (Number(row0.organisation_id) !== orgId && !isEziiSystemAdmin(req)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const { code, name, description } = req.body ?? {};
  const nextCode = code != null ? (typeof code === "string" ? code.trim() : null) : null;
  const nextName = name != null ? (typeof name === "string" ? name.trim() : null) : null;
  if (code != null && !nextCode) return res.status(400).json({ ok: false, error: "invalid code" });
  if (name != null && !nextName) return res.status(400).json({ ok: false, error: "invalid name" });
  if (typeof description !== "string" && description !== null && description !== undefined) {
    return res.status(400).json({ ok: false, error: "description must be string or null" });
  }

  const result = await pool.query(
    `update org_support_levels
     set code = coalesce($2, code),
         name = coalesce($3, name),
         description = coalesce($4, description),
         updated_at = now()
     where id = $1
     returning id, organisation_id, code, name, description, is_default, created_at, updated_at`,
    [id, nextCode, nextName, description ?? null]
  );

  const row = result.rows[0];
  await appendAdminAudit(req, Number(row.organisation_id), "Roles", "update_org_support_level", `Updated org support level "${row.name}"`);
  return res.json({ ok: true, data: row });
}

export const updateDesignation = updateOrgSupportLevel;

export async function deleteOrgSupportLevel(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const existing = await pool.query("select id, organisation_id, name, is_default from org_support_levels where id=$1", [
    id,
  ]);
  const row0 = existing.rows[0];
  if (!row0) return res.status(404).json({ ok: false, error: "not found" });
  if (row0.is_default) return res.status(403).json({ ok: false, error: "default org support level cannot be deleted" });

  const orgId = asInt(req.user?.org_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  if (Number(row0.organisation_id) !== orgId && !isEziiSystemAdmin(req)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const inUse = await pool.query(
    "select 1 from user_org_support_levels where support_level_id = $1 and is_active = true limit 1",
    [id]
  );
  if ((inUse.rowCount ?? 0) > 0) {
    return res.status(409).json({ ok: false, error: "support level is assigned to active users" });
  }

  await pool.query("delete from org_support_levels where id = $1", [id]);
  await appendAdminAudit(req, Number(row0.organisation_id), "Roles", "delete_org_support_level", `Deleted org support level "${row0.name}"`);
  return res.json({ ok: true, data: { id } });
}

export const deleteDesignation = deleteOrgSupportLevel;

