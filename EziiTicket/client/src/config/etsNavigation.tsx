import type { SidebarItem } from "@components/layout/Sidebar";
import { collectSidebarKeys } from "@/config/roleScreenMap";
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  Flag,
  FileText,
  Hash,
  Headphones,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  RadioTower,
  ScrollText,
  Send,
  Settings,
  // Settings2,
  Ticket,
  Users,
} from "lucide-react";

export type EtsAppRoleKind =
  | "customer"
  | "org_admin"
  | "agent"
  | "team_lead"
  | "system_admin";

/** Keys the System Admin sidebar can land on (leaf routes under System Configuration use the same keys). */
export const SYSTEM_ADMIN_SHELL_KEYS = new Set<string>([
  "sys_dashboard",
  "partner_setup",
  "sys_tickets",
  "sys_agents",
  "workspace_module_c",
  // "resolve_setup",
  "users_roles",
  "roles_management",
  "teams_queues",
  "routing_rules",
  "priority_master",
  "keyword_routing",
  "sla_policies",
  "notification_templates",
  "canned_responses",
  "custom_fields",
  "api_webhooks",
  "audit_log",
]);

/** Nav keys that only the System Admin shell may show; other roles are redirected away if stored. */
export const SYSTEM_ADMIN_EXCLUSIVE_NAV_KEYS = new Set<string>([
  "sys_dashboard",
  "partner_setup",
  // "resolve_setup",
  "sys_tickets",
  "sys_agents",
  "routing_rules",
  "priority_master",
  "keyword_routing",
  "teams_queues",
  "sla_policies",
  "notification_templates",
  "canned_responses",
  "custom_fields",
  "api_webhooks",
  "audit_log",
  "roles_management",
]);

const systemConfigurationChildren: SidebarItem[] = [
  { key: "roles_management", label: "Roles & Permissions", icon: KeyRound },
  { key: "users_roles", label: "Users", icon: Users },
  { key: "routing_rules", label: "Routing Rules", icon: LayoutGrid },
  { key: "priority_master", label: "Priority Master", icon: Flag },
  { key: "keyword_routing", label: "Keywords Routing", icon: Hash },
  { key: "teams_queues", label: "Teams & Queues", icon: Ticket },
  { key: "sla_policies", label: "SLA Policies", icon: Settings },
  { key: "canned_responses", label: "Canned Responses", icon: FileText },
  { key: "notification_templates", label: "Notification Templates", icon: Send },
  { key: "custom_fields", label: "Custom Fields", icon: LayoutGrid },
  { key: "audit_log", label: "Audit Log", icon: ScrollText },
  { key: "api_webhooks", label: "API & Webhooks", icon: RadioTower },
  // { key: "resolve_setup", label: "Resolve Setup", icon: Settings2 },
];

/**
 * Agent shell → **Admin** toggle only: org workspace (112–124) + System Configuration (75–86).
 * Not mixed with the agent “My view” nav.
 */
export function getAgentAdminViewSidebarItems(): SidebarItem[] {
  const org = getEtsSidebarItemsForRole("org_admin");
  const orgKeys = collectSidebarKeys(org);
  const extraSysChildren = systemConfigurationChildren.filter((c) => !orgKeys.has(c.key));
  const sysGroup: SidebarItem[] =
    extraSysChildren.length > 0
      ? [
          {
            key: "system_configuration",
            label: "System Configuration",
            icon: Settings,
            children: extraSysChildren,
          },
        ]
      : [];
  return [...org, ...sysGroup];
}

export function getEtsSystemAdminSidebarItems(): SidebarItem[] {
  return [
    { key: "sys_dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "partner_setup", label: "Organizations", icon: Building2 },
    { key: "sys_tickets", label: "Tickets", icon: ClipboardList },
    { key: "sys_agents", label: "Agents", icon: Headphones },
    {
      key: "system_configuration",
      label: "System Configuration",
      icon: Settings,
      children: systemConfigurationChildren,
    },
    { key: "workspace_module_c", label: "Reports", icon: BarChart3 },
  ];
}

export function getEtsSidebarItemsForRole(role: EtsAppRoleKind): SidebarItem[] {
  if (role === "system_admin") {
    return getEtsSystemAdminSidebarItems();
  }
  if (role === "org_admin") {
    return [
      { key: "org_dashboard", label: "Organisation Dashboard", icon: LayoutDashboard },
      { key: "products", label: "Products & Queues", icon: LayoutGrid },
      { key: "users_roles", label: "Users & Teams", icon: Users },
      { key: "org_tickets", label: "Tickets", icon: Ticket },
      { key: "org_sla_policies", label: "SLAs & Policies", icon: Settings },
      { key: "workspace_module_c", label: "Reports", icon: BarChart3 },
      // {
      //   key: "org_settings",
      //   label: "Settings",
      //   icon: Settings2,
      //   children: [
      //     { key: "org_notification_settings", label: "Notification", icon: Send },
      //     { key: "org_profile", label: "Org Profile", icon: Building2 },
      //   ],
      // },
    ];
  }
  // Roles → Screen Wise Access group "Team/Agent": `agent_*` keys + `agent_reports` (this Reports row).
  if (role === "agent" || role === "team_lead") {
    return [
      { key: "agent_dashboard", label: "Team Dashboard", icon: LayoutDashboard },
      { key: "agent_my_tickets", label: "My Tickets", icon: ClipboardList },
      { key: "agent_team_queue", label: "Team Queue", icon: Inbox },
      { key: "agent_history", label: "Resolved / History", icon: History },
      { key: "workspace_module_c", label: "Reports", icon: BarChart3 },
    ];
  }
  return [
    { key: "cust_dashboard", label: "Customer Dashboard", icon: LayoutDashboard },
    { key: "cust_my_tickets", label: "My Tickets", icon: ClipboardList },
    { key: "cust_raise_ticket", label: "Raise a Ticket", icon: Send },
    { key: "cust_guides", label: "Guides", icon: BookOpen },
  ];
}

export function isSystemAdminExclusiveNavKey(key: string): boolean {
  return SYSTEM_ADMIN_EXCLUSIVE_NAV_KEYS.has(key);
}
