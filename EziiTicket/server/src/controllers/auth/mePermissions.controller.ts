import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "../admin/adminUtils.js";
import { ACTION_KEYS, SCREEN_KEYS } from "../../authz/permissionKeys.js";
import { buildScreenAccess } from "../../authz/permissionSchema.js";
import { isEziiSystemAdmin } from "../admin/eziiSystemAdmin.js";

function fullScreenAccess(): Record<string, { view: boolean; modify: boolean }> {
  return buildScreenAccess(true);
}

type PermissionDoc = Record<string, unknown>;

function asPermissionDoc(input: unknown): PermissionDoc {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as PermissionDoc;
}

function toBool(v: unknown): boolean {
  return Boolean(v);
}

function accessRank(v: unknown): number {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "own_tickets") return 1;
  if (s === "assigned_queue") return 2;
  if (s === "product_queue_escalated") return 3;
  if (s === "org_tickets") return 4;
  if (s === "all_tickets") return 5;
  return 0;
}

function rankToAccess(rank: number): string {
  if (rank >= 5) return "all_tickets";
  if (rank === 4) return "org_tickets";
  if (rank === 3) return "product_queue_escalated";
  if (rank === 2) return "assigned_queue";
  if (rank === 1) return "own_tickets";
  return "own_tickets";
}

function assignScopeRank(v: unknown): number {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "none") return 0;
  if (s === "self") return 1;
  if (s === "l2_queue") return 2;
  if (s === "any") return 3;
  return 0;
}

function rankToAssignScope(rank: number): string {
  if (rank >= 3) return "any";
  if (rank === 2) return "l2_queue";
  if (rank === 1) return "self";
  return "none";
}

function slaRank(v: unknown): number {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "edit") return 2;
  if (s === "view") return 1;
  return 0;
}

function rankToSla(rank: number): "none" | "view" | "edit" {
  if (rank >= 2) return "edit";
  if (rank === 1) return "view";
  return "none";
}

function readScreenAccess(
  value: unknown
): Record<string, { view: boolean; modify: boolean }> {
  const out: Record<string, { view: boolean; modify: boolean }> = {};
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  for (const key of SCREEN_KEYS) {
    const node = source[key];
    const rec = node && typeof node === "object" ? (node as Record<string, unknown>) : {};
    const modify = toBool(rec["modify"]);
    const view = toBool(rec["view"]) || modify;
    out[key] = { view, modify };
  }
  // Legacy roles only had `routing_rules`; inherit for split screens until DB is backfilled.
  const hasExplicit = (k: string) => {
    const node = source[k];
    return Boolean(node && typeof node === "object");
  };
  if (!hasExplicit("priority_master") && hasExplicit("routing_rules")) {
    out["priority_master"] = { ...out["routing_rules"] };
  }
  if (!hasExplicit("keyword_routing") && hasExplicit("routing_rules")) {
    out["keyword_routing"] = { ...out["routing_rules"] };
  }
  return out;
}

function writeScreenAccess(input: Record<string, { view: boolean; modify: boolean }>): PermissionDoc {
  const out: PermissionDoc = {};
  for (const key of SCREEN_KEYS) {
    const entry = input[key] ?? { view: false, modify: false };
    out[key] = { view: Boolean(entry.view || entry.modify), modify: Boolean(entry.modify) };
  }
  return out;
}

function readActions(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(source)) {
    out[k] = Boolean(v);
  }
  return out;
}

/** End users must not get staff-only org queue list; UI treats `tickets.list` as agent/org shell. */
function applyCustomerEndUserActionCaps(doc: PermissionDoc): PermissionDoc {
  const next: PermissionDoc = { ...doc };
  const actions: Record<string, boolean> = {};
  const raw = readActions(next.actions);
  for (const key of ACTION_KEYS) {
    actions[key] = Boolean(raw[key]);
  }
  actions["tickets.list"] = false;
  next.actions = actions;
  return next;
}

function mergePermissionDocs(docs: PermissionDoc[]): PermissionDoc {
  if (docs.length === 0) return {};

  let ticketAccessMax = 0;
  let assignScopeMax = 0;
  let canAssign = false;
  let canResolve = false;
  let t1 = 0;
  let t2 = 0;
  const screen: Record<string, { view: boolean; modify: boolean }> = {};
  const actions: Record<string, boolean> = {};
  for (const key of SCREEN_KEYS) screen[key] = { view: false, modify: false };
  for (const key of ACTION_KEYS) actions[key] = false;

  for (const d of docs) {
    ticketAccessMax = Math.max(ticketAccessMax, accessRank(d["ticket_access"]));
    assignScopeMax = Math.max(assignScopeMax, assignScopeRank(d["assign_scope"]));
    canAssign = canAssign || toBool(d["can_assign"]);
    canResolve = canResolve || toBool(d["can_resolve"]);
    t1 = Math.max(t1, slaRank(d["tier1_sla_config"]));
    t2 = Math.max(t2, slaRank(d["tier2_sla_config"]));
    const s = readScreenAccess(d["screen_access"]);
    const a = readActions(d["actions"]);
    for (const key of SCREEN_KEYS) {
      screen[key] = {
        view: screen[key].view || s[key].view || s[key].modify,
        modify: screen[key].modify || s[key].modify,
      };
    }
    for (const [k, v] of Object.entries(a)) {
      actions[k] = Boolean(actions[k] || v);
    }
  }

  return {
    ticket_access: rankToAccess(ticketAccessMax),
    assign_scope: rankToAssignScope(assignScopeMax),
    can_assign: canAssign,
    can_resolve: canResolve,
    tier1_sla_config: rankToSla(t1),
    tier2_sla_config: rankToSla(t2),
    screen_access: writeScreenAccess(screen),
    actions,
  };
}

function normalizeRoleNameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function applyPermissionOverrides(base: PermissionDoc, overrides: Array<{ permission_key: string; effect: "allow" | "deny" }>): PermissionDoc {
  const next: PermissionDoc = JSON.parse(JSON.stringify(base));
  for (const ov of overrides) {
    const path = String(ov.permission_key ?? "").trim();
    if (!path) continue;
    const parts = path.split(".").filter(Boolean);
    if (parts.length === 0) continue;
    let ptr: Record<string, unknown> = next;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      const node = ptr[k];
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        ptr[k] = {};
      }
      ptr = ptr[k] as Record<string, unknown>;
    }
    ptr[parts[parts.length - 1]] = ov.effect === "allow";
  }
  return next;
}

/**
 * Returns the ticket role row for the caller (`user_id` + `org_id` from JWT) so the client can
 * filter navigation and (later) gate APIs using `permissions_json.screen_access`.
 */
export async function getAuthMePermissions(req: Request, res: Response) {
  const userId = asInt(req.user?.user_id);
  const orgId = asInt(req.user?.org_id);
  if (!userId || !orgId) {
    return res.status(400).json({ ok: false, error: "invalid token claims" });
  }

  /** Platform super-admin JWT only — same rule as client `isSystemAdminIdentity` (not every `user_id === 1`). */
  if (isEziiSystemAdmin(req)) {
    return res.json({
      ok: true,
      data: {
        role_id: null,
        role_name: "system_admin",
        permissions_json: {
          screen_access: fullScreenAccess(),
          actions: Object.fromEntries(ACTION_KEYS.map((k) => [k, true])),
        },
      },
    });
  }

  const rolesResult = await pool.query<{
    role_id: string;
    role_name: string;
    permissions_json: unknown;
  }>(
    `select ur.role_id::text as role_id, r.name as role_name, r.permissions_json
     from user_roles ur
     join roles r on r.id = ur.role_id
     where ur.user_id = $1::bigint
       and (
         ur.scope_organisation_id = $2::bigint
         or (ur.scope_organisation_id is null and r.organisation_id = $2::bigint)
       )
     order by case when ur.scope_organisation_id is not null then 0 else 1 end, ur.id asc`,
    [userId, orgId]
  );

  const rows = rolesResult.rows;
  if (rows.length === 0) {
    return res.json({
      ok: true,
      data: {
        role_id: null,
        role_name: null,
        permissions_json: {},
      },
    });
  }

  /** Prefer customer row for API identity when present so `role_name` matches the customer shell. */
  const customerRows = rows.filter((r) => normalizeRoleNameKey(r.role_name) === "customer");
  const primaryRole = customerRows[0] ?? rows[0];

  const supportLevelResult = await pool.query<{
    support_level_id: string;
    support_level_name: string;
  }>(
    `select ud.support_level_id::text as support_level_id, d.name as support_level_name
     from user_org_support_levels ud
     join org_support_levels d on d.id = ud.support_level_id
     where ud.user_id = $1::bigint
       and d.organisation_id = $2::bigint
       and ud.is_active = true
     order by ud.updated_at desc, ud.id desc
     limit 1`,
    [userId, orgId]
  );
  const supportLevel = supportLevelResult.rows[0] ?? null;

  /** Model A: access comes from assigned role(s) only; org support level is routing tier metadata, not merged into permissions. */
  // If any "customer" role is assigned, merge ONLY those role rows. Otherwise OR-merge all rows (agent/org roles).
  // This avoids a scoped agent row sorting before customer and polluting permissions with tickets.list / team screens.
  const roleDocs =
    customerRows.length > 0
      ? customerRows.map((r) => asPermissionDoc(r.permissions_json))
      : rows.map((r) => asPermissionDoc(r.permissions_json));
  const merged = mergePermissionDocs(roleDocs);

  const overrideRows = await pool.query<{
    permission_key: string;
    effect: "allow" | "deny";
  }>(
    `select permission_key, effect
     from user_permission_overrides
     where user_id = $1::bigint
       and organisation_id = $2::bigint
       and (expires_at is null or expires_at > now())
     order by id asc`,
    [userId, orgId]
  );
  const withOverrides = applyPermissionOverrides(merged, overrideRows.rows);

  /** `system_admin` always gets full screen_access (view + modify on every screen); not overridable by role JSON or user overrides. */
  const hasSystemAdminAssignment = rows.some((r) => normalizeRoleNameKey(r.role_name) === "system_admin");
  const permissionsJson: PermissionDoc = hasSystemAdminAssignment
    ? {
        ...withOverrides,
        screen_access: fullScreenAccess(),
        actions: Object.fromEntries(ACTION_KEYS.map((k) => [k, true])),
      }
    : customerRows.length > 0
      ? applyCustomerEndUserActionCaps(withOverrides)
      : withOverrides;

  return res.json({
    ok: true,
    data: {
      role_id: primaryRole.role_id,
      role_name: primaryRole.role_name,
      permissions_json: permissionsJson,
      access_roles: rows.map((r) => ({
        role_id: r.role_id,
        role_name: r.role_name,
      })),
      support_level: supportLevel
        ? {
            support_level_id: supportLevel.support_level_id,
            support_level_name: supportLevel.support_level_name,
          }
        : null,
      /** @deprecated Use support_level — kept for older clients */
      designation: supportLevel
        ? {
            designation_id: supportLevel.support_level_id,
            designation_name: supportLevel.support_level_name,
          }
        : null,
    },
  });
}
