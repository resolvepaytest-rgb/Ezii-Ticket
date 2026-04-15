import type { Request } from "express";
import { pool } from "../db/pool.js";
import { asInt } from "../controllers/admin/adminUtils.js";
import { SCREEN_KEYS, type ActionKey, type ScreenKey } from "./permissionKeys.js";
import {
  ticketMatchesRoleApplyScope,
  type RoleApplyRow,
} from "../services/roleTicketScope.js";
import { env } from "../config/env.js";

type PermissionDoc = Record<string, unknown>;

export type EffectivePolicy = {
  user_id: number;
  ticket_access: "own_tickets" | "assigned_queue" | "product_queue_escalated" | "org_tickets" | "all_tickets";
  apply_scope: RoleApplyRow | null;
  screens: Record<string, { view: boolean; modify: boolean }>;
  actions: Record<string, boolean>;
  has_system_admin: boolean;
};

export type TicketScopeRow = {
  reporter_user_id: unknown;
  assignee_user_id: unknown;
  metadata_json?: unknown;
};

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

function rankToAccess(rank: number): EffectivePolicy["ticket_access"] {
  if (rank >= 5) return "all_tickets";
  if (rank === 4) return "org_tickets";
  if (rank === 3) return "product_queue_escalated";
  if (rank === 2) return "assigned_queue";
  return "own_tickets";
}

