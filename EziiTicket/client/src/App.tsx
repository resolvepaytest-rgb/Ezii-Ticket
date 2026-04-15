import { AppToaster } from "@components/common/AppToaster";
import { Loader } from "@components/common/Loader";
import {
  SessionBootstrapScreen,
  type SessionBootstrapStage,
} from "@components/common/SessionBootstrapScreen";
import { EziiTicketLandingPage } from "@pages/public/EziiTicketLandingPage";
import { NavPlaceholder } from "@components/common/NavPlaceholder";
import { ThemeProvider } from "@components/common/ThemeProvider";
import { loginByLink, loginByToken, authMe, getAuthMePermissions } from "@api/authApi";
import { AppShell } from "@components/layout/AppShell";
import type { SidebarItem } from "@components/layout/Sidebar";
import { useAuthStore, type JwtUserClaims } from "@store/useAuthStore";
import { useUIStore } from "@store/useUIStore";
import { getExternalUserProfile, type ExternalUserProfile } from "@api/adminApi";
import {
  getEtsSidebarItemsForRole,
  getEtsSystemAdminSidebarItems,
  isSystemAdminExclusiveNavKey,
  SYSTEM_ADMIN_SHELL_KEYS,
  type EtsAppRoleKind,
} from "@/config/etsNavigation";
import {
  canViewSystemAdminNavKey,
  collectSidebarKeys,
  filterSystemAdminSidebarByScreenAccess,
  firstLeafNavKey,
  hasAnySystemAdminScreenAccess,
  mergeGrantedSystemAdminIntoBase,
  screenAccessAllowsSystemAdminNavKey,
  SYSTEM_ADMIN_NAV_TO_SCREEN,
  type FilterSystemAdminSidebarMode,
  type ScreenAccessMap,
} from "@/config/roleScreenMap";
import type { ActionAccessMap } from "@/config/permissionKeys";
import { CreateTicketDrawer } from "@components/tickets/CreateTicketDrawer";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type UserNotification,
} from "@api/notificationApi";

const OrganizationsPage = lazy(() =>
  import("@pages/admin/OrganizationsPage").then((m) => ({ default: m.OrganizationsPage }))
);
const UsersRolesPage = lazy(() =>
  import("@pages/admin/UsersRolesPage").then((m) => ({ default: m.UsersRolesPage }))
);
const TeamsQueuesPage = lazy(() =>
  import("@pages/admin/TeamsQueuesPage").then((m) => ({ default: m.TeamsQueuesPage }))
);
const RoutingRulesPage = lazy(() =>
  import("@pages/admin/RoutingRulesPage").then((m) => ({ default: m.RoutingRulesPage }))
);
const PriorityMasterPage = lazy(() =>
  import("@pages/admin/PriorityMasterPage").then((m) => ({ default: m.PriorityMasterPage }))
);
const KeywordsRoutingPage = lazy(() =>
  import("@pages/admin/KeywordsRoutingPage").then((m) => ({ default: m.KeywordsRoutingPage }))
);
const SlaPoliciesPage = lazy(() =>
  import("@pages/admin/SlaPoliciesPage").then((m) => ({ default: m.SlaPoliciesPage }))
);
const NotificationTemplatesPage = lazy(() =>
  import("@pages/admin/NotificationTemplatesPage").then((m) => ({ default: m.NotificationTemplatesPage }))
);
const CannedResponsesPage = lazy(() =>
  import("@pages/admin/CannedResponsesPage").then((m) => ({ default: m.CannedResponsesPage }))
);
const CustomFieldsPage = lazy(() =>
  import("@pages/admin/CustomFieldsPage").then((m) => ({ default: m.CustomFieldsPage }))
);
const ApiWebhooksPage = lazy(() =>
  import("@pages/admin/ApiWebhooksPage").then((m) => ({ default: m.ApiWebhooksPage }))
);
const AdminAuditLogPage = lazy(() =>
  import("@pages/admin/AdminAuditLogPage").then((m) => ({ default: m.AdminAuditLogPage }))
);
const SystemOverviewDashboardPage = lazy(() =>
  import("@pages/dashboard/SystemOverviewDashboardPage").then((m) => ({ default: m.SystemOverviewDashboardPage }))
);
const TeamDashboardPage = lazy(() =>
  import("@pages/dashboard/TeamDashboardPage").then((m) => ({ default: m.TeamDashboardPage }))
);
const SystemTicketsPage = lazy(() =>
  import("@pages/dashboard/SystemTicketsPage").then((m) => ({ default: m.SystemTicketsPage }))
);
const RolesPage = lazy(() =>
  import("@pages/admin/RolesPage").then((m) => ({ default: m.RolesPage }))
);
const AgentsPage = lazy(() =>
  import("@pages/admin/AgentsPage").then((m) => ({ default: m.AgentsPage }))
);
const RaiseTicketPage = lazy(() =>
  import("@pages/tickets/RaiseTicketPage").then((m) => ({ default: m.RaiseTicketPage }))
);
const MyTicketsPage = lazy(() =>
  import("@pages/tickets/MyTicketsPage").then((m) => ({ default: m.MyTicketsPage }))
);
const AgentTeamQueuePage = lazy(() =>
  import("@pages/tickets/AgentTeamQueuePage").then((m) => ({ default: m.AgentTeamQueuePage }))
);
const AgentHistoryPage = lazy(() =>
  import("@pages/tickets/AgentHistoryPage").then((m) => ({ default: m.AgentHistoryPage }))
);

function preloadFrequentPages() {
  void Promise.allSettled([
    import("@pages/admin/UsersRolesPage"),
    import("@pages/admin/RolesPage"),
    import("@pages/admin/TeamsQueuesPage"),
    import("@pages/admin/RoutingRulesPage"),
    import("@pages/admin/OrganizationsPage"),
    import("@pages/admin/PriorityMasterPage"),
    import("@pages/admin/KeywordsRoutingPage"),
    import("@pages/admin/SlaPoliciesPage"),
    import("@pages/admin/CannedResponsesPage"),
  ]);
}

const ACTIVE_ORG_STORAGE_KEY = "active-org-id";
const DASHBOARD_VIEW_MODE_STORAGE_KEY = "view-mode";
const DASHBOARD_REFRESH_STORAGE_KEY = "dashboard-refresh-seconds";

const NAV_PATH_MAP: Record<string, string> = {
  org_dashboard: "/dashboard",
  agent_dashboard: "/dashboard",
  cust_dashboard: "/dashboard",
  sys_dashboard: "/system/dashboard",
  sys_tickets: "/system/tickets",
  sys_agents: "/system/agents",
  partner_setup: "/admin/organizations",
  users_roles: "/admin/users-roles",
  roles_management: "/admin/roles",
  teams_queues: "/admin/teams-queues",
  routing_rules: "/admin/routing-rules",
  priority_master: "/admin/priority-master",
  keyword_routing: "/admin/keyword-routing",
  sla_policies: "/admin/sla-policies",
  notification_templates: "/admin/notification-templates",
  canned_responses: "/admin/canned-responses",
  custom_fields: "/admin/custom-fields",
  api_webhooks: "/admin/api-webhooks",
  audit_log: "/admin/audit-log",
  products: "/org/products",
  org_tickets: "/org/tickets",
  org_sla_policies: "/org/sla-policies",
  org_notification_settings: "/org/notification-settings",
  org_profile: "/org/profile",
  agent_my_tickets: "/agent/my-tickets",
  agent_team_queue: "/agent/team-queue",
  agent_history: "/agent/history",
  cust_my_tickets: "/tickets/my",
  cust_raise_ticket: "/tickets/raise",
  cust_guides: "/guides",
  workspace_module_c: "/reports",
};

