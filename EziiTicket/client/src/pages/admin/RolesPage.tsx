import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { toast } from "sonner";
import {
  createRole,
  deleteRole,
  getExternalOrganizations,
  getExternalOrgAttributeSubAttributes,
  getExternalOrgAttributes,
  getExternalOrgWorkerTypes,
  listOrganisationUserDirectory,
  listRoles,
  listUserRoles,
  updateRole,
  type ApplyRoleTo,
  type ExternalOrganization,
  type Role,
} from "@api/adminApi";
import { useAuthStore } from "@store/useAuthStore";
import { EZII_BRAND } from "@/lib/eziiBrand";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

type RolePermissions = {
  ticket_access?: string;
  assign_scope?: string;
  can_assign?: boolean;
  can_resolve?: boolean;
  tier1_sla_config?: "none" | "view" | "edit";
  tier2_sla_config?: "none" | "view" | "edit";
  screen_access?: Record<string, { view: boolean; modify: boolean }>;
};

type DraftState = {
  name: string;
  description: string;
  permissions: RolePermissions;
  apply_role_to: ApplyRoleTo;
  apply_attribute_id: string;
  apply_sub_attribute_id: string;
  apply_worker_type_id: number | null;
};

// Scaffold types for upcoming "Designation + Access Profile" mapping UI.
export type UserAccessMappingDraft = {
  user_id: number;
  designation_id: number | null;
  access_role_ids: number[];
  overrides: Array<{
    permission_key: string;
    effect: "allow" | "deny";
    reason?: string;
    expires_at?: string | null;
  }>;
};

function permissionsSafe(p: Role["permissions_json"]): RolePermissions {
  if (!p || typeof p !== "object") return {};
  return p as RolePermissions;
}

/** Matches `getEtsSidebarItemsForRole("agent")` nav (Team/Agent workspace). */
const TEAM_AGENT_ROLE_ACCESS_SCREENS = [
  { key: "agent_dashboard", label: "Team Dashboard" },
  { key: "agent_my_tickets", label: "My Tickets" },
  { key: "agent_team_queue", label: "Team Queue" },
  { key: "agent_history", label: "Resolved / History" },
  { key: "agent_reports", label: "Reports" },
] as const;

const ROLE_ACCESS_SCREENS = [
  { key: "dashboard", label: "Organisation dashboard (agent / org; not system overview)" },
  { key: "tickets", label: "Team / org ticket list" },
  { key: "users", label: "Users" },
  { key: "roles_permissions", label: "Roles & Permissions" },
  { key: "teams_queues", label: "Teams & Queues" },
  { key: "routing_rules", label: "Routing Rules" },
  { key: "priority_master", label: "Priority Master" },
  { key: "keyword_routing", label: "Keyword trigger" },
  { key: "sla_policies", label: "SLA Policies" },
  { key: "notification_templates", label: "Notification Templates" },
  { key: "canned_responses", label: "Canned Responses" },
  { key: "custom_fields", label: "Custom Fields" },
  { key: "api_tokens", label: "API Tokens" },
  { key: "webhooks", label: "Webhooks" },
  { key: "audit_logs", label: "Audit Logs" },
] as const;

const CUSTOMER_EXTRA_ROLE_ACCESS_SCREENS = [
  { key: "raise_a_ticket", label: "Raise a Ticket" },
  { key: "guides", label: "Guides" },
  { key: "my_tickets", label: "My Tickets (customer)" },
] as const;

const CUSTOMER_ROLE_ACCESS_SCREENS = [
  { key: "customer_dashboard", label: "Customer Dashboard" },
  ...CUSTOMER_EXTRA_ROLE_ACCESS_SCREENS,
] as const;

/** Old roles only stored team keys; seed customer screens from these if customer keys are absent (one-way, no mirroring). */
const LEGACY_TEAM_SCREEN_SEED_FOR_CUSTOMER: Record<string, string> = {
  dashboard: "customer_dashboard",
  tickets: "my_tickets",
};

const ALL_ROLE_ACCESS_SCREENS = [
  ...ROLE_ACCESS_SCREENS,
  ...TEAM_AGENT_ROLE_ACCESS_SCREENS,
  ...CUSTOMER_ROLE_ACCESS_SCREENS,
] as const;

const ROLE_ACCESS_SCREEN_GROUPS = [
  {
    key: "customer_end_user",
    title: "Customer",
    subtitle: "End User",
    screens: CUSTOMER_ROLE_ACCESS_SCREENS,
  },
  {
    key: "team_agent",
    title: "Team/Agent",
    subtitle: "Agent workspace",
    screens: TEAM_AGENT_ROLE_ACCESS_SCREENS,
  },
  {
    key: "admin_teams",
    title: "Admin",
    subtitle: "Admin Teams",
    screens: ROLE_ACCESS_SCREENS,
  },
] as const;

