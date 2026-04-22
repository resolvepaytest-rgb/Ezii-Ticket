import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";
import { ensureTenantAndDefaultsByOrgId } from "../../services/provisioning/ensureTenantAndDefaults.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";
import { fetchExternalOrgGet } from "../../services/externalOrgApiClient.js";
import { EXTERNAL_ORG_PATHS } from "../../config/externalOrgApi.js";

const APPLY_MODES = new Set(["all", "reportees", "worker_type", "attribute", "customer_org", "internal_support"]);

type ScopedUserRow = {
  user_id: number;
  organisation_id: number;
  name: string;
  email: string;
  status: string;
  user_type: string | null;
  type_id_1: string | null;
  type_id_12: string | null;
  role_name: string | null;
};

async function loadOrgUsers(orgId: number): Promise<ScopedUserRow[]> {
  const result = await pool.query<ScopedUserRow>(
    `select u.user_id::int as user_id,
            u.organisation_id::int as organisation_id,
            u.name,
            u.email,
            coalesce(u.status, 'active') as status,
            u.user_type,
            u.type_id_1::text as type_id_1,
            u.type_id_12::text as type_id_12,
            null::text as role_name
     from users u
     where u.organisation_id = $1::bigint
     union
     select u.user_id::int as user_id,
            u.organisation_id::int as organisation_id,
            coalesce(nullif(trim(uso.user_name), ''), u.name) as name,
            coalesce(nullif(trim(uso.email), ''), u.email) as email,
            coalesce(u.status, 'active') as status,
            u.user_type,
            u.type_id_1::text as type_id_1,
            u.type_id_12::text as type_id_12,
            uso.ticket_role::text as role_name
     from user_scope_org uso
     join users u on u.user_id = uso.user_id
     where uso.scope_org_id = $1::bigint
       and uso.is_active = true`,
    [orgId]
  );
  const byUserId = new Map<number, ScopedUserRow>();
  for (const row of result.rows) {
    if (!byUserId.has(row.user_id)) byUserId.set(row.user_id, row);
  }
  return Array.from(byUserId.values()).sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" })
  );
}

function forwardAuth(req: Request): string | undefined {
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth.trim() ? auth : undefined;
}

function splitCsvIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function rolesHasCreatedAtColumn(): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'roles'
        and column_name = 'created_at'
    ) as "exists"`
  );
  return Boolean(res.rows[0]?.exists);
}

function rolesCreatedAtSelectExpr(hasCreatedAt: boolean) {
  return hasCreatedAt ? "created_at" : "null::timestamptz as created_at";
}

function parseApplyRolePayload(
  body: Record<string, unknown> | undefined | null,
  defaults?: {
    apply_role_to?: string;
    apply_attribute_id?: string | null;
    apply_sub_attribute_id?: string | null;
    apply_worker_type_id?: string | null;
  }
): {
  apply_role_to: string;
  apply_attribute_id: string | null;
  apply_sub_attribute_id: string | null;
  apply_worker_type_id: string | null;
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
  const apply_worker_type_id = wt === null || wt === undefined ? null : String(wt).trim() || null;
  if (apply_role_to === "attribute" && !apply_attribute_id) {
    return { error: "apply_attribute_id is required when apply_role_to is attribute" };
  }
  if (apply_role_to !== "attribute") {
    return {
      apply_role_to,
      apply_attribute_id: null,
      apply_sub_attribute_id: null,
      apply_worker_type_id: apply_role_to === "worker_type" ? apply_worker_type_id : null,
    };
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
  const hasCreatedAt = await rolesHasCreatedAtColumn();
  const createdAtExpr = rolesCreatedAtSelectExpr(hasCreatedAt);
  const result = await pool.query(
    `select id, organisation_id, name, description, is_default, permissions_json,
            apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id, ${createdAtExpr}
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
  const hasCreatedAt = await rolesHasCreatedAtColumn();
  const createdAtExpr = rolesCreatedAtSelectExpr(hasCreatedAt);
  const roleBody = (req.body ?? {}) as Record<string, unknown>;
  const inferredApplyRoleTo = orgId === 1 ? "internal_support" : "customer_org";
  const requestedApplyRoleTo =
    typeof roleBody.apply_role_to === "string" ? roleBody.apply_role_to.trim() : "";
  const normalizedApplyBody: Record<string, unknown> =
    requestedApplyRoleTo && requestedApplyRoleTo !== "all"
      ? roleBody
      : { ...roleBody, apply_role_to: inferredApplyRoleTo };
  const apply = parseApplyRolePayload(normalizedApplyBody);
  if ("error" in apply) return res.status(400).json({ ok: false, error: apply.error });
  const rolePermissionsStr = JSON.stringify(rolePermissions);
  const result = await pool.query(
    `insert into roles (organisation_id, name, description, permissions_json, is_default,
                        apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id)
     values ($1,$2,$3,coalesce($4::jsonb,'{}'::jsonb),false,$5,$6,$7,$8)
     returning id, organisation_id, name, description, is_default, permissions_json,
               apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id, ${createdAtExpr}`,
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

export async function listScopedUsersByRole(req: Request, res: Response) {
  const roleId = asInt(req.params.id);
  if (!roleId) return res.status(400).json({ ok: false, error: "invalid role id" });
  const authOrgId = asInt(req.user?.org_id);
  if (!authOrgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  const requestedOrgId = asInt(req.query.organisation_id);
  const targetOrgId = isEziiSystemAdmin(req) && requestedOrgId ? requestedOrgId : authOrgId;

  const roleQ = await pool.query<{
    id: number;
    organisation_id: number;
    apply_role_to: string;
    apply_attribute_id: string | null;
    apply_sub_attribute_id: string | null;
    apply_worker_type_id: string | null;
  }>(
    `select id, organisation_id, apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id
     from roles
     where id = $1::bigint and organisation_id = $2::bigint
     limit 1`,
    [roleId, targetOrgId]
  );
  const role = roleQ.rows[0];
  if (!role) return res.status(404).json({ ok: false, error: "role not found" });

  const users = await loadOrgUsers(targetOrgId);
  const mode = String(role.apply_role_to ?? "all").toLowerCase();

  if (mode === "all") {
    return res.json({ ok: true, data: users, meta: { mode, total: users.length } });
  }

  if (mode === "customer_org") {
    const filtered = users.filter((u) => Number(u.organisation_id) !== 1);
    return res.json({ ok: true, data: filtered, meta: { mode, total: filtered.length } });
  }

  if (mode === "internal_support") {
    const filtered = users.filter((u) => {
      if (Number(u.organisation_id) === 1) return true;
      const roleName = String(u.role_name ?? "").toLowerCase();
      return roleName.includes("agent") || roleName.includes("support") || roleName.includes("team");
    });
    return res.json({ ok: true, data: filtered, meta: { mode, total: filtered.length } });
  }

  if (mode === "reportees") {
    return res.json({
      ok: true,
      data: [],
      meta: {
        mode,
        total: 0,
        runtime_resolved: true,
        message: "Reportees are resolved at runtime for logged-in user access checks.",
      },
    });
  }

  if (mode === "worker_type") {
    if (!role.apply_worker_type_id) {
      return res.status(400).json({ ok: false, error: "apply_worker_type_id is required for worker_type scope" });
    }
    const selectedWorkerTypeIds = splitCsvIds(role.apply_worker_type_id);
    if (!selectedWorkerTypeIds.length) return res.json({ ok: true, data: users, meta: { mode, total: users.length } });
    const wtRes = await fetchExternalOrgGet(EXTERNAL_ORG_PATHS.workerTypeList, forwardAuth(req));
    if (wtRes.status >= 400) {
      return res.status(wtRes.status).json({ ok: false, error: "failed to fetch worker types from external api" });
    }
    const wtPayload = wtRes.json as {
      worker_type_list?: Array<{ id?: number | string; customer_worker_type?: string }>;
      data?: Array<{ id?: number | string; customer_worker_type?: string }>;
    } | null;
    const wtList = wtPayload?.worker_type_list ?? wtPayload?.data ?? [];
    const selectedNames = new Set(
      wtList
        .filter((w) => selectedWorkerTypeIds.includes(String(w.id)))
        .map((w) => String(w.customer_worker_type ?? "").trim().toLowerCase())
        .filter(Boolean)
    );
    if (!selectedNames.size) return res.json({ ok: true, data: [], meta: { mode, total: 0 } });
    const filtered = users.filter((u) => selectedNames.has(String(u.user_type ?? "").trim().toLowerCase()));
    return res.json({ ok: true, data: filtered, meta: { mode, total: filtered.length } });
  }

  if (mode === "attribute") {
    if (!role.apply_attribute_id) {
      return res.status(400).json({ ok: false, error: "apply_attribute_id is required for attribute scope" });
    }
    const attrIds = splitCsvIds(role.apply_attribute_id);
    const subAttrIds = splitCsvIds(role.apply_sub_attribute_id);
    if (!attrIds.length) {
      return res.status(400).json({ ok: false, error: "at least one apply_attribute_id is required for attribute scope" });
    }
    const q = await pool.query<ScopedUserRow>(
      `select u.user_id::int as user_id,
              u.organisation_id::int as organisation_id,
              u.name,
              u.email,
              coalesce(u.status, 'active') as status,
              u.user_type,
              u.type_id_1::text as type_id_1,
              u.type_id_12::text as type_id_12,
              null::text as role_name
       from users u
       where u.organisation_id = $1::bigint
         and (
           u.type_id_1::text = any($2::text[])
           or coalesce(u.worker_master_raw ->> 'attribute_id', '') = any($2::text[])
         )
         and (
           coalesce(array_length($3::text[], 1), 0) = 0
           or u.type_id_12::text = any($3::text[])
           or coalesce(u.worker_master_raw ->> 'attribute_sub_id', '') = any($3::text[])
         )
         and (
           coalesce(array_length($4::text[], 1), 0) = 0
           or coalesce(u.worker_master_raw ->> 'worker_type_id', '') = any($4::text[])
         )
       order by u.name asc`,
      [targetOrgId, attrIds, subAttrIds, splitCsvIds(role.apply_worker_type_id)]
    );
    return res.json({ ok: true, data: q.rows, meta: { mode, total: q.rows.length } });
  }

  return res.json({ ok: true, data: users, meta: { mode: "all", total: users.length } });
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
  const authOrgId = asInt(req.user?.org_id);
  if (!authOrgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  const isSystemAdmin = isEziiSystemAdmin(req);
  const roleOrgId = Number(row0.organisation_id);
  if (!isSystemAdmin && roleOrgId !== authOrgId) return res.status(403).json({ ok: false, error: "forbidden" });
  const orgId = isSystemAdmin ? roleOrgId : authOrgId;
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
        ? String(ea.apply_worker_type_id)
        : null,
  });
  if ("error" in apply) return res.status(400).json({ ok: false, error: apply.error });
  const rolePermissionsStr = rolePermissions ? JSON.stringify(rolePermissions) : null;
  const isEziiOrg = orgId === 1;
  if (isEziiOrg && row0.is_default && nextName && nextName !== row0.name) {
    return res.status(403).json({ ok: false, error: "default role names cannot be changed in org 1" });
  }
  const hasCreatedAt = await rolesHasCreatedAtColumn();
  const createdAtExpr = rolesCreatedAtSelectExpr(hasCreatedAt);
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
               apply_role_to, apply_attribute_id, apply_sub_attribute_id, apply_worker_type_id, ${createdAtExpr}`,
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

  const authOrgId = asInt(req.user?.org_id);
  if (!authOrgId) return res.status(400).json({ ok: false, error: "invalid organisation" });
  const isSystemAdmin = isEziiSystemAdmin(req);
  const roleOrgId = Number(row0.organisation_id);
  if (!isSystemAdmin && roleOrgId !== authOrgId) return res.status(403).json({ ok: false, error: "forbidden" });
  const orgId = isSystemAdmin ? roleOrgId : authOrgId;
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