/** Reverse lookup: one pathname → one key (omit `/dashboard`; it is role-resolved). */
const PATH_NAV_MAP_REVERSE: Record<string, string> = Object.entries(NAV_PATH_MAP).reduce(
  (acc, [key, path]) => {
    if (path === "/dashboard") return acc;
    acc[path] = key;
    return acc;
  },
  {} as Record<string, string>
);

function defaultDashboardNavKey(role: EtsAppRoleKind): string {
  switch (role) {
    case "org_admin":
      return "org_dashboard";
    case "customer":
      return "cust_dashboard";
    case "agent":
    case "team_lead":
      return "agent_dashboard";
    case "system_admin":
      return "sys_dashboard";
  }
}

function navKeyFromPath(pathname: string, roleKind: EtsAppRoleKind): string | null {
  if (pathname === "/dashboard") {
    if (roleKind === "system_admin") return "sys_dashboard";
    return defaultDashboardNavKey(roleKind);
  }
  return PATH_NAV_MAP_REVERSE[pathname] ?? null;
}

function pathFromNavKey(navKey: string): string {
  return NAV_PATH_MAP[navKey] ?? "/";
}

function isWorkspaceDashboardNav(navKey: string): boolean {
  return (
    navKey === "org_dashboard" ||
    navKey === "agent_dashboard" ||
    navKey === "cust_dashboard" ||
    navKey === "workspace_overview"
  );
}