function defaultScreenAccess(allEnabled = false): Record<string, { view: boolean; modify: boolean }> {
  const out: Record<string, { view: boolean; modify: boolean }> = {};
  for (const screen of ALL_ROLE_ACCESS_SCREENS) {
    out[screen.key] = { view: allEnabled, modify: allEnabled };
  }
  return out;
}

/**
 * All registered screens view on, modify off (admin list + customer keys).
 * Org admin baseline uses this as-is.
 */
function defaultScreenAccessAllView(): Record<string, { view: boolean; modify: boolean }> {
  const out: Record<string, { view: boolean; modify: boolean }> = {};
  for (const screen of ALL_ROLE_ACCESS_SCREENS) {
    out[screen.key] = { view: true, modify: false };
  }
  return out;
}

/** Like `defaultScreenAccessAllView` but Team/Agent workspace screens are view + modify on (agent-tier baselines). */
function defaultScreenAccessAllViewAgentTier(): Record<string, { view: boolean; modify: boolean }> {
  const out = defaultScreenAccessAllView();
  for (const s of TEAM_AGENT_ROLE_ACCESS_SCREENS) {
    out[s.key] = { view: true, modify: true };
  }
  return out;
}

function defaultCustomerScreenAccessFull(): Record<string, { view: boolean; modify: boolean }> {
  const out = defaultScreenAccess(false);
  for (const screen of CUSTOMER_ROLE_ACCESS_SCREENS) {
    out[screen.key] = { view: true, modify: true };
  }
  return out;
}

function normalizeScreenAccess(
  screenAccess: RolePermissions["screen_access"],
  allEnabled = false
): Record<string, { view: boolean; modify: boolean }> {
  const defaults = defaultScreenAccess(allEnabled);
  if (!screenAccess || typeof screenAccess !== "object") return defaults;

  const normalized: Record<string, { view: boolean; modify: boolean }> = { ...defaults };
  const raw = screenAccess ?? {};
  for (const screen of ALL_ROLE_ACCESS_SCREENS) {
    const entry = raw[screen.key];
    const view = Boolean(entry?.view);
    const modify = Boolean(entry?.modify);
    normalized[screen.key] = {
      view: allEnabled ? true : view || modify,
      modify: allEnabled ? true : modify,
    };
  }
  for (const [legacyKey, customerKey] of Object.entries(LEGACY_TEAM_SCREEN_SEED_FOR_CUSTOMER)) {
    if (Object.prototype.hasOwnProperty.call(raw, customerKey)) continue;
    const legacyRaw = raw[legacyKey];
    if (!legacyRaw || typeof legacyRaw !== "object") continue;
    const view = Boolean(legacyRaw.view || legacyRaw.modify);
    const modify = Boolean(legacyRaw.modify);
    normalized[customerKey] = {
      view: allEnabled ? true : view,
      modify: allEnabled ? true : modify,
    };
  }
  return normalized;
}

function baselineRoleKey(name: string) {
  return normalizeRoleNameKey(name.replace(/_/g, " "));
}

/** Merge stored screen_access with known screens. System Admin defaults are editable like other roles (no forced all-on). */
function normalizePermissions(permissions: RolePermissions): RolePermissions {
  return {
    ...permissions,
    screen_access: normalizeScreenAccess(permissions.screen_access, false),
  };
}

function defaultPermissions(): RolePermissions {
  return {
    ticket_access: "own_tickets",
    assign_scope: "none",
    can_assign: false,
    can_resolve: false,
    tier1_sla_config: "none",
    tier2_sla_config: "none",
    screen_access: defaultScreenAccess(false),
  };
}

