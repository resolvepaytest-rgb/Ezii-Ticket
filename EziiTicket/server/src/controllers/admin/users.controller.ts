import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";
import { redistributeOpenTicketsForOooUsers } from "../../services/tickets/redistributeOooTickets.js";

const TEMPLATE_ROLES_ORG_ID = 1;

function normalizeRoleNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function resolveRoleType(targetOrgId: number, roleName: string): "internal_support" | "customer_org" {
  const key = normalizeRoleNameKey(roleName);
  if (key === "customer") return "customer_org";
  if (key === "org admin") return targetOrgId === 1 ? "internal_support" : "customer_org";
  return targetOrgId === 1 ? "internal_support" : "customer_org";
}

/**
 * When assigning roles scoped to a customer org, the admin UI may send role_ids from the
 * Ezii (org 1) catalog. Resolve each id to a row in `targetOrgId`: reuse if already there,
 * otherwise find/create by name using org 1 as template.
 */
async function resolveRoleIdToTargetOrganisation(
  roleId: number,
  targetOrgId: number
): Promise<number> {
  if (targetOrgId === TEMPLATE_ROLES_ORG_ID) {
    return roleId;
  }

  const inTarget = await pool.query<{ id: string }>(
    `select id::text from roles where id = $1 and organisation_id = $2`,
    [roleId, targetOrgId]
  );
  if ((inTarget.rowCount ?? 0) > 0) {
    return roleId;
  }

  const tmpl = await pool.query<{
    name: string;
    description: string | null;
    role_type: string | null;
    permissions_json: unknown;
  }>(
    `select name, description, role_type, permissions_json
     from roles
     where id = $1 and organisation_id = $2`,
    [roleId, TEMPLATE_ROLES_ORG_ID]
  );
  const t = tmpl.rows[0];
  if (!t) {
    throw new Error(`role_id ${roleId} is not a valid Ezii template role`);
  }

  const name = String(t.name ?? "").trim();
  if (!name) {
    throw new Error(`role_id ${roleId} has empty name in template`);
  }

  const existing = await pool.query<{ id: string }>(
    `select id::text from roles
     where organisation_id = $1 and lower(trim(name)) = lower(trim($2::text))
     limit 1`,
    [targetOrgId, name]
  );
  if ((existing.rowCount ?? 0) > 0) {
    return Number(existing.rows[0].id);
  }

  const ins = await pool.query<{ id: string }>(
    `insert into roles (organisation_id, name, description, role_type, permissions_json, is_default)
     values ($1, $2, $3, $4, coalesce($5::jsonb, '{}'::jsonb), false)
     returning id::text`,
    [
      targetOrgId,
      name,
      t.description ?? null,
      t.role_type === "internal_support" ? "internal_support" : resolveRoleType(targetOrgId, name),
      t.permissions_json ?? {},
    ]
  );
  const newId = ins.rows[0]?.id;
  if (!newId) {
    throw new Error("failed to create role in target organisation");
  }
  return Number(newId);
}

function getExternalBaseUrl() {
  return (process.env["EXTERNAL_API_URL"] ?? "https://qa-api.resolveindia.com").replace(/\/+$/, "");
}

/** POST without Bearer; org is selected via body.orgId (report returns `column` + `data` like worker-master). */
async function fetchClientWorkerMasterEmployeeRows(orgId: number): Promise<Record<string, unknown>[]> {
  const base = getExternalBaseUrl();
  const externalRes = await fetch(`${base}/reports/client-worker-master`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orgId,
      userBlocks: [],
      userWise: 0,
      workerType: 0,
      attribute: 0,
      subAttributeId: 0,
    }),
  });
  const externalJson = await externalRes.json().catch(() => null);
  if (!externalRes.ok) {
    throw new Error(`client-worker-master request failed (${externalRes.status})`);
  }
  return collectEmployeeRows(externalJson);
}

function parseBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  }
  return null;
}

function parseDate(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const datePart = s.includes("T") ? s.split("T")[0] : s;
  const dt = new Date(datePart);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function collectEmployeeRows(input: unknown): Record<string, unknown>[] {
  const queue: unknown[] = [input];
  const visited = new Set<unknown>();
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) continue;
    if (typeof cur === "object") {
      if (visited.has(cur)) continue;
      visited.add(cur);
    }
    if (Array.isArray(cur)) {
      const employees = cur.filter((x) => isRecord(x) && ("user_id" in x || "employee_number" in x));
      if (employees.length > 0) return employees as Record<string, unknown>[];
      for (const item of cur) queue.push(item);
      continue;
    }
    if (isRecord(cur)) {
      for (const v of Object.values(cur)) queue.push(v);
    }
  }
  return [];
}

export async function listUsers(req: Request, res: Response) {
  const orgId = req.query.organisation_id
    ? asInt(req.query.organisation_id)
    : null;

  const rows = await pool.query(
    `select id, user_id, organisation_id, name, email, phone, user_type, status, type_id_1, out_of_office, ooo_start_date, ooo_end_date, created_at, updated_at
     from users
     where ($1::bigint is null or organisation_id = $1::bigint)
     order by id desc`,
    [orgId]
  );

  return res.json({ ok: true, data: rows.rows });
}