/** Align with server `normalizeRoleNameKey` for primary role checks. */
function normalizeRoleNameKeyForShell(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const CUSTOMER_NAV_TO_SCREEN: Record<string, { primary: string; fallback?: string }> = {
  cust_dashboard: { primary: "customer_dashboard" },
  /** Same `dashboard` key as org/agent “Team Dashboard (agent / org)”; customers get org dashboard, not system dashboard. */
  org_dashboard: { primary: "dashboard" },
  workspace_overview: { primary: "customer_dashboard" },
  cust_my_tickets: { primary: "my_tickets" },
  cust_raise_ticket: { primary: "raise_a_ticket" },
  cust_guides: { primary: "guides" },
};

const ORG_DASHBOARD_SIDEBAR_ITEM: SidebarItem = {
  key: "org_dashboard",
  label: "Org Dashboard",
  icon: LayoutDashboard,
};

/** Agent shell nav key → `screen_access` key (Roles “Team/Agent” group; Reports nav uses `workspace_module_c`). */
const AGENT_NAV_TO_SCREEN: Record<string, string> = {
  agent_dashboard: "agent_dashboard",
  agent_my_tickets: "agent_my_tickets",
  agent_team_queue: "agent_team_queue",
  agent_history: "agent_history",
  workspace_module_c: "agent_reports",
};

/** Org admin shell nav keys → screen_access keys. */
const ORG_ADMIN_NAV_TO_SCREEN: Record<string, string> = {
  org_dashboard: "dashboard",
  org_tickets: "tickets",
  workspace_module_c: "dashboard",
};

/** Seed customer screen rows from legacy team keys when JSON predates split (read-only; no mirroring). */
const LEGACY_TEAM_SCREEN_SEED_FOR_CUSTOMER: Record<string, string> = {
  dashboard: "customer_dashboard",
  tickets: "my_tickets",
};

/** Seed Team/Agent screen rows from legacy admin keys when JSON predates agent_* keys. */
const LEGACY_TEAM_SCREEN_SEED_FOR_AGENT: Record<string, string> = {
  dashboard: "agent_dashboard",
  tickets: "agent_my_tickets",
};

function hasScreenViewAccess(
  screenAccess: ScreenAccessMap | null | undefined,
  key: string | undefined
): boolean {
  if (!screenAccess || !key) return false;
  const entry = screenAccess[key];
  // Keep runtime behavior aligned with RolesPage normalization (modify implies view).
  return Boolean(entry?.view || entry?.modify);
}

function hasAnyScreenViewAccess(
  screenAccess: ScreenAccessMap | null | undefined,
  keys: readonly string[]
): boolean {
  for (const key of keys) {
    if (hasScreenViewAccess(screenAccess, key)) return true;
  }
  return false;
}

const ADMIN_TOGGLE_NAV_TO_SCREEN_KEYS = {
  sys_agents: ["agent"] as const,
  org_tickets: ["tickets"] as const,
} as const;

function normalizeScreenAccessForRuntime(
  input: ScreenAccessMap | null | undefined
): ScreenAccessMap | null {
  if (!input || typeof input !== "object") return null;
  const normalized: ScreenAccessMap = {};
  for (const [key, raw] of Object.entries(input)) {
    const view = Boolean(raw?.view || raw?.modify);
    const modify = Boolean(raw?.modify);
    normalized[key] = { view, modify };
  }
  for (const [legacyKey, customerKey] of Object.entries(LEGACY_TEAM_SCREEN_SEED_FOR_CUSTOMER)) {
    if (Object.prototype.hasOwnProperty.call(input, customerKey)) continue;
    const legacy = normalized[legacyKey];
    if (!legacy) continue;
    normalized[customerKey] = { ...legacy };
  }
  for (const [legacyKey, agentKey] of Object.entries(LEGACY_TEAM_SCREEN_SEED_FOR_AGENT)) {
    if (Object.prototype.hasOwnProperty.call(input, agentKey)) continue;
    const legacy = normalized[legacyKey];
    if (!legacy) continue;
    normalized[agentKey] = { ...legacy };
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeActionsForRuntime(
  input: ActionAccessMap | null | undefined
): ActionAccessMap | null {
  if (!input || typeof input !== "object") return null;
  const out: ActionAccessMap = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = Boolean(v);
  }
  return Object.keys(out).length > 0 ? out : null;
}

function canDoAction(
  actionAccess: ActionAccessMap | null | undefined,
  actionKey: string,
  fallback: boolean
): boolean {
  if (!actionAccess || Object.keys(actionAccess).length === 0) return fallback;
  const v = actionAccess[actionKey];
  return typeof v === "boolean" ? v : fallback;
}

function removeSidebarKey(items: ReturnType<typeof getEtsSystemAdminSidebarItems>, keyToRemove: string) {
  const out = [];
  for (const item of items) {
    if (item.key === keyToRemove) continue;
    if (item.children?.length) {
      out.push({
        ...item,
        children: item.children.filter((child) => child.key !== keyToRemove),
      });
      continue;
    }
    out.push(item);
  }
  return out;
}

function canViewCustomerNavKey(navKey: string, screenAccess: ScreenAccessMap | null | undefined): boolean {
  const mapped = CUSTOMER_NAV_TO_SCREEN[navKey];
  if (!mapped) return true;
  // Customer navigation is strict: no screen_access means no customer-menu grant.
  if (!screenAccess || Object.keys(screenAccess).length === 0) return false;
  const primary = hasScreenViewAccess(screenAccess, mapped.primary);
  const fallback = mapped.fallback ? hasScreenViewAccess(screenAccess, mapped.fallback) : false;
  return primary || fallback;
}

function canViewAgentNavKey(navKey: string, screenAccess: ScreenAccessMap | null | undefined): boolean {
  const screenKey = AGENT_NAV_TO_SCREEN[navKey];
  if (!screenKey) return true;
  if (!screenAccess || Object.keys(screenAccess).length === 0) return false;
  return hasScreenViewAccess(screenAccess, screenKey);
}

function canViewOrgAdminNavKey(navKey: string, screenAccess: ScreenAccessMap | null | undefined): boolean {
  const screenKey = ORG_ADMIN_NAV_TO_SCREEN[navKey];
  if (!screenAccess || Object.keys(screenAccess).length === 0) return true;
  if (screenKey) return hasScreenViewAccess(screenAccess, screenKey);
  if (Object.prototype.hasOwnProperty.call(SYSTEM_ADMIN_NAV_TO_SCREEN, navKey)) {
    return screenAccessAllowsSystemAdminNavKey(navKey, screenAccess);
  }
  if (!screenAccess || Object.keys(screenAccess).length === 0) return true;
  return true;
}

function filterSidebarByNavAccess(
  items: SidebarItem[],
  canViewLeaf: (navKey: string) => boolean
): SidebarItem[] {
  const out: SidebarItem[] = [];
  for (const it of items) {
    if (it.children?.length) {
      const children: SidebarItem[] = filterSidebarByNavAccess(it.children, canViewLeaf);
      if (children.length > 0) out.push({ ...it, children });
      continue;
    }
    if (canViewLeaf(it.key)) out.push(it);
  }
  return out;
}

/** My view: only keys in `myViewKeys`. Admin (`mode === "team"`): only keys not in `myViewKeys` (no overlap). */
function filterSidebarByViewBucket(
  items: SidebarItem[],
  myViewKeys: ReadonlySet<string>,
  mode: "team" | "my_view"
): SidebarItem[] {
  const out: SidebarItem[] = [];
  for (const it of items) {
    if (it.children?.length) {
      const children = filterSidebarByViewBucket(it.children, myViewKeys, mode);
      if (children.length > 0) out.push({ ...it, children });
      continue;
    }
    const inMy = myViewKeys.has(it.key);
    const include = mode === "my_view" ? inMy : !inMy;
    if (include) out.push(it);
  }
  return out;
}

/** Admin toggle (non-system shells): org-admin style nav, filtered by org actions and screen_access. */
function filterAdminToggleSidebarByAccess(
  items: SidebarItem[],
  screenAccess: ScreenAccessMap | null | undefined,
  ctx: {
    canOpenOrgProducts: boolean;
    canOpenOrgUsersRoles: boolean;
    canOpenAgentsScreen: boolean;
    canOpenOrgSlaPolicies: boolean;
    canOpenTicketList: boolean;
  },
  systemAdminFilterMode: FilterSystemAdminSidebarMode
): SidebarItem[] {
  const { canOpenOrgProducts, canOpenOrgUsersRoles, canOpenAgentsScreen, canOpenOrgSlaPolicies, canOpenTicketList } = ctx;
  const hasSa = Boolean(screenAccess && Object.keys(screenAccess).length > 0);

  const canOrgLeaf = (key: string): boolean => {
    if (!hasSa) {
      switch (key) {
        case "products":
          return canOpenOrgProducts;
        case "users_roles":
          return canOpenOrgUsersRoles;
        case "org_tickets":
          return canOpenTicketList;
        case "org_sla_policies":
          return canOpenOrgSlaPolicies;
        default:
          return true;
      }
    }
    switch (key) {
      case "org_dashboard":
        return hasScreenViewAccess(screenAccess, "dashboard");
      case "sys_agents":
        return canOpenAgentsScreen;
      case "products":
        return canOpenOrgProducts;
      case "org_tickets":
        return canOpenTicketList || hasAnyScreenViewAccess(screenAccess, ADMIN_TOGGLE_NAV_TO_SCREEN_KEYS.org_tickets);
      case "org_sla_policies":
        return canOpenOrgSlaPolicies;
      case "workspace_module_c":
        return hasScreenViewAccess(screenAccess, "dashboard");
      case "users_roles":
        return (
          (canOpenOrgUsersRoles || hasScreenViewAccess(screenAccess, "users")) &&
          screenAccessAllowsSystemAdminNavKey("users_roles", screenAccess)
        );
      default:
        break;
    }
    if (Object.prototype.hasOwnProperty.call(SYSTEM_ADMIN_NAV_TO_SCREEN, key)) {
      return screenAccessAllowsSystemAdminNavKey(key, screenAccess);
    }
    return true;
  };

  const sysMode: FilterSystemAdminSidebarMode =
    !screenAccess || Object.keys(screenAccess).length === 0
      ? "showAllWhenNoPermissions"
      : systemAdminFilterMode;

  const out: SidebarItem[] = [];
  for (const it of items) {
    if (it.key === "system_configuration" && it.children?.length) {
      const ch = filterSystemAdminSidebarByScreenAccess(it.children, screenAccess, sysMode);
      if (ch.length) out.push({ ...it, children: ch });
      continue;
    }
    if (it.key === "org_settings" && it.children?.length) {
      const ch = filterSidebarByNavAccess(it.children, () => true);
      if (ch.length) out.push({ ...it, children: ch });
      continue;
    }
    if (it.children?.length) {
      const ch = filterSidebarByNavAccess(it.children, canOrgLeaf);
      if (ch.length) out.push({ ...it, children: ch });
      continue;
    }
    if (canOrgLeaf(it.key)) out.push(it);
  }
  return out;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value) {
      localStorage.setItem(key, value);
      return;
    }
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

function isTokenLoginPath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  return (
    (parts.length === 4 && parts[0] === "auth" && parts[1] === "login") ||
    (parts.length === 2 && parts[0] === "id")
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState(
    () => navKeyFromPath(location.pathname, "agent") ?? "agent_dashboard"
  );
  const [viewMode, setViewMode] = useState<"team" | "my_view">(
    () =>
      (readStorage(DASHBOARD_VIEW_MODE_STORAGE_KEY) as "team" | "my_view" | null) ??
      "my_view"
  );
  const [dashboardRefreshSeconds, setDashboardRefreshSeconds] = useState<number>(
    () => Number(readStorage(DASHBOARD_REFRESH_STORAGE_KEY) ?? "60") || 60
  );

  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const [authLoading, setAuthLoading] = useState(true);
  /** Shown while `authLoading`: brief splash, then token/session check via `authMe`. */
  const [authGateStep, setAuthGateStep] = useState<"splash" | "checking">("splash");
  const [showTokenLoginBootstrapUi, setShowTokenLoginBootstrapUi] = useState(() =>
    isTokenLoginPath(location.pathname)
  );

  const [profile, setProfile] = useState<ExternalUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(
    () => readStorage(ACTIVE_ORG_STORAGE_KEY) ?? null
  );
  const [initialNavResolved, setInitialNavResolved] = useState(false);
  /** `roles.name` from `user_roles` for current org (may be "L3" while JWT `role_name` is still "customer"). */
  const [meScopedRoleName, setMeScopedRoleName] = useState<string | null>(null);
  /** Every role name from `/auth/me/permissions` `access_roles` (for mapRoleKind when primary row is not system_admin). */
  const [meAccessRoleNames, setMeAccessRoleNames] = useState<string[]>([]);
  /** `org_support_levels.name` from `user_org_support_levels` (e.g. L3 tier label). */
  const [meSupportLevelName, setMeSupportLevelName] = useState<string | null>(null);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [screenAccess, setScreenAccess] = useState<ScreenAccessMap | null>(null);
  const [actionAccess, setActionAccess] = useState<ActionAccessMap | null>(null);
  const [createTicketDrawerOpen, setCreateTicketDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<"unread" | "read">("unread");
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationItems, setNotificationItems] = useState<UserNotification[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [focusedTicketId, setFocusedTicketId] = useState<number | null>(null);
  const notificationRequestIdRef = useRef(0);

  const loadNotifications = async (tab: "unread" | "read" = notificationTab) => {
    if (!user) return;
    const requestId = ++notificationRequestIdRef.current;
    setNotificationsLoading(true);
    try {
      const data = await listMyNotifications(tab, 50);
      if (requestId !== notificationRequestIdRef.current) return;
      setNotificationItems(data.items);
      setNotificationUnreadCount(data.unread_count);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      if (requestId === notificationRequestIdRef.current) {
        setNotificationsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!user || !notificationsOpen) return;
    void loadNotifications(notificationTab);
    const timer = window.setInterval(() => {
      void loadNotifications(notificationTab);
    }, 20000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, notificationsOpen, notificationTab]);

  useEffect(() => {
    // If opened via magic-link:
    // - /auth/login/:orgId/:token
    // - /id/:token
    // store token in localStorage once.
    const parts = location.pathname.split("/").filter(Boolean);
    let handled = false;
    if (parts.length === 4 && parts[0] === "auth" && parts[1] === "login") {
      setShowTokenLoginBootstrapUi(true);
      const orgId = parts[2]!;
      const token = parts[3]!;
      try {
        localStorage.setItem("jwt_token", token);
      } catch {
        // ignore
      }
      void loginByLink(orgId, token).catch(() => {
        // keep token stored; server will reject on protected calls if invalid
      });
      handled = true;
    } else if (parts.length === 2 && parts[0] === "id") {
      setShowTokenLoginBootstrapUi(true);
      const token = parts[1]!;
      try {
        localStorage.setItem("jwt_token", token);
      } catch {
        // ignore
      }
      void loginByToken(token).catch(() => {
        // keep token stored; server will reject on protected calls if invalid
      });
      handled = true;
    }

    if (handled) {
      setActiveNav("agent_dashboard");
      navigate("/", { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (authLoading || (user && !permissionsLoaded)) return;
    if (showTokenLoginBootstrapUi) {
      setShowTokenLoginBootstrapUi(false);
    }
  }, [authLoading, user, permissionsLoaded, showTokenLoginBootstrapUi]);

  useEffect(() => {
    // Load user claims once on app startup (avoid full-shell reload on every route change)
    // Load user claims (if token exists)
    void (async () => {
      setAuthLoading(true);
      setAuthGateStep("splash");
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 120);
      });
      setAuthGateStep("checking");
      try {
        const me = await authMe();
        const claims = me.user as JwtUserClaims;
        setUser(claims);
        useUIStore.setState({ mode: "light" });
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, [setUser]);

  useEffect(() => {
    if (!user) return;
    setProfileLoading(true);
    setProfileError(null);

    void (async () => {
      try {
        const p = await getExternalUserProfile();
        setProfile(p);
        setActiveOrgId((prev) => prev ?? (p.org_id ? String(p.org_id) : user.org_id ?? null));
      } catch (e) {
        setProfileError(
          e instanceof Error ? e.message : "Failed to load user profile"
        );
        setProfile(null);
        setActiveOrgId((prev) => prev ?? (user.org_id ?? null));
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setScreenAccess(null);
      setActionAccess(null);
      setMeScopedRoleName(null);
      setMeAccessRoleNames([]);
      setMeSupportLevelName(null);
      setPermissionsLoaded(false);
      return;
    }
    let cancelled = false;
    setPermissionsLoaded(false);
    void getAuthMePermissions()
      .then((data) => {
        if (cancelled) return;
        setMeScopedRoleName(data.role_name ?? null);
        setMeAccessRoleNames(
          (data.access_roles ?? [])
            .map((r) => String(r.role_name ?? "").trim())
            .filter(Boolean)
        );
        setMeSupportLevelName(data.support_level?.support_level_name ?? null);
        const raw = data.permissions_json?.screen_access;
        const normalized = normalizeScreenAccessForRuntime(raw as ScreenAccessMap | null | undefined);
        const actionRaw = data.permissions_json?.actions as ActionAccessMap | null | undefined;
        const actionNormalized = normalizeActionsForRuntime(actionRaw);
        if (normalized) {
          setScreenAccess(normalized);
        } else {
          setScreenAccess(null);
        }
        if (actionNormalized) {
          setActionAccess(actionNormalized);
        } else {
          setActionAccess(null);
        }
        setPermissionsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setScreenAccess(null);
          setActionAccess(null);
          setMeScopedRoleName(null);
          setMeAccessRoleNames([]);
          setMeSupportLevelName(null);
          setPermissionsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    writeStorage(DASHBOARD_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode, user]);

  useEffect(() => {
    if (!user) return;
    writeStorage(DASHBOARD_REFRESH_STORAGE_KEY, String(dashboardRefreshSeconds));
  }, [dashboardRefreshSeconds, user]);

  useEffect(() => {
    if (!user) return;
    writeStorage(ACTIVE_ORG_STORAGE_KEY, activeOrgId);
  }, [activeOrgId, user]);

  const handleLogout = () => {
    writeStorage(ACTIVE_ORG_STORAGE_KEY, null);
    writeStorage(DASHBOARD_VIEW_MODE_STORAGE_KEY, null);
    writeStorage(DASHBOARD_REFRESH_STORAGE_KEY, null);
    setActiveNav("agent_dashboard");
    setViewMode("team");
    setDashboardRefreshSeconds(60);
    setActiveOrgId(null);
    setNotificationsOpen(false);
    setNotificationItems([]);
    setNotificationUnreadCount(0);
    notificationRequestIdRef.current += 1;
    logout();
    /** Public landing lives at `/`; do not leave the authenticated shell path in the bar after sign-out. */
    navigate("/", { replace: true });
  };

  const hasScreenAccessView = Boolean(
    screenAccess && Object.values(screenAccess).some((entry) => Boolean(entry?.view || entry?.modify))
  );
  const hasAnyActionAccess = Boolean(actionAccess && Object.keys(actionAccess).length > 0);
  const hasAnyViewAccess = hasScreenAccessView || hasAnyActionAccess || hasAnySystemAdminScreenAccess(screenAccess);
  const canViewCustomerDashboard = canViewCustomerNavKey("cust_dashboard", screenAccess);
  const canViewCustomerTickets = canViewCustomerNavKey("cust_my_tickets", screenAccess);
  const isSystemAdminIdentity =
    user?.org_id === "1" &&
    user?.user_id === "1" &&
    user?.role_id === "1" &&
    String(user?.user_type_id ?? "") === "1" &&
    ["admin", "administrator"].includes(String(user?.role_name ?? "").toLowerCase().trim());
  const isSystemAdminInterface = Boolean(
    isSystemAdminIdentity ||
      meScopedRoleName?.toLowerCase().includes("system_admin") ||
      meAccessRoleNames.some((name) => name.toLowerCase().includes("system_admin")) ||
      meSupportLevelName?.toLowerCase().includes("system_admin")
  );
  const noAccessAssigned = !isSystemAdminInterface && !hasAnyViewAccess;
  /** Primary role from `/auth/me/permissions` (falls back to JWT). Mis-set `tickets.list` on customer roles must not open agent shell. */
  const isPrimaryCustomerRole =
    normalizeRoleNameKeyForShell(meScopedRoleName ?? user?.role_name) === "customer";
  /** Keep shell chrome stable: org permissions alone must not force org-admin shell unless primary role is org_admin. */
  const isPrimaryOrgAdminRole =
    normalizeRoleNameKeyForShell(meScopedRoleName ?? user?.role_name) === "org_admin";
  const showCreateTicketButtonInSidebar =
    isSystemAdminInterface ||
    canDoAction(actionAccess, "tickets.create", false) ||
    canViewCustomerNavKey("cust_raise_ticket", screenAccess);
  const hasCustomerScopedAccess =
    canViewCustomerDashboard ||
    canViewCustomerTickets ||
    canViewCustomerNavKey("cust_raise_ticket", screenAccess) ||
    canViewCustomerNavKey("cust_guides", screenAccess) ||
    (isPrimaryCustomerRole && hasScreenViewAccess(screenAccess, "dashboard"));
  const canOpenTicketList =
    isSystemAdminInterface ||
    hasAnyScreenViewAccess(screenAccess, ADMIN_TOGGLE_NAV_TO_SCREEN_KEYS.org_tickets);
  const canOpenMyTickets =
    isSystemAdminInterface ||
    canDoAction(actionAccess, "tickets.list_my", false) ||
    canViewCustomerTickets ||
    hasScreenViewAccess(screenAccess, "agent_my_tickets");
  const canOpenRaiseTicket =
    isSystemAdminInterface ||
    canDoAction(actionAccess, "tickets.create", false) ||
    canViewCustomerNavKey("cust_raise_ticket", screenAccess);
  const canOpenOrgProducts =
    isSystemAdminInterface ||
    (!isPrimaryCustomerRole &&
      (canDoAction(actionAccess, "products.read", false) || hasScreenViewAccess(screenAccess, "products")));
  const canOpenOrgUsersRoles =
    isSystemAdminInterface ||
    (!isPrimaryCustomerRole &&
      (canDoAction(actionAccess, "users.read", false) || hasScreenViewAccess(screenAccess, "users")));
  const canOpenAgentsScreen =
    isSystemAdminInterface ||
    hasAnyScreenViewAccess(screenAccess, ADMIN_TOGGLE_NAV_TO_SCREEN_KEYS.sys_agents);
  const canOpenOrgSlaPolicies =
    isSystemAdminInterface ||
    (!isPrimaryCustomerRole &&
      (canDoAction(actionAccess, "sla.policies.manage", false) || hasScreenViewAccess(screenAccess, "sla_policies")));
  const isCustomerExperience =
    isPrimaryCustomerRole ||
    (hasCustomerScopedAccess &&
      !canOpenTicketList &&
      !canOpenOrgProducts &&
      !canOpenOrgUsersRoles &&
      !canOpenOrgSlaPolicies);
  /**
   * Shell template only: explicit **actions** (products.read / users.read / sla.policies.manage).
   * Do not use screen_access "users" alone — that was flipping team/agent to org_admin and killing My/Admin toggle.
   */
  const isOrgAdminShell =
    !isPrimaryCustomerRole &&
    isPrimaryOrgAdminRole &&
    (canDoAction(actionAccess, "products.read", false) ||
      canDoAction(actionAccess, "users.read", false) ||
      canDoAction(actionAccess, "sla.policies.manage", false));
  const shellRoleKind: EtsAppRoleKind = isSystemAdminInterface
    ? "system_admin"
    : isPrimaryCustomerRole || isCustomerExperience
      ? "customer"
      : isOrgAdminShell
        ? "org_admin"
        : "agent";
  const roleSidebarItems = getEtsSidebarItemsForRole(shellRoleKind);

  const resolveTicketDestinationNav = (): string => {
    if (canOpenTicketList) return isSystemAdminInterface ? "sys_tickets" : "org_tickets";
    if (canOpenMyTickets) return canViewCustomerTickets ? "cust_my_tickets" : "agent_my_tickets";
    if (canOpenRaiseTicket) return "cust_raise_ticket";
    return defaultDashboardNavKey(shellRoleKind);
  };

  const goToTicketByRole = (ticketId: number) => {
    setActiveNav(resolveTicketDestinationNav());
    setFocusedTicketId(ticketId);
    setNotificationsOpen(false);
  };

  const goToPostCreateTicketDestination = () => {
    setActiveNav(resolveTicketDestinationNav());
  };

  const goToDashboardTicketsDestination = () => {
    if (canOpenTicketList) {
      setActiveNav(isSystemAdminInterface ? "sys_tickets" : "org_tickets");
      return;
    }
    if (canOpenMyTickets) {
      setActiveNav(canViewCustomerTickets ? "cust_my_tickets" : "agent_my_tickets");
    }
  };

  const onNotificationClick = async (n: UserNotification) => {
    try {
      if (!n.is_read) {
        await markNotificationRead(n.id);
      }
      await loadNotifications(notificationTab);
      const match = n.navigate_url.match(/\/tickets\/(\d+)/);
      const ticketId = match?.[1] ? Number(match[1]) : null;
      if (ticketId && Number.isFinite(ticketId)) {
        goToTicketByRole(ticketId);
      } else {
        setNotificationsOpen(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open notification");
    }
  };

  const onReadAllNotifications = async () => {
    try {
      await markAllNotificationsRead();
      await loadNotifications(notificationTab);
      toast.success("All notifications marked as read");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark all as read");
    }
  };

  const shellRoleKindRef = useRef(shellRoleKind);
  shellRoleKindRef.current = shellRoleKind;

  const adminSidebarFilterMode = isSystemAdminInterface
    ? "showAllWhenNoPermissions"
    : "showNoneWhenNoPermissions";

  const adminToggleItems = useMemo(
    () =>
      filterAdminToggleSidebarByAccess(
        getEtsSidebarItemsForRole("org_admin"),
        screenAccess,
        {
          canOpenOrgProducts,
          canOpenOrgUsersRoles,
          canOpenAgentsScreen,
          canOpenOrgSlaPolicies,
          canOpenTicketList,
        },
        adminSidebarFilterMode
      ),
    [
      screenAccess,
      canOpenOrgProducts,
      canOpenOrgUsersRoles,
      canOpenAgentsScreen,
      canOpenOrgSlaPolicies,
      canOpenTicketList,
      adminSidebarFilterMode,
    ]
  );
  const splitSidebarEligible =
    !isSystemAdminInterface &&
    shellRoleKind !== "org_admin" &&
    (shellRoleKind === "customer" ? hasCustomerScopedAccess : adminToggleItems.length > 0);
  const showDashboardViewToggle = splitSidebarEligible;
  const forceTeamDashboardView =
    isSystemAdminInterface ||
    (canOpenTicketList && shellRoleKind !== "agent" && shellRoleKind !== "customer");
  const dashboardViewMode = forceTeamDashboardView ? "team" : splitSidebarEligible ? viewMode : "my_view";

  const canRenderSystemAdminRoute = useCallback(
    (navKey: string) => {
      if (!SYSTEM_ADMIN_SHELL_KEYS.has(navKey)) return false;
      if (isSystemAdminInterface) {
        if (screenAccess === null || Object.keys(screenAccess).length === 0) return true;
        return canViewSystemAdminNavKey(navKey, screenAccess);
      }
      return screenAccessAllowsSystemAdminNavKey(navKey, screenAccess);
    },
    [isSystemAdminInterface, screenAccess]
  );

  /** When true, render platform admin pages (Users, SLA, Custom fields, etc.) for this `activeNav`. */
  const renderSystemAdminShellRoutes =
    SYSTEM_ADMIN_SHELL_KEYS.has(activeNav) && canRenderSystemAdminRoute(activeNav);

  /**
   * System-admin / org-admin chrome (header + layout). Granted customer/agent users keep the default shell
   * while still rendering admin route content when `renderSystemAdminShellRoutes` is true.
   */
  const showSystemAdminChrome =
    (isSystemAdminInterface || isOrgAdminShell) && renderSystemAdminShellRoutes;

  /** Agent / team_lead shell: My view items respect `screen_access` Team/Agent keys. */
  const shellBaseSidebarItems = useMemo(() => {
    if (shellRoleKind === "org_admin") {
      return filterSidebarByNavAccess(roleSidebarItems, (navKey) =>
        canViewOrgAdminNavKey(navKey, screenAccess)
      );
    }
    if (shellRoleKind !== "agent") return roleSidebarItems;
    return filterSidebarByNavAccess(roleSidebarItems, (navKey) =>
      canViewAgentNavKey(navKey, screenAccess)
    );
  }, [shellRoleKind, roleSidebarItems, screenAccess]);

  /** Keys allowed in “My view” for the current shell (customer + agent filtered; org unchanged). */
  const sidebarItemsForMyViewBucket = useMemo(() => {
    if (isCustomerExperience) {
      return filterSidebarByNavAccess(shellBaseSidebarItems, (navKey) =>
        canViewCustomerNavKey(navKey, screenAccess)
      );
    }
    return shellBaseSidebarItems;
  }, [isCustomerExperience, screenAccess, shellBaseSidebarItems]);

  const sidebarItemsForShell = useMemo(() => {
    const splitSidebar = splitSidebarEligible;

    let adminFiltered = filterSystemAdminSidebarByScreenAccess(
      getEtsSystemAdminSidebarItems(),
      screenAccess,
      adminSidebarFilterMode
    );
    if (!isSystemAdminInterface && !canOpenTicketList && canOpenMyTickets && dashboardViewMode === "team") {
      adminFiltered = removeSidebarKey(adminFiltered, "sys_tickets");
    }
    if (isSystemAdminInterface) {
      return adminFiltered;
    }

    if (shellRoleKind === "org_admin") {
      return shellBaseSidebarItems;
    }

    /** For customer/agent/team_lead/custom shells, Admin toggle uses org-admin style menu. */
    if (splitSidebar) {
      if (dashboardViewMode === "my_view") {
        return sidebarItemsForMyViewBucket;
      }
      return adminToggleItems;
    }

    let combined: SidebarItem[];
    if (isCustomerExperience) {
      combined = sidebarItemsForMyViewBucket;
      if (hasAnySystemAdminScreenAccess(screenAccess)) {
        let grantForCustomer = removeSidebarKey(adminFiltered, "sys_dashboard");
        grantForCustomer = removeSidebarKey(grantForCustomer, "partner_setup");
        if (screenAccessAllowsSystemAdminNavKey("sys_dashboard", screenAccess)) {
          grantForCustomer = [ORG_DASHBOARD_SIDEBAR_ITEM, ...grantForCustomer];
        }
        combined = mergeGrantedSystemAdminIntoBase(combined, grantForCustomer, {
          flat: !isOrgAdminShell,
        });
      }
    } else if (!hasAnySystemAdminScreenAccess(screenAccess)) {
      combined = shellBaseSidebarItems;
    } else {
      const useFlatNavigation = !isOrgAdminShell;
      combined = mergeGrantedSystemAdminIntoBase(shellBaseSidebarItems, adminFiltered, { flat: useFlatNavigation });
    }

    if (splitSidebar) {
      return filterSidebarByViewBucket(
        combined,
        collectSidebarKeys(sidebarItemsForMyViewBucket),
        dashboardViewMode
      );
    }
    return combined;
  }, [
    shellBaseSidebarItems,
    sidebarItemsForMyViewBucket,
    screenAccess,
    adminSidebarFilterMode,
    dashboardViewMode,
    isSystemAdminInterface,
    canOpenTicketList,
    canOpenMyTickets,
    isCustomerExperience,
    isOrgAdminShell,
    splitSidebarEligible,
    shellRoleKind,
    adminToggleItems,
  ]);

  useEffect(() => {
    if (!user || !permissionsLoaded) return;
    // Preserve explicit route refreshes (e.g. /admin/users-roles); only enforce view bucket on dashboard route.
    if (location.pathname !== "/dashboard") return;
    const splitSidebar = splitSidebarEligible;
    if (!splitSidebar) return;

    const mySet = collectSidebarKeys(sidebarItemsForMyViewBucket);
    const inMy = mySet.has(activeNav);
    if (dashboardViewMode === "my_view" && !inMy) {
      const next = firstLeafNavKey(sidebarItemsForShell);
      if (next && next !== activeNav) setActiveNav(next);
      return;
    }
    if (dashboardViewMode === "team" && inMy) {
      const next = firstLeafNavKey(sidebarItemsForShell);
      if (next && next !== activeNav) setActiveNav(next);
    }
  }, [
    user,
    permissionsLoaded,
    roleSidebarItems,
    splitSidebarEligible,
    isCustomerExperience,
    isSystemAdminInterface,
    shellRoleKind,
    dashboardViewMode,
    activeNav,
    sidebarItemsForShell,
    sidebarItemsForMyViewBucket,
    location.pathname,
  ]);

  useEffect(() => {
    if (!user || !permissionsLoaded) return;
    if (!isCustomerExperience) return;
    if (activeNav !== "sys_dashboard") return;
    setActiveNav(
      screenAccessAllowsSystemAdminNavKey("sys_dashboard", screenAccess) ? "org_dashboard" : "cust_dashboard"
    );
  }, [user, permissionsLoaded, isCustomerExperience, activeNav, screenAccess]);

  useEffect(() => {
    if (!user || !permissionsLoaded) return;
    if (shellRoleKind !== "agent") return;
    if (canViewAgentNavKey(activeNav, screenAccess)) return;
    const next =
      firstLeafNavKey(shellBaseSidebarItems) ?? firstLeafNavKey(sidebarItemsForShell);
    if (next && next !== activeNav) setActiveNav(next);
  }, [
    user,
    permissionsLoaded,
    shellRoleKind,
    screenAccess,
    activeNav,
    shellBaseSidebarItems,
    sidebarItemsForShell,
  ]);

  useEffect(() => {
    if (!user || !permissionsLoaded) return;
    if (hasCustomerScopedAccess && !canViewCustomerNavKey(activeNav, screenAccess)) {
      const filteredCustomerItems = filterSidebarByNavAccess(roleSidebarItems, (navKey) =>
        canViewCustomerNavKey(navKey, screenAccess)
      );
      const next = firstLeafNavKey(filteredCustomerItems);
      setActiveNav(next ?? defaultDashboardNavKey(shellRoleKind));
      return;
    }
    if (!SYSTEM_ADMIN_SHELL_KEYS.has(activeNav)) return;
    if (canRenderSystemAdminRoute(activeNav)) return;
    const filtered = filterSystemAdminSidebarByScreenAccess(
      getEtsSystemAdminSidebarItems(),
      screenAccess,
      adminSidebarFilterMode
    );
    const next = firstLeafNavKey(filtered);
    if (isSystemAdminInterface) {
      if (next) setActiveNav(next);
    } else {
      setActiveNav(defaultDashboardNavKey(shellRoleKind));
    }
  }, [
    user,
    permissionsLoaded,
    hasCustomerScopedAccess,
    screenAccess,
    activeNav,
    roleSidebarItems,
    isSystemAdminInterface,
    adminSidebarFilterMode,
    canRenderSystemAdminRoute,
    shellRoleKind,
  ]);

  useEffect(() => {
    if (initialNavResolved) return;
    if (!user) return;
    if (profileLoading) return;
    if (!activeOrgId) return;

    // On first render after login:
    // - System Admin should only keep routes that belong to the system shell.
    // - Non–system-admin users: stay on system routes only when screen_access grants them.
    if (isSystemAdminInterface) {
      if (!SYSTEM_ADMIN_SHELL_KEYS.has(activeNav)) {
        setActiveNav("sys_dashboard");
        setViewMode("team");
      }
    } else if (isSystemAdminExclusiveNavKey(activeNav) && !canRenderSystemAdminRoute(activeNav)) {
      setActiveNav(defaultDashboardNavKey(shellRoleKind));
    }
    setInitialNavResolved(true);
  }, [
    initialNavResolved,
    user,
    profileLoading,
    activeOrgId,
    isSystemAdminInterface,
    activeNav,
    canRenderSystemAdminRoute,
    shellRoleKind,
  ]);

  useEffect(() => {
    if (!user) return;
    if (activeNav === "workspace_module_a") {
      if (canOpenTicketList) setActiveNav(isSystemAdminInterface ? "sys_tickets" : "org_tickets");
      else if (canOpenMyTickets) setActiveNav(canViewCustomerTickets ? "cust_my_tickets" : "agent_my_tickets");
      else if (canOpenRaiseTicket) setActiveNav("cust_raise_ticket");
      else setActiveNav(defaultDashboardNavKey(shellRoleKind));
      return;
    }
    if (activeNav === "workspace_sla_configuration") {
      setActiveNav(canOpenOrgSlaPolicies ? "org_sla_policies" : defaultDashboardNavKey(shellRoleKind));
      return;
    }
    if (activeNav === "workspace_module_b") {
      setActiveNav(defaultDashboardNavKey(shellRoleKind));
      return;
    }
    if (isCustomerExperience) {
      if (activeNav === "workspace_module_c") setActiveNav("cust_guides");
      if (activeNav === "roles_management" && !canRenderSystemAdminRoute("roles_management")) {
        setActiveNav(defaultDashboardNavKey(shellRoleKind));
      }
      return;
    }
    if (isOrgAdminShell) {
      return;
    }
    if (activeNav === "roles_management" && !canRenderSystemAdminRoute("roles_management")) {
      setActiveNav(defaultDashboardNavKey(shellRoleKind));
    }
  }, [
    user,
    activeNav,
    canRenderSystemAdminRoute,
    canOpenOrgSlaPolicies,
    canOpenTicketList,
    canOpenMyTickets,
    canOpenRaiseTicket,
    isSystemAdminInterface,
    canViewCustomerTickets,
    isCustomerExperience,
    isOrgAdminShell,
    shellRoleKind,
  ]);

  useEffect(() => {
    const next = navKeyFromPath(location.pathname, shellRoleKindRef.current);
    if (!next) return;
    setActiveNav((prev) => (prev === next ? prev : next));
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    const next = navKeyFromPath(location.pathname, shellRoleKind);
    if (!next) return;
    setActiveNav((prev) => (prev === next ? prev : next));
  }, [user, location.pathname, shellRoleKind]);

  useEffect(() => {
    if (!user) return;
    if (activeNav !== "workspace_overview") return;
    setActiveNav(defaultDashboardNavKey(shellRoleKind));
  }, [user, shellRoleKind, activeNav]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      preloadFrequentPages();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const targetPath = pathFromNavKey(activeNav);
    if (targetPath !== location.pathname) {
      navigate(targetPath);
    }
  }, [activeNav, location.pathname, navigate, user]);

  /** `/dashboard` is only for signed-in shell; normalize to `/` when session is gone (e.g. expiry, cleared token). */
  useEffect(() => {
    if (user) return;
    if (location.pathname !== "/dashboard") return;
    navigate("/", { replace: true });
  }, [user, location.pathname, navigate]);

  const sessionBootstrapStage: SessionBootstrapStage = authLoading
    ? authGateStep === "splash"
      ? "loading"
      : "checking_credentials"
    : user && !permissionsLoaded
      ? "verifying_credentials"
      : "loading";

  if (authLoading || (user && !permissionsLoaded)) {
    if (!showTokenLoginBootstrapUi) {
      return (
        <ThemeProvider>
          <AppToaster />
          <div className="flex min-h-svh items-center justify-center p-6">
            <Loader label="Loading..." size="md" />
          </div>
        </ThemeProvider>
      );
    }
    return (
      <ThemeProvider>
        <AppToaster />
        <SessionBootstrapScreen stage={sessionBootstrapStage} productTitle="Ezii Ticketing" />
      </ThemeProvider>
    );
  }

  if (!user) {
    const showPublicLanding = location.pathname === "/";
    if (showPublicLanding) {
      return (
        <ThemeProvider>
          <AppToaster />
          <EziiTicketLandingPage
            onAccessClick={() =>
              toast.message("Sign in", {
                description:
                  "Use the secure access link from your administrator, or open your organization’s Ezii Ticket sign-in page.",
              })
            }
          />
        </ThemeProvider>
      );
    }
    return (
      <ThemeProvider>
        <AppToaster />
        <div className="flex min-h-svh items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-black/10 bg-background p-6 text-center shadow-sm dark:border-white/10">
            <h1 className="text-xl font-semibold">Please login first</h1>
            <p className="mt-2 text-sm text-muted-foreground">Please login first to access data.</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AppToaster />
      <AppShell
        productName="ezii-ticketing"
        userLabel={
          profile
            ? `${profile.employer_name || profile.email} (${profile.user_id})`
            : `user_id: ${user?.user_id ?? "-"}`
        }
        userInfo={{
          name:
            profile?.employer_name ||
            profile?.email ||
            `user_id: ${user?.user_id ?? "-"}`,
          email: profile?.email ?? null,
          employeeId: profile?.employee_number ?? null,
          roleName: meScopedRoleName ?? user?.role_name ?? null,
          position: null,
          dateOfJoining: null,
        }}
        onLogout={handleLogout}
        sidebarOrgName={profile?.organization_name || ""}
        sidebarOrgLogoUrl={profile?.organization_logo ?? undefined}
        sidebarItems={noAccessAssigned ? [] : sidebarItemsForShell}
        activeNavKey={activeNav}
        onNavSelect={setActiveNav}
        showCreateTicketButton={showCreateTicketButtonInSidebar}
        onCreateTicketClick={() => setCreateTicketDrawerOpen(true)}
        showViewModeToggle={showDashboardViewToggle}
        viewMode={dashboardViewMode}
        onViewModeChange={setViewMode}
        headerVariant={showSystemAdminChrome ? "system_admin" : "default"}
        onHeaderNotificationsClick={() => {
          setNotificationsOpen((v) => !v);
        }}
        notificationUnreadCount={notificationUnreadCount}
        onHeaderSupportClick={() => toast.message("Support — link help desk or docs here.")}
        onHeaderSettingsClick={() => toast.message("Settings — open org or profile settings from the sidebar.")}
      >
        <Suspense
          fallback={
            <div className="w-full py-3 text-sm text-muted-foreground">
              <Loader label="Loading section..." size="sm" />
            </div>
          }
        >
          {profileLoading ? (
            <div className="flex min-h-[70vh] w-full items-center justify-center text-sm text-muted-foreground">
              <Loader label="Loading tenant..." size="sm" />
            </div>
          ) : profileError ? (
            <div className="max-w-2xl text-sm">
              <div className="text-red-300">{profileError}</div>
            </div>
          ) : !activeOrgId ? (
            <div className="max-w-2xl text-sm text-muted-foreground">
              No tenant selected.
            </div>
          ) : noAccessAssigned ? (
            <div className="flex min-h-[70vh] w-full items-center justify-center px-4">
              <div className="w-full max-w-xl rounded-xl border border-black/10 bg-background/90 p-6 text-center shadow-sm dark:border-white/10">
                <h2 className="text-xl font-semibold">You don&apos;t have access</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your account is currently not assigned to a role. Please contact your administrator.
                </p>
              </div>
            </div>
          ) : (
            <>
              {renderSystemAdminShellRoutes ? (
                <>
                {activeNav === "sys_dashboard" ? (
                  <SystemOverviewDashboardPage
                    orgId={activeOrgId}
                    refreshSeconds={dashboardRefreshSeconds}
                    onRefreshSecondsChange={(seconds) => {
                      if (seconds !== 10 && seconds !== 60) return;
                      setDashboardRefreshSeconds(seconds);
                    }}
                    onNavigateToOrganizations={() => setActiveNav("partner_setup")}
                  />
                ) : null}
                {activeNav === "sys_tickets" ? <SystemTicketsPage /> : null}
                {activeNav === "sys_agents" ? <AgentsPage orgId={activeOrgId} /> : null}
                {activeNav === "workspace_module_c" ? (
                  <NavPlaceholder
                    title="Reports"
                    description="Executive-level KPI summaries, system-wide SLA compliance, and agent scorecards."
                  />
                ) : null}
                {/* {activeNav === "resolve_setup" ? <ResolveSetupPage orgId={activeOrgId} /> : null} */}
                {activeNav === "partner_setup" ? (
                  <OrganizationsPage orgId={activeOrgId} onOrgChange={setActiveOrgId} />
                ) : null}
                {activeNav === "users_roles" ? <UsersRolesPage orgId={activeOrgId} /> : null}
                {activeNav === "roles_management" ? <RolesPage /> : null}
                {activeNav === "teams_queues" ? <TeamsQueuesPage orgId={activeOrgId} /> : null}
                {activeNav === "routing_rules" ? <RoutingRulesPage orgId={activeOrgId} /> : null}
                {activeNav === "priority_master" ? (
                  <PriorityMasterPage orgId={activeOrgId} organizationName={profile?.organization_name} />
                ) : null}
                {activeNav === "keyword_routing" ? <KeywordsRoutingPage orgId={activeOrgId} /> : null}
                {activeNav === "sla_policies" ? (
                  <SlaPoliciesPage orgId={activeOrgId} organizationName={profile?.organization_name} />
                ) : null}
                {activeNav === "notification_templates" ? (
                  <NotificationTemplatesPage orgId={activeOrgId} />
                ) : null}
                {activeNav === "canned_responses" ? <CannedResponsesPage orgId={activeOrgId} /> : null}
                {activeNav === "custom_fields" ? <CustomFieldsPage orgId={activeOrgId} /> : null}
                {activeNav === "api_webhooks" ? <ApiWebhooksPage orgId={activeOrgId} /> : null}
                {activeNav === "audit_log" ? <AdminAuditLogPage orgId={activeOrgId} /> : null}
              </>
            ) : (
              <>
                {isWorkspaceDashboardNav(activeNav) ? (
                  <TeamDashboardPage
                    role={shellRoleKind}
                    viewMode={dashboardViewMode}
                    dashboardNavKey={activeNav}
                    orgId={activeOrgId}
                    refreshSeconds={dashboardRefreshSeconds}
                    onRefreshSecondsChange={(seconds) => {
                      if (seconds !== 10 && seconds !== 60) return;
                      if (seconds === 10 && dashboardViewMode !== "team") return;
                      setDashboardRefreshSeconds(seconds);
                    }}
                    onNavigateToTickets={
                      canOpenTicketList || canOpenMyTickets ? goToDashboardTicketsDestination : undefined
                    }
                    onNavigateToCreateTicket={
                      canOpenRaiseTicket ? () => setActiveNav("cust_raise_ticket") : undefined
                    }
                  />
                ) : null}
                {activeNav === "users_roles" && canOpenOrgUsersRoles ? (
                  <UsersRolesPage orgId={activeOrgId} />
                ) : null}
                {activeNav === "org_tickets" && canOpenTicketList ? (
                  <MyTicketsPage title="Organisation Tickets" focusTicketId={focusedTicketId} />
                ) : null}
                {activeNav === "sys_agents" && canOpenAgentsScreen ? <AgentsPage orgId={activeOrgId} /> : null}
                {activeNav === "org_notification_settings" ? (
                  <NavPlaceholder
                    title="Notification settings"
                    description="Organization-level notification rules."
                  />
                ) : null}
                {activeNav === "org_profile" ? (
                  <NavPlaceholder
                    title="Org profile"
                    description="Optional organization profile and baseline settings."
                  />
                ) : null}
                {activeNav === "agent_my_tickets" && canOpenMyTickets ? (
                  <MyTicketsPage title="Agent My Tickets" focusTicketId={focusedTicketId} />
                ) : null}
                {activeNav === "agent_team_queue" ? (
                  <AgentTeamQueuePage />
                ) : null}
                {activeNav === "agent_history" ? (
                  <AgentHistoryPage />
                ) : null}
                {activeNav === "cust_my_tickets" && canOpenMyTickets ? (
                  <MyTicketsPage title="My Tickets" focusTicketId={focusedTicketId} />
                ) : null}
                {activeNav === "cust_raise_ticket" && canOpenRaiseTicket ? (
                  <RaiseTicketPage onCreated={goToPostCreateTicketDestination} />
                ) : null}
                {activeNav === "cust_guides" ? (
                  <NavPlaceholder
                    title="Guides"
                    description="Knowledge base, user manuals, and FAQs."
                  />
                ) : null}
                {activeNav === "workspace_module_c" ? (
                  <NavPlaceholder
                    title="Reports"
                    description={
                      canOpenTicketList
                        ? "Weekly and monthly summaries of org-specific support activity and compliance."
                        : "Personal performance metrics, MTTR trends, and individual scorecard."
                    }
                  />
                ) : null}
                </>
              )}
            </>
          )}
        </Suspense>
      </AppShell>

      <CreateTicketDrawer
        open={createTicketDrawerOpen}
        onClose={() => setCreateTicketDrawerOpen(false)}
        onCreated={() => {
          setCreateTicketDrawerOpen(false);
          goToPostCreateTicketDestination();
        }}
      />

      {notificationsOpen ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setNotificationsOpen(false)}
          />
          <div className="fixed right-6 top-[4.75rem] z-50 w-[420px] max-w-[94vw] overflow-hidden rounded-2xl border border-black/10 bg-background/95 shadow-xl backdrop-blur-xl dark:border-white/10">
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
              <div className="text-sm font-semibold">Notifications</div>
              <button
                type="button"
                onClick={() => void onReadAllNotifications()}
                disabled={notificationUnreadCount === 0}
                className="text-xs font-semibold text-[#1E88E5] disabled:opacity-50"
              >
                Read All
              </button>
            </div>
            <div className="flex items-center gap-2 border-b border-black/10 px-4 py-2 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  setNotificationTab("unread");
                }}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  notificationTab === "unread" ? "bg-[#1E88E5] text-white" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                Unread
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotificationTab("read");
                }}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  notificationTab === "read" ? "bg-[#1E88E5] text-white" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                Read
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {notificationsLoading ? (
                <div className="p-4 text-xs text-muted-foreground">Loading notifications...</div>
              ) : notificationItems.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">No notifications from the last 30 days.</div>
              ) : (
                notificationItems.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void onNotificationClick(n)}
                    className="mb-1 w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-left hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                  >
                    <div className="text-xs font-semibold text-[#111827] dark:text-slate-100">{n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">{n.message}</div>
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </ThemeProvider>
  );
}
