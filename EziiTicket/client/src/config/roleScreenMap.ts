import type { SidebarItem } from "@components/layout/Sidebar";
import { Settings } from "lucide-react";

/**
 * Maps System Admin shell nav keys (see `etsNavigation`) to `permissions_json.screen_access` keys
 * stored on roles (see Roles & Permissions UI).
 */
export const SYSTEM_ADMIN_NAV_TO_SCREEN: Record<string, string | readonly string[]> = {
  sys_dashboard: "dashboard",
  /** Org directory — closest match until a dedicated screen key exists */
  partner_setup: "users",
  sys_tickets: "tickets",
  sys_agents: "users",
  workspace_module_c: "dashboard",
  users_roles: "users",
  roles_management: "roles_permissions",
  teams_queues: "teams_queues",
  routing_rules: "routing_rules",
  priority_master: "priority_master",
  keyword_routing: "keyword_routing",
  sla_policies: "sla_policies",
  notification_templates: "notification_templates",
  canned_responses: "canned_responses",
  custom_fields: "custom_fields",
  /** Combined admin page: require both integrations */
  api_webhooks: ["api_tokens", "webhooks"],
  audit_log: "audit_logs",
};

export type ScreenAccessMap = Record<string, { view: boolean; modify: boolean } | undefined>;

export function canViewSystemAdminNavKey(navKey: string, screenAccess: ScreenAccessMap | null | undefined): boolean {
  if (!screenAccess || Object.keys(screenAccess).length === 0) {
    return true;
  }
  const mapped = SYSTEM_ADMIN_NAV_TO_SCREEN[navKey];
  if (mapped === undefined) {
    return true;
  }
  const keys = Array.isArray(mapped) ? mapped : [mapped];
  return keys.every((k) => Boolean(screenAccess[k]?.view));
}

export type FilterSystemAdminSidebarMode = "showAllWhenNoPermissions" | "showNoneWhenNoPermissions";

/**
 * When merging platform screens into agent/org shells, pass `showNoneWhenNoPermissions` so missing/failed
 * permissions do not expose the full system admin tree.
 */
export function filterSystemAdminSidebarByScreenAccess(
  items: SidebarItem[],
  screenAccess: ScreenAccessMap | null | undefined,
  mode: FilterSystemAdminSidebarMode = "showAllWhenNoPermissions"
): SidebarItem[] {
  if (!screenAccess || Object.keys(screenAccess).length === 0) {
    return mode === "showAllWhenNoPermissions" ? items : [];
  }
  const out: SidebarItem[] = [];
  for (const it of items) {
    if (it.children?.length) {
      const children = filterSystemAdminSidebarByScreenAccess(it.children, screenAccess, mode);
      if (children.length === 0) continue;
      out.push({ ...it, children });
      continue;
    }
    if (canViewSystemAdminNavKey(it.key, screenAccess)) {
      out.push(it);
    }
  }
  return out;
}

export function collectSidebarKeys(items: SidebarItem[]): Set<string> {
  const s = new Set<string>();
  const walk = (list: SidebarItem[]) => {
    for (const it of list) {
      s.add(it.key);
      if (it.children?.length) walk(it.children);
    }
  };
  walk(items);
  return s;
}

function filterAdminItemsNotInBase(adminItems: SidebarItem[], baseKeys: Set<string>): SidebarItem[] {
  const out: SidebarItem[] = [];
  for (const it of adminItems) {
    if (it.children?.length) {
      const ch = filterAdminItemsNotInBase(it.children, baseKeys);
      if (ch.length === 0) continue;
      out.push({ ...it, children: ch });
    } else if (!baseKeys.has(it.key)) {
      out.push(it);
    }
  }
  return out;
}

/**
 * Appends granted platform screens under "System administration" without duplicating keys already present
 * in the role sidebar (e.g. org `users_roles` vs platform Users).
 */
export function mergeGrantedSystemAdminIntoBase(
  baseItems: SidebarItem[],
  grantedAdminTopLevel: SidebarItem[],
  options?: { groupLabel?: string; groupKey?: string; flat?: boolean }
): SidebarItem[] {
  if (grantedAdminTopLevel.length === 0) return baseItems;
  const baseKeys = collectSidebarKeys(baseItems);
  const filtered = filterAdminItemsNotInBase(grantedAdminTopLevel, baseKeys);
  if (filtered.length === 0) return baseItems;
  if (options?.flat) {
    return [...baseItems, ...filtered];
  }
  return [
    ...baseItems,
    {
      key: options?.groupKey ?? "dynamic_system_admin_group",
      label: options?.groupLabel ?? "System administration",
      icon: Settings,
      children: filtered,
    },
  ];
}

/**
 * Requires explicit `screen_access` rows (view) for mapped screens. Used for agent/org/team users who receive
 * partial platform grants.
 */
export function screenAccessAllowsSystemAdminNavKey(
  navKey: string,
  screenAccess: ScreenAccessMap | null | undefined
): boolean {
  const mapped = SYSTEM_ADMIN_NAV_TO_SCREEN[navKey];
  if (mapped === undefined) {
    return true;
  }
  if (!screenAccess || Object.keys(screenAccess).length === 0) {
    return false;
  }
  const keys = Array.isArray(mapped) ? mapped : [mapped];
  return keys.every((k) => Boolean(screenAccess[k]?.view));
}

/** True if at least one platform nav entry is allowed for the user (for merging into non–system-admin shells). */
export function hasAnySystemAdminScreenAccess(screenAccess: ScreenAccessMap | null | undefined): boolean {
  if (!screenAccess || Object.keys(screenAccess).length === 0) return false;
  for (const navKey of Object.keys(SYSTEM_ADMIN_NAV_TO_SCREEN)) {
    if (screenAccessAllowsSystemAdminNavKey(navKey, screenAccess)) return true;
  }
  return false;
}

export function firstLeafNavKey(items: SidebarItem[]): string | null {
  for (const it of items) {
    if (it.children?.length) {
      const k = firstLeafNavKey(it.children);
      if (k) return k;
    } else {
      return it.key;
    }
  }
  return null;
}