export async function getUserByUserId(req: Request, res: Response) {
  const userId = asInt(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid user_id" });
  }

  const result = await pool.query(
    `select id, user_id, organisation_id, name, email, phone, user_type, status, out_of_office, ooo_start_date, ooo_end_date, created_at, updated_at
     from users where user_id=$1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  return res.json({ ok: true, data: row });
}

export async function createUser(req: Request, res: Response) {
  const { user_id, organisation_id, name, email, phone, user_type, status } =
    req.body ?? {};

  const userId = asInt(user_id);
  const orgId = asInt(organisation_id);

  if (!userId) {
    return res.status(400).json({ ok: false, error: "user_id is required" });
  }
  if (!orgId) {
    return res.status(400).json({
      ok: false,
      error: "organisation_id is required",
    });
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  if (!email || typeof email !== "string") {
    return res.status(400).json({ ok: false, error: "email is required" });
  }

  const existing = await pool.query(
    `select id, user_id, organisation_id, name, email, phone, user_type, status, created_at, updated_at
     from users
     where user_id=$1`,
    [userId]
  );
  const row0 = existing.rows[0];
  if (row0) {
    const existingOrgId = Number(row0.organisation_id);
    if (existingOrgId !== orgId) {
      if (!isEziiSystemAdmin(req)) {
        return res.status(409).json({
          ok: false,
          error: `user_id ${userId} already exists; cannot create duplicate user`,
        });
      }

      const updatedCrossOrg = await pool.query(
        `update users
         set name = $2,
             email = $3,
             phone = $4,
             user_type = $5,
             status = coalesce($6,'active'),
             updated_at = now()
         where user_id = $1
         returning id, user_id, organisation_id, name, email, phone, user_type, status, created_at, updated_at`,
        [userId, name, email, phone ?? null, user_type ?? null, status ?? null]
      );
      await appendAdminAudit(
        req,
        existingOrgId,
        "Users",
        "update",
        `Updated existing user "${name}" (${email}) via System Admin (requested org=${orgId})`
      );
      return res.json({ ok: true, data: updatedCrossOrg.rows[0] });
    }

    const updated = await pool.query(
      `update users
       set name = $2,
           email = $3,
           phone = $4,
           user_type = $5,
           status = coalesce($6,'active'),
           updated_at = now()
       where user_id = $1
       returning id, user_id, organisation_id, name, email, phone, user_type, status, created_at, updated_at`,
      [userId, name, email, phone ?? null, user_type ?? null, status ?? null]
    );
    await appendAdminAudit(
      req,
      orgId,
      "Users",
      "update",
      `Updated existing user "${name}" (${email})`
    );
    return res.json({ ok: true, data: updated.rows[0] });
  }

  const inserted = await pool.query(
    `insert into users (user_id, organisation_id, name, email, phone, user_type, status)
     values ($1,$2,$3,$4,$5,$6,coalesce($7,'active'))
     returning id, user_id, organisation_id, name, email, phone, user_type, status, created_at, updated_at`,
    [userId, orgId, name, email, phone ?? null, user_type ?? null, status ?? null]
  );

  await appendAdminAudit(req, orgId, "Users", "create", `Created user "${name}" (${email})`);
  return res.status(201).json({ ok: true, data: inserted.rows[0] });
}

export async function updateUser(req: Request, res: Response) {
  const userId = asInt(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid user_id" });
  }

  const { name, email, phone, user_type, status } = req.body ?? {};
  const outOfOfficePatch =
    typeof (req.body as { out_of_office?: unknown })?.out_of_office === "boolean"
      ? (req.body as { out_of_office: boolean }).out_of_office
      : null;
  const hasStartPatch = Object.prototype.hasOwnProperty.call(req.body ?? {}, "ooo_start_date");
  const hasEndPatch = Object.prototype.hasOwnProperty.call(req.body ?? {}, "ooo_end_date");
  const toDateOrNull = (v: unknown): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
    return s;
  };
  const startPatch = toDateOrNull((req.body as { ooo_start_date?: unknown } | null)?.ooo_start_date);
  const endPatch = toDateOrNull((req.body as { ooo_end_date?: unknown } | null)?.ooo_end_date);
  if ((hasStartPatch && startPatch === undefined) || (hasEndPatch && endPatch === undefined)) {
    return res.status(400).json({ ok: false, error: "ooo_start_date and ooo_end_date must be YYYY-MM-DD or null" });
  }
  if ((hasStartPatch || hasEndPatch) && ((startPatch == null) !== (endPatch == null))) {
    return res.status(400).json({ ok: false, error: "both ooo_start_date and ooo_end_date are required together" });
  }
  if (startPatch && endPatch && startPatch > endPatch) {
    return res.status(400).json({ ok: false, error: "ooo_start_date cannot be after ooo_end_date" });
  }

  const beforeResult = await pool.query<{
    organisation_id: number;
    out_of_office: boolean;
    ooo_start_date: string | null;
    ooo_end_date: string | null;
  }>(
    `select organisation_id, out_of_office, ooo_start_date::text, ooo_end_date::text
     from users
     where user_id = $1`,
    [userId]
  );
  const before = beforeResult.rows[0];
  if (!before) return res.status(404).json({ ok: false, error: "not found" });

  const nextStart = hasStartPatch ? (startPatch ?? null) : before.ooo_start_date;
  const nextEnd = hasEndPatch ? (endPatch ?? null) : before.ooo_end_date;
  const todayYmd = new Date().toISOString().slice(0, 10);
  const inScheduledRange = Boolean(nextStart && nextEnd && todayYmd >= nextStart && todayYmd <= nextEnd);
  const nextOutOfOffice =
    outOfOfficePatch !== null ? outOfOfficePatch : hasStartPatch || hasEndPatch ? inScheduledRange : before.out_of_office;

  const result = await pool.query(
    `update users
     set name = coalesce($2, name),
         email = coalesce($3, email),
         phone = coalesce($4, phone),
         user_type = coalesce($5, user_type),
         status = coalesce($6, status),
         out_of_office = $7::boolean,
         ooo_start_date = $8::date,
         ooo_end_date = $9::date,
         updated_at = now()
     where user_id=$1
     returning id, user_id, organisation_id, name, email, phone, user_type, status, out_of_office, ooo_start_date, ooo_end_date, created_at, updated_at`,
    [userId, name ?? null, email ?? null, phone ?? null, user_type ?? null, status ?? null, nextOutOfOffice, nextStart, nextEnd]
  );

  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  if (!before.out_of_office && Boolean(row.out_of_office)) {
    await redistributeOpenTicketsForOooUsers({
      organisationId: Number(row.organisation_id),
      sourceUserIds: [userId],
    });
  }
  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "Users",
    "update",
    `Updated user "${row.name}" (${row.email})`
  );
  return res.json({ ok: true, data: row });
}

export async function setUserRoles(req: Request, res: Response) {
  const userId = asInt(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid user_id" });
  }

  const { role_ids, scope_organisation_id } = req.body ?? {};
  if (!Array.isArray(role_ids) || role_ids.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "role_ids must be a non-empty array",
    });
  }

  const parsedRoleIds = role_ids
    .map(asInt)
    .filter((n): n is number => Boolean(n));

  if (parsedRoleIds.length !== role_ids.length) {
    return res.status(400).json({
      ok: false,
      error: "role_ids must be integers",
    });
  }

  const userOrgRow = await pool.query("select organisation_id from users where user_id=$1", [userId]);
  const userOrgId = userOrgRow.rows[0]?.organisation_id ? Number(userOrgRow.rows[0].organisation_id) : null;
  if (!userOrgId) {
    return res.status(404).json({ ok: false, error: "user organisation not found" });
  }

  const authOrgId = asInt(req.user?.org_id);
  if (!authOrgId) return res.status(400).json({ ok: false, error: "invalid requester organisation" });
  const scopedOrgId = asInt(scope_organisation_id);

  // If scope is omitted, infer customer scope so edits replace scoped role instead of adding a global one.
  // Inference order:
  // 1) Existing scoped user_roles (single distinct scope)
  // 2) Active user_scope_org mapping (single distinct scope)
  // 3) Home organisation for non-HQ users
  let inferredScopeOrgId: number | null = null;
  if (scopedOrgId == null) {
    const scopedRoleRows = await pool.query<{ scope_organisation_id: string }>(
      `select distinct scope_organisation_id::text
       from user_roles
       where user_id = $1
         and scope_organisation_id is not null`,
      [userId]
    );
    if ((scopedRoleRows.rowCount ?? 0) === 1) {
      inferredScopeOrgId = Number(scopedRoleRows.rows[0].scope_organisation_id);
    } else {
      const scopeOrgRows = await pool.query<{ scope_org_id: string }>(
        `select distinct scope_org_id::text
         from user_scope_org
         where user_id = $1
           and is_active = true`,
        [userId]
      );
      if ((scopeOrgRows.rowCount ?? 0) === 1) {
        inferredScopeOrgId = Number(scopeOrgRows.rows[0].scope_org_id);
      } else if (userOrgId !== TEMPLATE_ROLES_ORG_ID) {
        inferredScopeOrgId = userOrgId;
      }
    }
  }

  // Scoped assignment is allowed for any caller who already passed route-level users modify checks.
  const effectiveScopeOrgId = scopedOrgId ?? inferredScopeOrgId;
  // Ezii invited into tenant org: keep role binding to org 1 templates (do not clone into tenant).
  const isEziiInvitedToTenantScope =
    userOrgId === TEMPLATE_ROLES_ORG_ID &&
    effectiveScopeOrgId != null &&
    effectiveScopeOrgId !== TEMPLATE_ROLES_ORG_ID;
  const rolesOrgId = isEziiInvitedToTenantScope ? TEMPLATE_ROLES_ORG_ID : (effectiveScopeOrgId ?? userOrgId);

  let finalRoleIds = parsedRoleIds;
  if (isEziiSystemAdmin(req) && rolesOrgId !== TEMPLATE_ROLES_ORG_ID) {
    try {
      finalRoleIds = [];
      for (const rid of parsedRoleIds) {
        finalRoleIds.push(await resolveRoleIdToTargetOrganisation(rid, rolesOrgId));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "role resolution failed";
      return res.status(400).json({ ok: false, error: msg });
    }
  }

  const roleCheck = await pool.query(
    `select id, name from roles where organisation_id = $1 and id = any($2::int[])`,
    [rolesOrgId, finalRoleIds]
  );
  if ((roleCheck.rowCount ?? 0) !== finalRoleIds.length) {
    return res.status(400).json({
      ok: false,
      error: "all role_ids must belong to the role scope organisation",
    });
  }

  await pool.query("begin");
  try {
    await pool.query(
      `delete from user_roles
       where user_id=$1
         and (
           ($2::bigint is null and scope_organisation_id is null)
           or scope_organisation_id = $2::bigint
         )`,
      [userId, effectiveScopeOrgId]
    );
    for (const rid of finalRoleIds) {
      await pool.query(
        "insert into user_roles (user_id, role_id, scope_organisation_id) values ($1,$2,$3)",
        [userId, rid, effectiveScopeOrgId]
      );
      if (effectiveScopeOrgId != null) {
        const roleRow = roleCheck.rows.find((r) => Number(r.id) === rid);
        const userRow = await pool.query(
          "select employee_number, name, email from users where user_id=$1",
          [userId]
        );
        const userMeta = userRow.rows[0] ?? {};
        await pool.query(
          `insert into user_scope_org
           (origin_org_id, scope_org_id, user_id, employee_number, user_name, email, ticket_role, ticket_role_id, is_active, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,true,now())
           on conflict (user_id, scope_org_id) do update
             set employee_number = excluded.employee_number,
                 user_name = excluded.user_name,
                 email = excluded.email,
                 ticket_role = excluded.ticket_role,
                 ticket_role_id = excluded.ticket_role_id,
                 is_active = true,
                 updated_at = now()`,
          [
            userOrgId,
            effectiveScopeOrgId,
            userId,
            userMeta.employee_number ?? null,
            userMeta.name ?? null,
            userMeta.email ?? null,
            roleRow?.name ?? "unknown",
            rid,
          ]
        );
      }
    }
    await pool.query("commit");
  } catch (e) {
    await pool.query("rollback");
    throw e;
  }

  const result = await pool.query(
    `select ur.id, ur.user_id, ur.role_id, ur.scope_organisation_id, r.name as role_name
     from user_roles ur join roles r on r.id = ur.role_id
     where ur.user_id=$1
     order by ur.id asc`,
    [userId]
  );

  if (userOrgId != null) {
    await appendAdminAudit(
      req,
      userOrgId,
      "Users",
      "update_roles",
      `Updated roles for user_id=${userId}${effectiveScopeOrgId ? ` (scope_org=${effectiveScopeOrgId})` : ""}`
    );
  }

  return res.json({ ok: true, data: result.rows });
}

export async function getUserRoles(req: Request, res: Response) {
  const userId = asInt(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid user_id" });
  }
  const result = await pool.query(
    `select ur.id, ur.user_id, ur.role_id, ur.scope_organisation_id, r.name as role_name
     from user_roles ur
     join roles r on r.id = ur.role_id
     where ur.user_id=$1
     order by ur.id asc`,
    [userId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function getUserDesignation(req: Request, res: Response) {
  const userId = asInt(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid user_id" });
  }
  const organisationId = asInt(req.query.organisation_id) ?? asInt(req.user?.org_id);
  if (!organisationId) {
    return res.status(400).json({ ok: false, error: "invalid organisation" });
  }
  const result = await pool.query(
    `select ud.id, ud.user_id, ud.support_level_id, ud.effective_from, ud.effective_to, ud.is_active,
            d.code as support_level_code, d.name as support_level_name, d.organisation_id,
            d.code as designation_code, d.name as designation_name
     from user_org_support_levels ud
     join org_support_levels d on d.id = ud.support_level_id
     where ud.user_id = $1 and d.organisation_id = $2 and ud.is_active = true
     order by ud.updated_at desc, ud.id desc
     limit 1`,
    [userId, organisationId]
  );
  return res.json({ ok: true, data: result.rows[0] ?? null });
}

export async function setUserDesignation(req: Request, res: Response) {
  const userId = asInt(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid user_id" });
  }
  const body = req.body as Record<string, unknown>;
  const rawLevelId = body.support_level_id ?? body.designation_id;
  const { effective_from, effective_to } = body ?? {};
  const organisationId = asInt(body?.["organisation_id"]) ?? asInt(req.user?.org_id);
  if (!organisationId) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  const isClearRequest =
    rawLevelId === null ||
    (typeof rawLevelId === "string" && rawLevelId.trim().toLowerCase() === "null");
  const supportLevelId = asInt(rawLevelId);
  if (!isClearRequest && !supportLevelId) {
    return res.status(400).json({ ok: false, error: "support_level_id is required" });
  }

  let levelRow: { id: number; organisation_id: number; name: string } | null = null;
  if (!isClearRequest && supportLevelId) {
    const designationRow = await pool.query(
      "select id, organisation_id, name from org_support_levels where id = $1 and organisation_id = $2",
      [supportLevelId, organisationId]
    );
    levelRow = designationRow.rows[0] ?? null;
    if (!levelRow) return res.status(404).json({ ok: false, error: "support level not found" });
  }

  await pool.query("begin");
  try {
    await pool.query(
      `update user_org_support_levels
       set is_active = false,
           effective_to = coalesce(effective_to, now()),
           updated_at = now()
       where user_id = $1
         and is_active = true
         and support_level_id in (
           select id from org_support_levels where organisation_id = $2
         )`,
      [userId, organisationId]
    );
    if (isClearRequest) {
      await pool.query("commit");
      if (organisationId) {
        await appendAdminAudit(
          req,
          organisationId,
          "Users",
          "update_org_support_level",
          `Cleared org support level for user_id=${userId}`
        );
      }
      return res.json({ ok: true, data: null });
    }
    const result = await pool.query(
      `insert into user_org_support_levels (user_id, support_level_id, effective_from, effective_to, is_active)
       values ($1, $2, coalesce($3::timestamptz, now()), $4::timestamptz, true)
       returning id, user_id, support_level_id, effective_from, effective_to, is_active`,
      [userId, supportLevelId, effective_from ?? null, effective_to ?? null]
    );
    await pool.query("commit");
    await appendAdminAudit(
      req,
      Number(levelRow?.organisation_id ?? organisationId),
      "Users",
      "update_org_support_level",
      `Updated org support level for user_id=${userId} -> "${levelRow?.name ?? "unknown"}"`
    );
    return res.json({ ok: true, data: result.rows[0] });
  } catch (e) {
    await pool.query("rollback");
    throw e;
  }
}

export async function listUserPermissionOverrides(req: Request, res: Response) {
  const userId = asInt(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid user_id" });
  }
  const organisationId = asInt(req.query.organisation_id) ?? asInt(req.user?.org_id);
  if (!organisationId) return res.status(400).json({ ok: false, error: "invalid organisation" });

  const result = await pool.query(
    `select id, user_id, organisation_id, permission_key, effect, reason, expires_at, created_by, created_at
     from user_permission_overrides
     where user_id = $1 and organisation_id = $2
     order by id asc`,
    [userId, organisationId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function setUserPermissionOverrides(req: Request, res: Response) {
  const userId = asInt(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid user_id" });
  }
  const { organisation_id, overrides } = req.body ?? {};
  const organisationId = asInt(organisation_id) ?? asInt(req.user?.org_id);
  if (!organisationId) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  if (!Array.isArray(overrides)) {
    return res.status(400).json({ ok: false, error: "overrides must be an array" });
  }

  await pool.query("begin");
  try {
    await pool.query("delete from user_permission_overrides where user_id = $1 and organisation_id = $2", [
      userId,
      organisationId,
    ]);

    for (const raw of overrides as Array<Record<string, unknown>>) {
      const permissionKey = typeof raw.permission_key === "string" ? raw.permission_key.trim() : "";
      const effect = raw.effect === "allow" || raw.effect === "deny" ? raw.effect : null;
      const reason = typeof raw.reason === "string" ? raw.reason : null;
      const expiresAt = typeof raw.expires_at === "string" ? raw.expires_at : null;
      if (!permissionKey || !effect) {
        await pool.query("rollback");
        return res.status(400).json({ ok: false, error: "each override requires permission_key and effect" });
      }
      await pool.query(
        `insert into user_permission_overrides
         (user_id, organisation_id, permission_key, effect, reason, expires_at, created_by)
         values ($1, $2, $3, $4, $5, $6::timestamptz, $7)`,
        [userId, organisationId, permissionKey, effect, reason, expiresAt, asInt(req.user?.user_id)]
      );
    }
    await pool.query("commit");
    await appendAdminAudit(
      req,
      organisationId,
      "Users",
      "update_permission_overrides",
      `Updated permission overrides for user_id=${userId}`
    );
    const result = await pool.query(
      `select id, user_id, organisation_id, permission_key, effect, reason, expires_at, created_by, created_at
       from user_permission_overrides
       where user_id = $1 and organisation_id = $2
       order by id asc`,
      [userId, organisationId]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (e) {
    await pool.query("rollback");
    throw e;
  }
}

export async function syncUsersFromWorkerMaster(req: Request, res: Response) {
  if (!isEziiSystemAdmin(req)) {
    return res.status(403).json({ ok: false, error: "Only Ezii System Admin can run sync." });
  }
  const targetOrgId =
    asInt((req.body as Record<string, unknown> | undefined)?.["orgId"]) ??
    asInt((req.body as Record<string, unknown> | undefined)?.["organisation_id"]) ??
    1;

  let allRows: Record<string, unknown>[];
  try {
    allRows = await fetchClientWorkerMasterEmployeeRows(targetOrgId);
  } catch {
    return res.status(502).json({ ok: false, error: "client-worker-master sync failed" });
  }

  const rows = allRows.filter((r) => workerRowIsStrictlyActive(r));
  const seenUserIds = new Set<number>();
  let upserted = 0;

  await pool.query("begin");
  try {
    for (const r of rows) {
      const uid = asInt(r["user_id"]);
      if (!uid) continue;
      seenUserIds.add(uid);

      const name = String(r["user_name"] ?? "").trim() || `User ${uid}`;
      const email =
        String(r["email"] ?? "").trim() ||
        String(r["communication_email"] ?? "").trim() ||
        `user${uid}@example.local`;

      await pool.query(
        `insert into users (
          user_id, organisation_id, name, email, phone, user_type, status,
          employee_number, user_name, alternative_id, biometric_id, first_name, middle_name, last_name,
          communication_email, mobile_number_1, mobile_number_2, date_of_joining, last_working_day,
          gender_name, leave_id, attendance_id, expense_id, date_of_birth, user_role_name, worker_type, user_profile,
          is_differently_abled, is_rejoinee, prev_employee_number, is_probation, probation_date, is_fixed_duration,
          contract_start_date, contract_end_date, contract_extension_date, contract_effective_date,
          informal_start_date, informal_end_date, informal_effective_date, type_id_0, type_id_1, type_id_12,
          payment_mode_name, religion, caste, marital_status, anniversary_date, address_type, address_line1, address_line2,
          country_name, state_name, district_name, city_name, pincode, blood_group, landline_no,
          pan_no, pan_holder, uan_no, license_no, pf_no, cibil_score, cibil_score_date, esi_no, esi_dispensary,
          is_pension_applicable, is_international_worker, is_inoperative, worker_master_raw
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,$10,$11,$12,$13,$14,
          $15,$16,$17,$18,$19,
          $20,$21,$22,$23,$24,$25,$26,$27,
          $28,$29,$30,$31,$32,$33,
          $34,$35,$36,$37,
          $38,$39,$40,$41,$42,$43,
          $44,$45,$46,$47,$48,$49,$50,$51,
          $52,$53,$54,$55,$56,$57,$58,
          $59,$60,$61,$62,$63,$64,$65,$66,$67,
          $68,$69,$70,$71::jsonb
        )
        on conflict (user_id) do update
          set organisation_id = excluded.organisation_id,
              name = excluded.name,
              email = excluded.email,
              phone = excluded.phone,
              user_type = excluded.user_type,
              status = excluded.status,
              employee_number = excluded.employee_number,
              user_name = excluded.user_name,
              alternative_id = excluded.alternative_id,
              biometric_id = excluded.biometric_id,
              first_name = excluded.first_name,
              middle_name = excluded.middle_name,
              last_name = excluded.last_name,
              communication_email = excluded.communication_email,
              mobile_number_1 = excluded.mobile_number_1,
              mobile_number_2 = excluded.mobile_number_2,
              date_of_joining = excluded.date_of_joining,
              last_working_day = excluded.last_working_day,
              gender_name = excluded.gender_name,
              leave_id = excluded.leave_id,
              attendance_id = excluded.attendance_id,
              expense_id = excluded.expense_id,
              date_of_birth = excluded.date_of_birth,
              user_role_name = excluded.user_role_name,
              worker_type = excluded.worker_type,
              user_profile = excluded.user_profile,
              is_differently_abled = excluded.is_differently_abled,
              is_rejoinee = excluded.is_rejoinee,
              prev_employee_number = excluded.prev_employee_number,
              is_probation = excluded.is_probation,
              probation_date = excluded.probation_date,
              is_fixed_duration = excluded.is_fixed_duration,
              contract_start_date = excluded.contract_start_date,
              contract_end_date = excluded.contract_end_date,
              contract_extension_date = excluded.contract_extension_date,
              contract_effective_date = excluded.contract_effective_date,
              informal_start_date = excluded.informal_start_date,
              informal_end_date = excluded.informal_end_date,
              informal_effective_date = excluded.informal_effective_date,
              type_id_0 = excluded.type_id_0,
              type_id_1 = excluded.type_id_1,
              type_id_12 = excluded.type_id_12,
              payment_mode_name = excluded.payment_mode_name,
              religion = excluded.religion,
              caste = excluded.caste,
              marital_status = excluded.marital_status,
              anniversary_date = excluded.anniversary_date,
              address_type = excluded.address_type,
              address_line1 = excluded.address_line1,
              address_line2 = excluded.address_line2,
              country_name = excluded.country_name,
              state_name = excluded.state_name,
              district_name = excluded.district_name,
              city_name = excluded.city_name,
              pincode = excluded.pincode,
              blood_group = excluded.blood_group,
              landline_no = excluded.landline_no,
              pan_no = excluded.pan_no,
              pan_holder = excluded.pan_holder,
              uan_no = excluded.uan_no,
              license_no = excluded.license_no,
              pf_no = excluded.pf_no,
              cibil_score = excluded.cibil_score,
              cibil_score_date = excluded.cibil_score_date,
              esi_no = excluded.esi_no,
              esi_dispensary = excluded.esi_dispensary,
              is_pension_applicable = excluded.is_pension_applicable,
              is_international_worker = excluded.is_international_worker,
              is_inoperative = excluded.is_inoperative,
              worker_master_raw = excluded.worker_master_raw,
              updated_at = now()`,
        [
          uid,
          targetOrgId,
          name,
          email,
          String(r["Mobile_number_1"] ?? "").trim() || null,
          String(r["worker_type"] ?? "").trim() || null,
          parseBool(r["is_active"]) ? "active" : "inactive",
          String(r["employee_number"] ?? "").trim() || null,
          String(r["user_name"] ?? "").trim() || null,
          String(r["alternative_id"] ?? "").trim() || null,
          String(r["biometric_id"] ?? "").trim() || null,
          String(r["first_name"] ?? "").trim() || null,
          String(r["middle_name"] ?? "").trim() || null,
          String(r["last_name"] ?? "").trim() || null,
          String(r["communication_email"] ?? "").trim() || null,
          String(r["Mobile_number_1"] ?? "").trim() || null,
          String(r["Mobile_number_2"] ?? "").trim() || null,
          parseDate(r["date_of_joining"]),
          parseDate(r["last_working_day"]),
          String(r["gender_name"] ?? "").trim() || null,
          String(r["leave_id"] ?? "").trim() || null,
          String(r["attendance_id"] ?? "").trim() || null,
          String(r["expense_id"] ?? "").trim() || null,
          parseDate(r["date_of_birth"]),
          String(r["user_role_name"] ?? "").trim() || null,
          String(r["worker_type"] ?? "").trim() || null,
          String(r["user_profile"] ?? "").trim() || null,
          parseBool(r["is_differently_abled"]),
          parseBool(r["is_rejoinee"]),
          String(r["prev_employee_number"] ?? "").trim() || null,
          parseBool(r["is_probation"]),
          parseDate(r["probation_date"]),
          parseBool(r["is_fixed_duration"]),
          parseDate(r["contract_start_date"]),
          parseDate(r["contract_end_date"]),
          parseDate(r["contract_extension_date"]),
          parseDate(r["contract_effective_date"]),
          parseDate(r["informal_start_date"]),
          parseDate(r["informal_end_date"]),
          parseDate(r["informal_effective_date"]),
          String(r["type_id_0"] ?? "").trim() || null,
          String(r["type_id_1"] ?? "").trim() || null,
          String(r["type_id_12"] ?? "").trim() || null,
          String(r["payment_mode_name"] ?? "").trim() || null,
          String(r["religion"] ?? "").trim() || null,
          String(r["caste"] ?? "").trim() || null,
          String(r["marital_status"] ?? "").trim() || null,
          parseDate(r["anniversary_date"]),
          String(r["address_type"] ?? "").trim() || null,
          String(r["address_line1"] ?? "").trim() || null,
          String(r["address_line2"] ?? "").trim() || null,
          String(r["country_name"] ?? "").trim() || null,
          String(r["state_name"] ?? "").trim() || null,
          String(r["district_name"] ?? "").trim() || null,
          String(r["city_name"] ?? "").trim() || null,
          String(r["pincode"] ?? "").trim() || null,
          String(r["blood_group"] ?? "").trim() || null,
          String(r["landline_no"] ?? "").trim() || null,
          String(r["pan_no"] ?? "").trim() || null,
          String(r["pan_holder"] ?? "").trim() || null,
          String(r["uan_no"] ?? "").trim() || null,
          String(r["license_no"] ?? "").trim() || null,
          String(r["pf_no"] ?? "").trim() || null,
          String(r["cibil_score"] ?? "").trim() || null,
          parseDate(r["cibil_score_date"]),
          String(r["esi_no"] ?? "").trim() || null,
          String(r["esi_dispensary"] ?? "").trim() || null,
          parseBool(r["is_pension_applicable"]),
          parseBool(r["is_international_worker"]),
          parseBool(r["is_inoperative"]),
          JSON.stringify(r),
        ]
      );
      upserted += 1;
    }

    const seen = Array.from(seenUserIds);
    if (seen.length > 0) {
      await pool.query(
        `update users
         set status = 'inactive',
             updated_at = now()
         where organisation_id = $2::bigint
           and user_id <> all($1::bigint[])`,
        [seen, targetOrgId]
      );
    } else {
      await pool.query(
        `update users
         set status = 'inactive',
             updated_at = now()
         where organisation_id = $1::bigint`,
        [targetOrgId]
      );
    }

    await pool.query("commit");
  } catch (e) {
    await pool.query("rollback");
    throw e;
  }

  await appendAdminAudit(
    req,
    targetOrgId,
    "Users",
    "sync",
    `Synced client-worker-master users for org ${targetOrgId} (${upserted} active upserted, ${allRows.length} rows from API)`
  );
  return res.json({ ok: true, data: { upserted, scanned: allRows.length } });
}

export async function listUserScopeOrg(req: Request, res: Response) {
  const scopeOrgId = req.query.scope_org_id ? asInt(req.query.scope_org_id) : null;
  const userId = req.query.user_id ? asInt(req.query.user_id) : null;
  const result = await pool.query(
    `select id, origin_org_id, scope_org_id, user_id, employee_number, user_name, email, ticket_role, ticket_role_id, is_active, created_at, updated_at
     from user_scope_org
     where ($1::bigint is null or scope_org_id = $1::bigint)
       and ($2::bigint is null or user_id = $2::bigint)
     order by id desc`,
    [scopeOrgId, userId]
  );
  return res.json({ ok: true, data: result.rows });
}

/**
 * Users invited into a tenant org via `user_scope_org`, joined to `users` for profile fields.
 * Ezii-invited agents typically have `users.organisation_id = 1` (HQ), so listing `users` by tenant org alone misses them.
 */
export async function listInvitedAgentUsersForOrganisation(req: Request, res: Response) {
  const scopeOrgId = asInt(req.params.id);
  if (!scopeOrgId) {
    return res.status(400).json({ ok: false, error: "invalid organisation id" });
  }
  if (scopeOrgId === 1) {
    return res.status(400).json({
      ok: false,
      error: "For organisation 1, use GET /admin/users?organisation_id=1",
    });
  }

  const result = await pool.query(
    `select distinct on (uso.user_id)
       coalesce(u.id, uso.user_id::bigint) as id,
       uso.user_id,
       coalesce(u.organisation_id, 1::bigint) as organisation_id,
       coalesce(nullif(trim(both from u.name), ''), nullif(trim(both from uso.user_name), ''), 'User ' || uso.user_id::text) as name,
       coalesce(nullif(trim(both from u.email), ''), nullif(trim(both from uso.email), ''), '-') as email,
       u.phone,
       u.user_type,
       coalesce(u.status, 'active') as status,
       u.type_id_1,
       coalesce(u.out_of_office, false) as out_of_office,
       u.ooo_start_date,
       u.ooo_end_date,
       u.created_at,
       u.updated_at
     from user_scope_org uso
     left join users u on u.user_id = uso.user_id
     where uso.scope_org_id = $1::bigint
       and uso.is_active = true
     order by uso.user_id, uso.id desc`,
    [scopeOrgId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function removeUserScopeOrg(req: Request, res: Response) {
  const userId = asInt(req.params.user_id);
  const scopeOrgId = asInt(req.params.scope_org_id);
  if (!userId || !scopeOrgId) {
    return res.status(400).json({ ok: false, error: "invalid user_id or scope_org_id" });
  }

  const authOrgId = asInt(req.user?.org_id);
  if (!authOrgId) {
    return res.status(400).json({ ok: false, error: "invalid requester organisation" });
  }

  // Cross-org scoped removal is allowed for callers with users modify access.

  await pool.query("begin");
  try {
    const urDel = await pool.query(
      `delete from user_roles
       where user_id=$1
         and scope_organisation_id=$2::bigint`,
      [userId, scopeOrgId]
    );

    const usoDel = await pool.query(
      `delete from user_scope_org
       where user_id=$1
         and scope_org_id=$2::bigint`,
      [userId, scopeOrgId]
    );

    await pool.query("commit");

    await appendAdminAudit(
      req,
      scopeOrgId,
      "Users",
      "remove_scope_org",
      `Removed scoped access for user_id=${userId} (scope_org=${scopeOrgId})`
    );

    return res.json({
      ok: true,
      data: {
        deleted_user_roles: urDel.rowCount ?? 0,
        deleted_user_scope_org: usoDel.rowCount ?? 0,
      },
    });
  } catch (e) {
    await pool.query("rollback");
    throw e;
  }
}

function workerRowIsStrictlyActive(r: Record<string, unknown>): boolean {
  return parseBool(r["is_active"]) === true;
}

async function getCustomerRoleForOrganisation(
  orgId: number
): Promise<{ id: number; name: string }> {
  const r = await pool.query<{ id: string; name: string }>(
    `select id::text, name from roles where organisation_id=$1 and lower(trim(name))='customer' limit 1`,
    [orgId]
  );
  const row = r.rows[0];
  if (!row) {
    throw new Error(`customer role not found for organisation_id=${orgId}; provision tenant defaults first`);
  }
  return { id: Number(row.id), name: String(row.name) };
}

async function upsertEziiDirectoryUserFromWorkerRow(r: Record<string, unknown>): Promise<{
  userId: number;
  name: string;
  email: string;
  employeeNumber: string | null;
}> {
  const uid = asInt(r["user_id"]);
  if (!uid) throw new Error("worker row missing user_id");

  const name = String(r["user_name"] ?? "").trim() || `User ${uid}`;
  const email =
    String(r["email"] ?? "").trim() ||
    String(r["communication_email"] ?? "").trim() ||
    `user${uid}@example.local`;
  const phone = String(r["Mobile_number_1"] ?? "").trim() || null;
  const userType = String(r["worker_type"] ?? "").trim() || null;
  const status = parseBool(r["is_active"]) ? "active" : "inactive";
  const employeeNumber = String(r["employee_number"] ?? "").trim() || null;

  await pool.query(
    `insert into users (user_id, organisation_id, name, email, phone, user_type, status, employee_number, user_name)
     values ($1, 1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id) do update
       set name = excluded.name,
           email = excluded.email,
           phone = excluded.phone,
           user_type = excluded.user_type,
           status = excluded.status,
           employee_number = coalesce(excluded.employee_number, users.employee_number),
           user_name = coalesce(excluded.user_name, users.user_name),
           updated_at = now()`,
    [uid, name, email, phone, userType, status, employeeNumber, String(r["user_name"] ?? "").trim() || null]
  );

  return { userId: uid, name, email, employeeNumber };
}

async function assignCustomerScopedAccess(args: {
  userId: number;
  scopeOrgId: number;
  customerRoleId: number;
  customerRoleName: string;
  employeeNumber: string | null;
  userName: string;
  email: string;
}) {
  const userRow = await pool.query<{ organisation_id: string }>(
    "select organisation_id::text from users where user_id=$1",
    [args.userId]
  );
  const originOrgId = userRow.rows[0]?.organisation_id ? Number(userRow.rows[0].organisation_id) : 1;

  await pool.query(
    `delete from user_roles
     where user_id=$1
       and scope_organisation_id = $2::bigint`,
    [args.userId, args.scopeOrgId]
  );
  await pool.query(
    "insert into user_roles (user_id, role_id, scope_organisation_id) values ($1,$2,$3)",
    [args.userId, args.customerRoleId, args.scopeOrgId]
  );

  await pool.query(
    `insert into user_scope_org
       (origin_org_id, scope_org_id, user_id, employee_number, user_name, email, ticket_role, ticket_role_id, is_active, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,true,now())
     on conflict (user_id, scope_org_id) do update
       set employee_number = excluded.employee_number,
           user_name = excluded.user_name,
           email = excluded.email,
           ticket_role = excluded.ticket_role,
           ticket_role_id = excluded.ticket_role_id,
           is_active = true,
           updated_at = now()`,
    [
      originOrgId,
      args.scopeOrgId,
      args.userId,
      args.employeeNumber,
      args.userName,
      args.email,
      args.customerRoleName,
      args.customerRoleId,
    ]
  );
}

/**
 * POST `client-worker-master` with body.orgId = tenant (no external Bearer), `column` + `data` response.
 * Only rows with is_active === true are upserted into `users` (org 1) and scoped as **customer** for the tenant.
 */
export async function provisionCustomerOrgUsersFromWorker(req: Request, res: Response) {
  if (!isEziiSystemAdmin(req)) {
    return res.status(403).json({ ok: false, error: "Only Ezii System Admin can provision org users." });
  }
  const scopeOrgId = asInt(req.params.id);
  if (!scopeOrgId) {
    return res.status(400).json({ ok: false, error: "invalid organisation id" });
  }

  const { ensureTenantAndDefaultsByOrgId } = await import("../../services/provisioning/ensureTenantAndDefaults.js");
  await ensureTenantAndDefaultsByOrgId(scopeOrgId);

  let customerRole: { id: number; name: string };
  try {
    customerRole = await getCustomerRoleForOrganisation(scopeOrgId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "customer role missing";
    return res.status(400).json({ ok: false, error: msg });
  }

  let rows: Record<string, unknown>[];
  try {
    rows = await fetchClientWorkerMasterEmployeeRows(scopeOrgId);
  } catch {
    return res.status(502).json({ ok: false, error: "client-worker-master request failed" });
  }

  const matched = rows.filter((r) => workerRowIsStrictlyActive(r));

  let provisioned = 0;
  for (const r of matched) {
    const uid = asInt(r["user_id"]);
    if (!uid) continue;
    try {
      const up = await upsertEziiDirectoryUserFromWorkerRow(r);
      if (String((await pool.query(`select status from users where user_id=$1`, [uid])).rows[0]?.status ?? "")
        .toLowerCase() !== "active") {
        continue;
      }
      await assignCustomerScopedAccess({
        userId: up.userId,
        scopeOrgId,
        customerRoleId: customerRole.id,
        customerRoleName: customerRole.name,
        employeeNumber: up.employeeNumber,
        userName: up.name,
        email: up.email,
      });
      provisioned += 1;
    } catch {
      /* skip bad row */
    }
  }

  await appendAdminAudit(
    req,
    scopeOrgId,
    "Users",
    "provision_customer_org",
    `Provisioned ${provisioned} active users with default customer scope (client-worker-master active rows=${matched.length}, scanned=${rows.length})`
  );

  return res.json({
    ok: true,
    data: { provisioned, scanned: rows.length, matched: matched.length, usedFallback: false },
  });
}

export async function listOrganisationUserDirectory(req: Request, res: Response) {
  const orgId = asInt(req.params.id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid organisation id" });

  const localUsersCheck =
    orgId !== 1
      ? await pool.query<{ has_local: boolean }>(
          `select exists(
             select 1 from users where organisation_id = $1::bigint limit 1
           ) as has_local`,
          [orgId]
        )
      : null;
  /** Skip client-worker-master when this org already has at least one user row in `users`. */
  const hasLocalUsersInTable = orgId === 1 ? true : Boolean(localUsersCheck?.rows[0]?.has_local);

  const includeUnprovisioned =
    String(req.query.include_unprovisioned ?? "true").toLowerCase() !== "false";

  let customerRoleId: number | null = null;
  let customerRoleName = "customer";
  try {
    const cr = await getCustomerRoleForOrganisation(orgId);
    customerRoleId = cr.id;
    customerRoleName = cr.name;
  } catch {
    customerRoleId = null;
  }

  type DirRow = {
    user_id: number;
    name: string;
    email: string;
    status: string;
    ticket_role: string;
    ticket_role_id: number | null;
    provisioned: boolean;
    /** Worker / Ezii report field `type_id_1` (“Department”). */
    department: string | null;
    /** Ezii HQ home org when row is from `user_scope_org`; null for tenant-only directory rows. */
    origin_org_id: number | null;
    scope_org_id: number | null;
  };

  const byUid = new Map<number, DirRow>();

  const scopeRes = await pool.query(
    `select s.user_id, s.user_name, s.email, s.ticket_role, s.ticket_role_id, s.is_active,
            s.origin_org_id, s.scope_org_id,
            nullif(trim(coalesce(u.type_id_1::text, '')), '') as department
     from user_scope_org s
     left join users u on u.user_id = s.user_id
     where s.scope_org_id=$1`,
    [orgId]
  );
  for (const s of scopeRes.rows) {
    if (!s.is_active) continue;
    const dept = s.department != null ? String(s.department) : null;
    const sid = Number(s.scope_org_id);
    const oid = s.origin_org_id != null ? Number(s.origin_org_id) : null;
    byUid.set(Number(s.user_id), {
      user_id: Number(s.user_id),
      name: String(s.user_name ?? `User ${s.user_id}`),
      email: String(s.email ?? "-"),
      status: "active",
      ticket_role: String(s.ticket_role ?? customerRoleName),
      ticket_role_id: s.ticket_role_id != null ? Number(s.ticket_role_id) : customerRoleId,
      provisioned: true,
      department: dept,
      origin_org_id: oid,
      scope_org_id: Number.isFinite(sid) ? sid : null,
    });
  }

  const homeRes = await pool.query(
    `select user_id, name, email, status, type_id_1 from users where organisation_id=$1`,
    [orgId]
  );
  for (const u of homeRes.rows) {
    const uid = Number(u.user_id);
    if (String(u.status).toLowerCase() !== "active") continue;
    const dept =
      u.type_id_1 != null && String(u.type_id_1).trim() ? String(u.type_id_1).trim() : null;
    if (!byUid.has(uid)) {
      byUid.set(uid, {
        user_id: uid,
        name: String(u.name ?? `User ${uid}`),
        email: String(u.email ?? "-"),
        status: "active",
        ticket_role: customerRoleName,
        ticket_role_id: customerRoleId,
        provisioned: true,
        department: dept,
        origin_org_id: null,
        scope_org_id: null,
      });
    } else if (dept) {
      const cur = byUid.get(uid)!;
      if (!cur.department) {
        byUid.set(uid, { ...cur, department: dept });
      }
    }
  }

  if (
    includeUnprovisioned &&
    isEziiSystemAdmin(req) &&
    orgId !== 1 &&
    !hasLocalUsersInTable
  ) {
    try {
      const rows = await fetchClientWorkerMasterEmployeeRows(orgId);
      const candidates = rows.filter((r) => workerRowIsStrictlyActive(r));
      for (const r of candidates) {
        const uid = asInt(r["user_id"]);
        if (!uid || byUid.has(uid)) continue;
        const name = String(r["user_name"] ?? "").trim() || `User ${uid}`;
        const email =
          String(r["email"] ?? "").trim() ||
          String(r["communication_email"] ?? "").trim() ||
          "-";
        const dept = String(r["type_id_1"] ?? "").trim() || null;
        byUid.set(uid, {
          user_id: uid,
          name,
          email,
          status: "active",
          ticket_role: customerRoleName,
          ticket_role_id: customerRoleId,
          provisioned: false,
          department: dept,
          origin_org_id: null,
          scope_org_id: null,
        });
      }
    } catch {
      /* ignore external errors for directory */
    }
  }

  const data = Array.from(byUid.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  return res.json({ ok: true, data, has_local_users: hasLocalUsersInTable });
}

