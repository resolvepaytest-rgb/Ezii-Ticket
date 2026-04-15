import type { NextFunction, Request, Response } from "express";
import type { ActionKey, ScreenKey } from "../authz/permissionKeys.js";
import {
  canDo,
  canModifyScreen,
  canViewScreen,
  getEffectivePolicyForRequest,
} from "../authz/policy.js";
import { normalizeRoleNameKey } from "./auth.middleware.js";

/** JWT `role_name` values that bypass effective-policy checks (tenant operators). */
const LEGACY_ADMIN_ROLE_NAMES = new Set([
  "admin",
  "system_admin",
  "team_lead",
  "org_admin",
  "administrator",
]);

function legacyAdminPass(req: Request): boolean {
  const roleName = normalizeRoleNameKey(req.user?.role_name);
  return LEGACY_ADMIN_ROLE_NAMES.has(roleName);
}

/** Legacy JWT names that historically hit `/admin/roles` + designations without merged `screen_access`. */
const LEGACY_ROLES_EDITOR_ROLE_NAMES = new Set([
  ...LEGACY_ADMIN_ROLE_NAMES,
  "l1_agent",
  "l2_specialist",
  "l3_engineer",
  "agent",
  "support_agent",
]);

function legacyRolesEditorPass(req: Request): boolean {
  const roleName = normalizeRoleNameKey(req.user?.role_name);
  return LEGACY_ROLES_EDITOR_ROLE_NAMES.has(roleName);
}

/**
 * Roles & Permissions API + designations / org-support-levels: allow legacy tier/agent JWT names, or
 * effective policy `roles_permissions` screen / `roles.read` / `roles.manage` (granted agent/customer).
 */
export function requireRolesEditorAccess(write: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (legacyRolesEditorPass(req)) return next();
    const policy = await getEffectivePolicyForRequest(req);
    if (!policy) return res.status(403).json({ ok: false, error: "Forbidden" });
    const screen: ScreenKey = "roles_permissions";
    const ok = write ? writeAllowed(policy, screen) : readAllowed(policy, screen);
    if (!ok) return res.status(403).json({ ok: false, error: "Forbidden" });
    return next();
  };
}

/** Screens that imply permission to load shared org catalog data (e.g. product lists). */
const PRODUCT_LIST_SCREEN_ANY: ScreenKey[] = [
  "users",
  "roles_permissions",
  "teams_queues",
  "routing_rules",
  "priority_master",
  "keyword_routing",
  "sla_policies",
  "notification_templates",
  "canned_responses",
  "custom_fields",
  "api_tokens",
  "webhooks",
  "audit_logs",
];

const SCREEN_MANAGE_ACTION: Partial<Record<ScreenKey, ActionKey>> = {
  users: "users.manage",
  roles_permissions: "roles.manage",
  routing_rules: "routing_rules.manage",
  priority_master: "priority_master.manage",
  keyword_routing: "keyword_routing.manage",
  sla_policies: "sla.policies.manage",
  notification_templates: "notification_templates.manage",
  canned_responses: "canned_responses.manage",
  custom_fields: "custom_fields.manage",
  api_tokens: "api_tokens.manage",
  webhooks: "webhooks.manage",
};

const SCREEN_READ_ACTION: Partial<Record<ScreenKey, ActionKey>> = {
  users: "users.read",
  roles_permissions: "roles.read",
  audit_logs: "audit_logs.read",
};

function readAllowed(policy: NonNullable<Awaited<ReturnType<typeof getEffectivePolicyForRequest>>>, screen: ScreenKey) {
  if (canViewScreen(policy, screen)) return true;
  const a = SCREEN_READ_ACTION[screen];
  if (a && canDo(policy, a)) return true;
  return false;
}

function writeAllowed(policy: NonNullable<Awaited<ReturnType<typeof getEffectivePolicyForRequest>>>, screen: ScreenKey) {
  if (canModifyScreen(policy, screen)) return true;
  const a = SCREEN_MANAGE_ACTION[screen];
  if (a && canDo(policy, a)) return true;
  return false;
}

export type AdminResourceAccessSpec = {
  /** Primary screen for this admin surface (maps to Roles UI `screen_access`). */
  screen: ScreenKey;
  /** When true, require modify (or matching *.manage action). When false, view (or read action) is enough. */
  write: boolean;
};

/**
 * Allows tenant `admin` / `team_lead` / `org_admin` via legacy JWT role_name, or any user whose
 * merged effective role policy grants the matching screen/action (for granted customer/agent access).
 */
export function requireAdminResourceAccess(spec: AdminResourceAccessSpec) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (legacyAdminPass(req)) return next();
    const policy = await getEffectivePolicyForRequest(req);
    if (!policy) return res.status(403).json({ ok: false, error: "Forbidden" });
    const ok = spec.write ? writeAllowed(policy, spec.screen) : readAllowed(policy, spec.screen);
    if (!ok) return res.status(403).json({ ok: false, error: "Forbidden" });
    return next();
  };
}

/** GET /admin/products — shared catalog; allow if user may manage any org-config surface that lists products. */
export function requireAdminProductsListAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (legacyAdminPass(req)) return next();
    const policy = await getEffectivePolicyForRequest(req);
    if (!policy) return res.status(403).json({ ok: false, error: "Forbidden" });
    for (const s of PRODUCT_LIST_SCREEN_ANY) {
      if (canViewScreen(policy, s)) return next();
    }
    return res.status(403).json({ ok: false, error: "Forbidden" });
  };
}