function readScreenAccess(
  value: unknown
): Record<string, { view: boolean; modify: boolean }> {
  const out: Record<string, { view: boolean; modify: boolean }> = {};
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  for (const key of SCREEN_KEYS) {
    const node = source[key];
    const rec = node && typeof node === "object" ? (node as Record<string, unknown>) : {};
    const modify = toBool(rec.modify);
    const view = toBool(rec.view) || modify;
    out[key] = { view, modify };
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

function normalizeRoleNameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function mergePermissionDocs(
  docs: PermissionDoc[],
  hasSystemAdmin: boolean,
  userId: number,
  applyScope: RoleApplyRow | null
): EffectivePolicy {
  let ticketAccessMax = 0;
  const screens: Record<string, { view: boolean; modify: boolean }> = {};
  for (const k of SCREEN_KEYS) screens[k] = { view: false, modify: false };
  const actions: Record<string, boolean> = {};

  for (const d of docs) {
    ticketAccessMax = Math.max(ticketAccessMax, accessRank(d.ticket_access));
    const screen = readScreenAccess(d.screen_access);
    for (const k of SCREEN_KEYS) {
      screens[k] = {
        view: screens[k].view || screen[k].view || screen[k].modify,
        modify: screens[k].modify || screen[k].modify,
      };
    }
    const act = readActions(d.actions);
    for (const [k, v] of Object.entries(act)) {
      actions[k] = Boolean(actions[k] || v);
    }
  }

  if (hasSystemAdmin) {
    for (const k of SCREEN_KEYS) screens[k] = { view: true, modify: true };
  }

  return {
    user_id: userId,
    ticket_access: rankToAccess(ticketAccessMax),
    apply_scope: applyScope,
    screens,
    actions,
    has_system_admin: hasSystemAdmin,
  };
}

export async function getEffectivePolicyForRequest(req: Request): Promise<EffectivePolicy | null> {
  const userId = asInt(req.user?.user_id);
  const orgId = asInt(req.user?.org_id);
  if (!userId || !orgId) return null;

  const rolesResult = await pool.query<{
    role_name: string;
    permissions_json: unknown;
  }>(
    `select r.name as role_name, r.permissions_json
     from user_roles ur
     join roles r on r.id = ur.role_id
     where ur.user_id = $1::bigint
       and (
         ur.scope_organisation_id = $2::bigint
         or (ur.scope_organisation_id is null and r.organisation_id = $2::bigint)
       )`,
    [userId, orgId]
  );

  const hasSystemAdmin = rolesResult.rows.some(
    (r) => normalizeRoleNameKey(r.role_name) === "system_admin"
  );
  const docs = rolesResult.rows.map((r) => asPermissionDoc(r.permissions_json));
  const applyResult = await pool.query<RoleApplyRow>(
    `select r.apply_role_to, r.apply_attribute_id, r.apply_sub_attribute_id, r.apply_worker_type_id
     from user_roles ur
     join roles r on r.id = ur.role_id
     where ur.user_id = $1::bigint
       and (
         ur.scope_organisation_id = $2::bigint
         or (ur.scope_organisation_id is null and r.organisation_id = $2::bigint)
       )
     order by case when ur.scope_organisation_id is not null then 0 else 1 end, ur.id asc
     limit 1`,
    [userId, orgId]
  );
  const applyScope = applyResult.rows[0] ?? null;
  return mergePermissionDocs(docs, hasSystemAdmin, userId, applyScope);
}

export function canViewScreen(policy: EffectivePolicy | null, screenKey: ScreenKey): boolean {
  if (!policy) return false;
  return Boolean(policy.screens[screenKey]?.view || policy.screens[screenKey]?.modify);
}

export function canModifyScreen(policy: EffectivePolicy | null, screenKey: ScreenKey): boolean {
  if (!policy) return false;
  return Boolean(policy.screens[screenKey]?.modify);
}

export function canDo(policy: EffectivePolicy | null, actionKey: ActionKey): boolean {
  if (!policy) return false;
  if (policy.has_system_admin) return true;
  const explicit = policy.actions[actionKey];
  if (explicit === true) return true;
  if (env.permissionStrictActions) return false;

  const hasTicketsScreen = Boolean(
    policy.screens.tickets?.view ||
      policy.screens.tickets?.modify ||
      policy.screens.my_tickets?.view ||
      policy.screens.my_tickets?.modify ||
      policy.screens.agent_my_tickets?.view ||
      policy.screens.agent_my_tickets?.modify
  );

  // Legacy fallback while action keys are not fully backfilled in role JSON.
  if (actionKey === "tickets.list") {
    return (
      hasTicketsScreen ||
      policy.ticket_access === "assigned_queue" ||
      policy.ticket_access === "product_queue_escalated" ||
      policy.ticket_access === "org_tickets" ||
      policy.ticket_access === "all_tickets"
    );
  }
  if (actionKey === "tickets.list_my") {
    return true;
  }
  if (actionKey === "tickets.read") {
    return true;
  }
  if (actionKey === "tickets.create") {
    return (
      Boolean(policy.screens.raise_a_ticket?.view || policy.screens.raise_a_ticket?.modify) ||
      hasTicketsScreen
    );
  }
  if (actionKey === "notifications.read" || actionKey === "notifications.mark_read") {
    return true;
  }
  if (actionKey === "tickets.internal_notes.read") {
    return (
      policy.ticket_access === "assigned_queue" ||
      policy.ticket_access === "product_queue_escalated" ||
      policy.ticket_access === "org_tickets" ||
      policy.ticket_access === "all_tickets"
    );
  }
  return false;
}

function ticketMetadataObject(metadataJson: unknown): Record<string, unknown> {
  if (metadataJson == null) return {};
  if (typeof metadataJson === "object" && !Array.isArray(metadataJson)) {
    return metadataJson as Record<string, unknown>;
  }
  if (typeof metadataJson === "string") {
    try {
      const p = JSON.parse(metadataJson) as unknown;
      if (typeof p === "object" && p !== null && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Phase 2 minimal slice:
 * central ticket row scope predicate (permission-first, legacy-compatible).
 */
export function buildTicketScopePredicate(policy: EffectivePolicy | null): (row: TicketScopeRow) => boolean {
  if (!policy) return () => false;
  const uid = policy.user_id;
  const apply = policy.apply_scope;
  return (row: TicketScopeRow) => {
    const isReporter = Number(row.reporter_user_id) === uid;
    const isAssignee = row.assignee_user_id != null && Number(row.assignee_user_id) === uid;

    if (policy.ticket_access === "all_tickets" || policy.ticket_access === "org_tickets") {
      return true;
    }
    if (policy.ticket_access === "own_tickets") {
      return isReporter;
    }
    if (policy.ticket_access === "assigned_queue") {
      return isReporter || isAssignee;
    }
    // product_queue_escalated: keep legacy behavior while queue-based model is completed.
    // Allow own/assigned and then apply metadata constraints where configured.
    if (policy.ticket_access === "product_queue_escalated") {
      if (isReporter || isAssignee) return true;
      if (!apply || (apply.apply_role_to ?? "all") === "all") return true;
      return ticketMatchesRoleApplyScope(ticketMetadataObject(row.metadata_json), apply, uid);
    }
    return false;
  };
}