const DEFAULT_ROLE_BASELINES: Record<string, RolePermissions> = {
  customer: {
    ticket_access: "own_tickets",
    assign_scope: "none",
    can_assign: false,
    can_resolve: false,
    tier1_sla_config: "none",
    tier2_sla_config: "none",
    screen_access: defaultCustomerScreenAccessFull(),
  },
  "org admin": {
    ticket_access: "org_tickets",
    assign_scope: "none",
    can_assign: false,
    can_resolve: false,
    tier1_sla_config: "none",
    tier2_sla_config: "none",
    screen_access: defaultScreenAccessAllView(),
  },
  "l1 agent": {
    ticket_access: "assigned_queue",
    assign_scope: "self",
    can_assign: true,
    can_resolve: true,
    tier1_sla_config: "none",
    tier2_sla_config: "none",
    screen_access: defaultScreenAccessAllViewAgentTier(),
  },
  "l2 specialist": {
    ticket_access: "product_queue_escalated",
    assign_scope: "l2_queue",
    can_assign: true,
    can_resolve: true,
    tier1_sla_config: "none",
    tier2_sla_config: "none",
    screen_access: defaultScreenAccessAllViewAgentTier(),
  },
  "l3 engineer": {
    ticket_access: "all_tickets",
    assign_scope: "any",
    can_assign: true,
    can_resolve: true,
    tier1_sla_config: "none",
    tier2_sla_config: "none",
    screen_access: defaultScreenAccessAllViewAgentTier(),
  },
  "team lead": {
    ticket_access: "all_tickets",
    assign_scope: "any",
    can_assign: true,
    can_resolve: true,
    tier1_sla_config: "view",
    tier2_sla_config: "view",
    screen_access: defaultScreenAccessAllViewAgentTier(),
  },
  "system admin": {
    ticket_access: "all_tickets",
    assign_scope: "any",
    can_assign: true,
    can_resolve: true,
    tier1_sla_config: "edit",
    tier2_sla_config: "edit",
    screen_access: defaultScreenAccess(true),
  },
};

function normalizeRoleNameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getBaselineForRole(name: string) {
  return DEFAULT_ROLE_BASELINES[baselineRoleKey(name)] ?? null;
}

function mergePermissionsWithBaseline(roleName: string, current: RolePermissions): RolePermissions {
  const baseline = getBaselineForRole(roleName);
  if (!baseline) return current;
  const baselineScreenAccess = normalizeScreenAccess(baseline.screen_access, false);
  const currentScreenAccess = normalizeScreenAccess(current.screen_access, false);
  return {
    ...baseline,
    ...current,
    screen_access: {
      ...baselineScreenAccess,
      ...currentScreenAccess,
    },
  };
}

function ticketAccessLabel(v: string | undefined) {
  if (v === "own_tickets") return "Own tickets only";
  if (v === "org_tickets") return "Own organization";
  if (v === "assigned_queue") return "Assigned queue";
  if (v === "product_queue_escalated") return "Product queue + escalated";
  if (v === "all_tickets") return "All tickets";
  return "Own tickets only";
}

function assignScopeLabel(v: string | undefined) {
  if (v === "none") return "No";
  if (v === "self") return "Self";
  if (v === "l2_queue") return "L2 queue";
  if (v === "any") return "Any";
  return "No";
}

function slaLabel(v: RolePermissions["tier1_sla_config"] | RolePermissions["tier2_sla_config"]) {
  if (v === "view") return "View only";
  if (v === "edit") return "Edit";
  return "No access";
}

