import type { Request } from "express";
import { pool } from "../db/pool.js";
import { asInt } from "../controllers/admin/adminUtils.js";
import { SCREEN_KEYS, type ActionKey, type ScreenKey } from "./permissionKeys.js";
import {
  ticketMatchesRoleApplyScope,
  type RoleApplyRow,
} from "../services/roleTicketScope.js";

type PermissionDoc = Record<string, unknown>;

export type EffectivePolicy = {
  user_id: number;
  ticket_access: "own_tickets" | "assigned_queue" | "product_queue_escalated" | "org_tickets" | "all_tickets";
  apply_scope: RoleApplyRow | null;
  screens: Record<string, { view: boolean; modify: boolean }>;
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

function deriveTicketAccess(
  screens: Record<string, { view: boolean; modify: boolean }>,
  hasSystemAdmin: boolean
): EffectivePolicy["ticket_access"] {
  if (hasSystemAdmin) return "all_tickets";
  if (screens.tickets?.view || screens.tickets?.modify) return "org_tickets";
  if (
    screens.agent_team_queue?.view ||
    screens.agent_team_queue?.modify ||
    screens.agent_history?.view ||
    screens.agent_history?.modify
  ) {
    return "assigned_queue";
  }
  return "own_tickets";
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
  const screens: Record<string, { view: boolean; modify: boolean }> = {};
  for (const k of SCREEN_KEYS) screens[k] = { view: false, modify: false };

  for (const d of docs) {
    const screen = readScreenAccess(d.screen_access);
    for (const k of SCREEN_KEYS) {
      screens[k] = {
        view: screens[k].view || screen[k].view || screen[k].modify,
        modify: screens[k].modify || screen[k].modify,
      };
    }
  }

  if (hasSystemAdmin) {
    for (const k of SCREEN_KEYS) screens[k] = { view: true, modify: true };
  }

  return {
    user_id: userId,
    ticket_access: deriveTicketAccess(screens, hasSystemAdmin),
    apply_scope: applyScope,
    screens,
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
  const canView = (screenKey: ScreenKey) =>
    Boolean(policy.screens[screenKey]?.view || policy.screens[screenKey]?.modify);
  const canModify = (screenKey: ScreenKey) => Boolean(policy.screens[screenKey]?.modify);
  const canViewAny = (...keys: ScreenKey[]) => keys.some((key) => canView(key));
  const canModifyAny = (...keys: ScreenKey[]) => keys.some((key) => canModify(key));

  switch (actionKey) {
    case "tickets.list":
      return canViewAny("tickets", "agent_team_queue", "agent_history");
    case "tickets.list_my":
      return canViewAny("my_tickets", "agent_my_tickets", "tickets");
    case "tickets.read":
      return canViewAny("my_tickets", "agent_my_tickets", "tickets", "agent_team_queue", "agent_history");
    case "tickets.create":
      return canViewAny("raise_a_ticket", "my_tickets", "tickets");
    case "tickets.reply":
      return canModifyAny("my_tickets", "raise_a_ticket", "agent_my_tickets", "tickets", "agent_team_queue");
    case "tickets.internal_notes.read":
      return canViewAny("tickets", "agent_my_tickets", "agent_team_queue", "agent_history");
    case "tickets.attach":
    case "tickets.attach_download":
      return canViewAny("my_tickets", "agent_my_tickets", "tickets", "agent_team_queue", "agent_history");
    case "tickets.status_change":
    case "tickets.escalate":
    case "tickets.assign":
      return canModifyAny("tickets", "agent_team_queue", "agent_history");
    case "tickets.request_escalation":
      return canModifyAny("my_tickets", "raise_a_ticket");
    case "tickets.reopen":
      return canModifyAny("my_tickets", "raise_a_ticket", "tickets", "agent_team_queue", "agent_history");
    case "notifications.read":
    case "notifications.mark_read":
      return true;
    case "roles.read":
      return canView("roles_permissions");
    case "roles.manage":
      return canModify("roles_permissions");
    case "users.read":
      return canView("users");
    case "users.manage":
      return canModify("users");
    case "routing_rules.manage":
      return canModify("routing_rules");
    case "priority_master.manage":
      return canModify("priority_master");
    case "keyword_routing.manage":
      return canModify("keyword_routing");
    case "sla.policies.manage":
      return canModify("sla_policies");
    case "notification_templates.manage":
      return canModify("notification_templates");
    case "canned_responses.manage":
      return canModify("canned_responses");
    case "custom_fields.manage":
      return canModify("custom_fields");
    case "api_tokens.manage":
      return canModify("api_tokens");
    case "webhooks.manage":
      return canModify("webhooks");
    case "audit_logs.read":
      return canView("audit_logs");
    default:
      return false;
  }
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
    return false;
  };
}