function roleOrgId(role: Role): number | null {
  const raw =
    (role as Role & { organisation_id?: unknown }).organisation_id ??
    (role as Role & { organization_id?: unknown }).organization_id ??
    (role as Role & { org_id?: unknown }).org_id ??
    (role as Role & { scope_organisation_id?: unknown }).scope_organisation_id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function permissionsSummary(p: RolePermissions) {
  const screenAccess = normalizeScreenAccess(p.screen_access, false);
  const viewCount = Object.values(screenAccess).filter((entry) => entry.view).length;
  const modifyCount = Object.values(screenAccess).filter((entry) => entry.modify).length;
  return `${ticketAccessLabel(p.ticket_access)} • Assign: ${assignScopeLabel(
    p.assign_scope
  )} • Resolve: ${p.can_resolve ? "Yes" : "No"} • T1: ${slaLabel(
    p.tier1_sla_config
  )} • T2: ${slaLabel(p.tier2_sla_config)} • Screens V:${viewCount} M:${modifyCount}`;
}

function screenAccessDataRow(p: RolePermissions) {
  const screenAccess = normalizeScreenAccess(p.screen_access, false);
  const n = ROLE_ACCESS_SCREENS.length;
  const viewCount = Object.values(screenAccess).filter((entry) => entry.view).length;
  const modifyCount = Object.values(screenAccess).filter((entry) => entry.modify).length;
  return `View ${viewCount}/${n} · Modify ${modifyCount}/${n}`;
}

function applyFieldsFromRole(role: Role | null): Pick<
  DraftState,
  "apply_role_to" | "apply_attribute_id" | "apply_sub_attribute_id" | "apply_worker_type_id"
> {
  return {
    apply_role_to: (role?.apply_role_to as ApplyRoleTo) ?? "all",
    apply_attribute_id: role?.apply_attribute_id ?? "",
    apply_sub_attribute_id: role?.apply_sub_attribute_id ?? "",
    apply_worker_type_id: role?.apply_worker_type_id ?? null,
  };
}

export function RolesPage() {
  const authUser = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedOrgFilter, setSelectedOrgFilter] = useState("all");
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [externalOrgsLoading, setExternalOrgsLoading] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [yourRoleName, setYourRoleName] = useState<string | null>(null);
  const [extAttributes, setExtAttributes] = useState<Array<{ attribute_id: string; attribute: string }>>([]);
  const [extSubAttributes, setExtSubAttributes] = useState<Array<{ attribute_sub_id: string; attribute_sub: string }>>(
    []
  );
  const [extWorkerTypes, setExtWorkerTypes] = useState<Array<{ id: number; customer_worker_type: string }>>([]);

  const selectedRole = useMemo(
    () => (selectedRoleId == null ? null : roles.find((r) => r.id === selectedRoleId) ?? null),
    [selectedRoleId, roles]
  );

  const defaultRoles = useMemo(() => roles.filter((r) => r.is_default), [roles]);
  const customRoles = useMemo(() => roles.filter((r) => !r.is_default), [roles]);
  const filteredCustomRoles = useMemo(() => {
    if (selectedOrgFilter === "all") return customRoles;
    const selectedOrgId = Number(selectedOrgFilter);
    if (!Number.isFinite(selectedOrgId)) return customRoles;
    return customRoles.filter((r) => roleOrgId(r) === selectedOrgId);
  }, [customRoles, selectedOrgFilter]);

  async function refresh(organisationFilter: string = selectedOrgFilter) {
    setLoading(true);
    setError(null);
    try {
      const orgId =
        organisationFilter !== "all" && Number.isFinite(Number(organisationFilter))
          ? Number(organisationFilter)
          : undefined;
      const all = await listRoles(orgId);
      setRoles(all);
      if (!selectedRoleId && all.length) {
        setSelectedRoleId(all[0]!.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(selectedOrgFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgFilter]);

  useEffect(() => {
    if (!roleModalOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const [wt, attr] = await Promise.all([getExternalOrgWorkerTypes(), getExternalOrgAttributes()]);
        if (cancelled) return;
        const wlist =
          (wt as { worker_type_list?: { id: number; customer_worker_type: string }[] })?.worker_type_list ?? [];
        const alist = (attr as { attributes?: { attribute_id: string; attribute: string }[] })?.attributes ?? [];
        setExtWorkerTypes(wlist);
        setExtAttributes(alist);
      } catch {
        if (!cancelled) {
          setExtWorkerTypes([]);
          setExtAttributes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roleModalOpen]);

  useEffect(() => {
    if (!roleModalOpen || !draft || draft.apply_role_to !== "sub_attribute" || !draft.apply_attribute_id) {
      setExtSubAttributes([]);
      return;
    }
    let cancelled = false;
    void getExternalOrgAttributeSubAttributes(draft.apply_attribute_id)
      .then((raw) => {
        if (cancelled) return;
        const list =
          (raw as { sub_attributes?: { attribute_sub_id: string; attribute_sub: string }[] })?.sub_attributes ?? [];
        setExtSubAttributes(list);
      })
      .catch(() => {
        if (!cancelled) setExtSubAttributes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [roleModalOpen, draft?.apply_role_to, draft?.apply_attribute_id]);

  useEffect(() => {
    let cancelled = false;
    setExternalOrgsLoading(true);
    void getExternalOrganizations()
      .then((list) => {
        if (!cancelled) setExternalOrgs(list);
      })
      .catch(() => {
        if (!cancelled) setExternalOrgs([]);
      })
      .finally(() => {
        if (!cancelled) setExternalOrgsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const authUserId = Number(authUser?.user_id);
    const authOrgId = Number(authUser?.org_id);
    if (!Number.isFinite(authUserId) || !Number.isFinite(authOrgId)) {
      setYourRoleName(null);
      return;
    }

    const targetOrgId =
      selectedOrgFilter !== "all" && Number.isFinite(Number(selectedOrgFilter))
        ? Number(selectedOrgFilter)
        : authOrgId;

    let cancelled = false;
    void (async () => {
      try {
        const [roleRows, directory] = await Promise.all([
          listUserRoles(authUserId),
          listOrganisationUserDirectory(targetOrgId, true).catch(() => ({ users: [], has_local_users: true })),
        ]);
        if (cancelled) return;

        const fromDirectory =
          directory.users.find((u) => Number(u.user_id) === authUserId)?.ticket_role?.trim() ?? null;
        const scoped = roleRows.find((r) => Number(r.scope_organisation_id) === targetOrgId);
        const global = roleRows.find((r) => r.scope_organisation_id == null);
        const fromUserRoles = scoped?.role_name?.trim() ?? global?.role_name?.trim() ?? null;

        setYourRoleName(fromDirectory || fromUserRoles || null);
      } catch {
        if (!cancelled) setYourRoleName(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser?.org_id, authUser?.user_id, selectedOrgFilter]);

  function startEdit(role: Role) {
    const current = permissionsSafe(role.permissions_json);
    setCreating(false);
    setSelectedRoleId(role.id);
    setDraft({
      name: role.name,
      description: role.description ?? "",
      permissions: normalizePermissions(mergePermissionsWithBaseline(role.name, current)),
      ...applyFieldsFromRole(role),
    });
    setRoleModalOpen(true);
  }

  function startCreate() {
    setCreating(true);
    setSelectedRoleId(null);
    setDraft({
      name: "",
      description: "",
      permissions: normalizePermissions(defaultPermissions()),
      ...applyFieldsFromRole(null),
    });
    setRoleModalOpen(true);
  }

  function resetChanges() {
    if (creating) {
      setDraft({
        name: "",
        description: "",
        permissions: normalizePermissions(defaultPermissions()),
        ...applyFieldsFromRole(null),
      });
      return;
    }
    if (!selectedRole) return;
    setDraft({
      name: selectedRole.name,
      description: selectedRole.description ?? "",
      permissions: normalizePermissions(
        mergePermissionsWithBaseline(selectedRole.name, permissionsSafe(selectedRole.permissions_json))
      ),
      ...applyFieldsFromRole(selectedRole),
    });
  }

  function ensureDraft() {
    if (draft) return draft;
    if (creating) {
      const d: DraftState = {
        name: "",
        description: "",
        permissions: normalizePermissions(defaultPermissions()),
        ...applyFieldsFromRole(null),
      };
      setDraft(d);
      return d;
    }
    if (selectedRole) {
      const d: DraftState = {
        name: selectedRole.name,
        description: selectedRole.description ?? "",
        permissions: normalizePermissions(
          mergePermissionsWithBaseline(selectedRole.name, permissionsSafe(selectedRole.permissions_json))
        ),
        ...applyFieldsFromRole(selectedRole),
      };
      setDraft(d);
      return d;
    }
    return null;
  }

  async function handleSave() {
    const currentDraft = ensureDraft();
    if (!currentDraft) return;

    const name = currentDraft.name.trim();
    if (!name) {
      toast.error("Role name is required");
      return;
    }

    const normalizedPermissions = normalizePermissions(currentDraft.permissions);

    setSaving(true);
    try {
      if (creating) {
        const selectedOrgId =
          selectedOrgFilter !== "all" && Number.isFinite(Number(selectedOrgFilter))
            ? Number(selectedOrgFilter)
            : null;
        if (!selectedOrgId) {
          toast.error("Select an organization before creating a custom role.");
          setSaving(false);
          return;
        }
        await createRole({
          name,
          organisation_id: selectedOrgId,
          description: currentDraft.description.trim() || null,
          permissions_json: normalizedPermissions,
          apply_role_to: currentDraft.apply_role_to,
          apply_attribute_id: currentDraft.apply_attribute_id.trim() || null,
          apply_sub_attribute_id: currentDraft.apply_sub_attribute_id.trim() || null,
          apply_worker_type_id: currentDraft.apply_worker_type_id,
        });
        toast.success("Role created");
      } else if (selectedRole) {
        await updateRole(selectedRole.id, {
          name: selectedRole.is_default ? undefined : name,
          description: currentDraft.description.trim() || null,
          permissions_json: normalizedPermissions,
          apply_role_to: currentDraft.apply_role_to,
          apply_attribute_id: currentDraft.apply_attribute_id.trim() || null,
          apply_sub_attribute_id: currentDraft.apply_sub_attribute_id.trim() || null,
          apply_worker_type_id: currentDraft.apply_worker_type_id,
        });
        toast.success("Role updated");
      }
      await refresh();
      setCreating(false);
      setDraft(null);
      setRoleModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: Role) {
    if (role.is_default) return;
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try {
      await deleteRole(role.id);
      toast.success("Role deleted");
      if (selectedRoleId === role.id) {
        setSelectedRoleId(null);
        setDraft(null);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete role");
    }
  }

  const effectiveRole = creating ? null : selectedRole;
  const effectiveDraft = draft;
  const p = normalizePermissions(effectiveDraft?.permissions ?? defaultPermissions());

  const roleIntegrityPct = 99.2;
  const isRootSystemAdminUser = Number(authUser?.user_id) === 1;
  const yourRoleKey = isRootSystemAdminUser
    ? baselineRoleKey("system_admin")
    : yourRoleName
      ? baselineRoleKey(yourRoleName)
      : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-tight text-[#0f172a] dark:text-foreground">
            Roles & Permissions
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-600 dark:text-muted-foreground">
            Configure access control models for the entire ecosystem. Manage global templates and organization-specific
            overrides.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white/75 px-4 py-3 text-right shadow-sm dark:border-white/10 dark:bg-white/10">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            System Integrity
          </div>
          <div className="text-xl font-bold text-[#16A34A]">{roleIntegrityPct}%</div>
        </div>
      </div>

      {loading ? (
        <GlassCard className="p-6">
          <Loader label="Loading roles..." size="sm" className="min-h-[30vh]" />
        </GlassCard>
      ) : error ? (
        <GlassCard className="p-6">
          <div className="text-sm text-red-600">{error}</div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          <div className="space-y-4">
            <GlassCard className="border-black/10 bg-white/35 p-4 dark:border-white/10 dark:bg-white/[0.06]">
              <div className="mb-2 text-base font-bold text-[#374151] dark:text-slate-200">GLOBAL DEFAULT ROLES</div>
              <div className="space-y-3">
                {defaultRoles.map((r) => {
                  const rp = permissionsSafe(r.permissions_json);
                  const active = !creating && selectedRoleId === r.id;
                  const isYourRole = yourRoleKey != null && baselineRoleKey(r.name) === yourRoleKey;
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "rounded-xl border p-3 transition-colors",
                        active
                          ? "border-[#1E88E5]/55 bg-[#1E88E5]/8"
                          : "border-black/10 bg-white/55 dark:border-white/10 dark:bg-white/5"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-base leading-tight text-[#111827] dark:text-slate-100">
                            {r.name}
                            {isYourRole ? (
                              <span className="rounded-full bg-[#16A34A]/15 px-2 py-0.5 text-[10px] font-bold text-[#16A34A]">
                                Your Role
                              </span>
                            ) : null}
                            <span className="rounded-full bg-[#1E88E5]/15 px-2 py-0.5 text-[10px] font-bold text-[#1E88E5]">
                              Default
                            </span>
                          </div>
                          <div className="mt-1 text-xs italic text-slate-600 dark:text-slate-300">
                            {permissionsSummary(rp)}
                          </div>
                          <div className="mt-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                            <span className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Screen access
                            </span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            {screenAccessDataRow(rp)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="rounded-md bg-black/5 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-black/10 dark:bg-white/10 dark:text-slate-200"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            <GlassCard className="border-black/10 bg-white/35 p-4 dark:border-white/10 dark:bg-white/[0.06]">
              <div className="mb-3 text-base font-bold text-[#374151] dark:text-slate-200">ORGANIZATION CUSTOM ROLES</div>
              <div className="mb-3 flex items-center gap-2">
                <select
                  value={selectedOrgFilter}
                  onChange={(e) => setSelectedOrgFilter(e.target.value)}
                  className="flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                  disabled={externalOrgsLoading}
                >
                  <option value="all">Ezii HQ</option>
                  {externalOrgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.organization_name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={startCreate}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  style={{ backgroundColor: EZII_BRAND.primary }}
                >
                  + Create Custom
                </button>
              </div>
              <div className="space-y-2">
                {filteredCustomRoles.map((r) => {
                  const active = !creating && selectedRoleId === r.id;
                  const isYourRole = yourRoleKey != null && baselineRoleKey(r.name) === yourRoleKey;
                  const orgId = roleOrgId(r);
                  const orgName =
                    orgId == null
                      ? null
                      : externalOrgs.find((o) => Number(o.id) === orgId)?.organization_name ??
                        `Org ${orgId}`;
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "rounded-xl border p-3",
                        active
                          ? "border-[#1E88E5]/55 bg-[#1E88E5]/8"
                          : "border-black/10 bg-white/55 dark:border-white/10 dark:bg-white/5"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-[#111827] dark:text-slate-100">
                            {r.name}
                          </div>
                          {isYourRole ? (
                            <div className="mt-1">
                              <span className="rounded-full bg-[#16A34A]/15 px-2 py-0.5 text-[10px] font-bold text-[#16A34A]">
                                Your Role
                              </span>
                            </div>
                          ) : null}
                          {orgName ? (
                            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#1E88E5]">
                              {orgName}
                            </div>
                          ) : null}
                          <div className="mt-1 truncate text-xs italic text-slate-600 dark:text-slate-300">
                            {permissionsSummary(permissionsSafe(r.permissions_json))}
                          </div>
                          <div className="mt-1.5 truncate text-[11px] text-slate-700 dark:text-slate-200">
                            <span className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Screen access
                            </span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            {screenAccessDataRow(permissionsSafe(r.permissions_json))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            className="rounded-md bg-black/5 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-black/10 dark:bg-white/10 dark:text-slate-200"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(r)}
                            className="rounded-md border border-red-300/80 px-2 py-1 text-xs font-semibold text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!filteredCustomRoles.length ? (
                  <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-3 py-4 text-xs text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
                    No custom roles found for the selected organization.
                  </div>
                ) : null}
              </div>
            </GlassCard>
          </div>

        </div>
      )}

      {roleModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/10 dark:bg-zinc-950/90">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
              <div>
                <h2 className="text-xl font-bold leading-tight text-[#111827] dark:text-slate-100">
                  {creating ? "Create Custom Role" : `Edit Role: ${effectiveRole?.name ?? "Select role"}`}
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {creating
                    ? "Create an organization-level custom template."
                    : "Global system template for technical escalation teams."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetChanges}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  Reset Changes
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !effectiveDraft}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: EZII_BRAND.primary }}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="rounded-lg p-2 text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {effectiveDraft ? (
              <div className="space-y-5 overflow-y-auto p-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Role Name</span>
                    <input
                      value={effectiveDraft.name}
                      onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                      disabled={Boolean(effectiveRole?.is_default)}
                      className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10 disabled:opacity-60"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</span>
                    <input
                      value={effectiveDraft.description}
                      onChange={(e) => setDraft((d) => (d ? { ...d, description: e.target.value } : d))}
                      className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                    />
                  </label>
                </div>

                <div className="rounded-xl border border-black/10 bg-white/45 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#334155] dark:text-slate-200">
                    Apply role to (ticket API scope)
                  </div>
                  <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                    Restricts which tickets this role&apos;s permissions apply to (server-enforced on list/get/update).
                    Populate ticket <code className="text-[10px]">metadata_json</code> with{" "}
                    <code className="text-[10px]">attribute_id</code> / <code className="text-[10px]">attribute_sub_id</code>{" "}
                    or <code className="text-[10px]">reporting_manager_user_id</code> as needed.
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Apply to</span>
                      <select
                        value={effectiveDraft.apply_role_to}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  apply_role_to: e.target.value as ApplyRoleTo,
                                  apply_attribute_id:
                                    e.target.value === "attribute" || e.target.value === "sub_attribute"
                                      ? d.apply_attribute_id
                                      : "",
                                  apply_sub_attribute_id: e.target.value === "sub_attribute" ? d.apply_sub_attribute_id : "",
                                  apply_worker_type_id:
                                    e.target.value === "reportees" ? d.apply_worker_type_id : null,
                                }
                              : d
                          )
                        }
                        className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                      >
                        <option value="all">All</option>
                        <option value="reportees">Reportees</option>
                        <option value="attribute">Attribute</option>
                        <option value="sub_attribute">Sub-attribute</option>
                      </select>
                    </label>
                    {effectiveDraft.apply_role_to === "reportees" ? (
                      <label className="grid gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Worker type (optional)</span>
                        <select
                          value={effectiveDraft.apply_worker_type_id ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    apply_worker_type_id: v === "" ? null : Number(v),
                                  }
                                : d
                            );
                          }}
                          className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                        >
                          <option value="">Select…</option>
                          {extWorkerTypes.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.customer_worker_type}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {(effectiveDraft.apply_role_to === "attribute" ||
                      effectiveDraft.apply_role_to === "sub_attribute") && (
                      <label className="grid gap-1 md:col-span-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Attribute</span>
                        <select
                          value={effectiveDraft.apply_attribute_id}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? { ...d, apply_attribute_id: e.target.value, apply_sub_attribute_id: "" }
                                : d
                            )
                          }
                          className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                        >
                          <option value="">Select attribute…</option>
                          {extAttributes.map((a) => (
                            <option key={a.attribute_id} value={a.attribute_id}>
                              {a.attribute}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {effectiveDraft.apply_role_to === "sub_attribute" && effectiveDraft.apply_attribute_id ? (
                      <label className="grid gap-1 md:col-span-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Sub-attribute</span>
                        <select
                          value={effectiveDraft.apply_sub_attribute_id}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, apply_sub_attribute_id: e.target.value } : d))
                          }
                          className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                        >
                          <option value="">Select sub-attribute…</option>
                          {extSubAttributes.map((s) => (
                            <option key={s.attribute_sub_id} value={s.attribute_sub_id}>
                              {s.attribute_sub}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-white/45 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-wide text-[#334155] dark:text-slate-200">
                      Default Permission Matrix
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const baseline = getBaselineForRole(effectiveDraft.name);
                        if (!baseline) return;
                        setDraft((d) =>
                          d ? { ...d, permissions: normalizePermissions(baseline) } : d
                        );
                      }}
                      className="rounded-md px-3 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: EZII_BRAND.primary }}
                    >
                      Apply Baseline
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Ticket Access</span>
                      <select
                        value={p.ticket_access ?? "own_tickets"}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? { ...d, permissions: { ...d.permissions, ticket_access: e.target.value } }
                              : d
                          )
                        }
                        className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                      >
                        <option value="own_tickets">Own tickets only</option>
                        <option value="org_tickets">Own organization</option>
                        <option value="assigned_queue">Assigned queue</option>
                        <option value="product_queue_escalated">Product queue + escalated</option>
                        <option value="all_tickets">All tickets</option>
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Can Assign?</span>
                      <select
                        value={p.assign_scope ?? "none"}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  permissions: {
                                    ...d.permissions,
                                    assign_scope: e.target.value,
                                    can_assign: e.target.value !== "none",
                                  },
                                }
                              : d
                          )
                        }
                        className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                      >
                        <option value="none">No</option>
                        <option value="self">Self</option>
                        <option value="l2_queue">L2 queue</option>
                        <option value="any">Any</option>
                      </select>
                    </label>

                    <label className="flex items-center gap-2 rounded-lg border border-black/10 bg-white/75 px-3 py-2 dark:border-white/10 dark:bg-white/10">
                      <input
                        type="checkbox"
                        checked={Boolean(p.can_resolve)}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, permissions: { ...d.permissions, can_resolve: e.target.checked } } : d
                          )
                        }
                        className="h-5 w-5 accent-[#1E88E5]"
                      />
                      <span className="text-xs font-medium">Can Resolve?</span>
                    </label>

                    <div className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 dark:border-white/10 dark:bg-white/10">
                      <div className="text-xs text-slate-500">Resolve State</div>
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {p.can_resolve ? "Yes" : "No"}
                      </div>
                    </div>

                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Tier 1 SLA Config</span>
                      <select
                        value={p.tier1_sla_config ?? "none"}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  permissions: {
                                    ...d.permissions,
                                    tier1_sla_config: e.target.value as RolePermissions["tier1_sla_config"],
                                  },
                                }
                              : d
                          )
                        }
                        className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                      >
                        <option value="none">No access</option>
                        <option value="view">View only</option>
                        <option value="edit">Edit within permitted bounds</option>
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Tier 2 SLA Config</span>
                      <select
                        value={p.tier2_sla_config ?? "none"}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  permissions: {
                                    ...d.permissions,
                                    tier2_sla_config: e.target.value as RolePermissions["tier2_sla_config"],
                                  },
                                }
                              : d
                          )
                        }
                        className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                      >
                        <option value="none">No access</option>
                        <option value="view">View only</option>
                        <option value="edit">Edit (Ezii-only restricted panel)</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-white/45 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#334155] dark:text-slate-200">
                    Screen Wise Access
                  </div>
                  <div className="space-y-4">
                    {ROLE_ACCESS_SCREEN_GROUPS.map((group) => (
                      <div key={group.key} className="rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.05]">
                        <div className="mb-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                            {group.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{group.subtitle}</div>
                        </div>
                        <div className="space-y-2">
                          {group.screens.map((screen) => {
                            const entry = p.screen_access?.[screen.key] ?? { view: false, modify: false };
                            return (
                              <div
                                key={`${group.key}:${screen.key}`}
                                className="grid grid-cols-[minmax(0,1fr)_80px_80px] items-center gap-2 rounded-lg border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/10"
                              >
                                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                  {screen.label}
                                </div>
                                <label className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={entry.view}
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const currentAccess = normalizeScreenAccess(d.permissions.screen_access, false);
                                        const nextView = e.target.checked;
                                        currentAccess[screen.key] = {
                                          view: nextView,
                                          modify: nextView ? currentAccess[screen.key]?.modify ?? false : false,
                                        };
                                        return {
                                          ...d,
                                          permissions: { ...d.permissions, screen_access: currentAccess },
                                        };
                                      })
                                    }
                                    className="h-4 w-4 accent-[#1E88E5]"
                                  />
                                  View
                                </label>
                                <label className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={entry.modify}
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const currentAccess = normalizeScreenAccess(d.permissions.screen_access, false);
                                        const nextModify = e.target.checked;
                                        currentAccess[screen.key] = {
                                          view: nextModify ? true : currentAccess[screen.key]?.view ?? false,
                                          modify: nextModify,
                                        };
                                        return {
                                          ...d,
                                          permissions: { ...d.permissions, screen_access: currentAccess },
                                        };
                                      })
                                    }
                                    className="h-4 w-4 accent-[#1E88E5]"
                                  />
                                  Modify
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-xs text-muted-foreground">Select a role from the left panel to edit.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

