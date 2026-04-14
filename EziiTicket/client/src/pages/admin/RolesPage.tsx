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
import { Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";

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
  { key: "agent", label: "Agent" },
  { key: "tickets", label: "Org ticket list" },
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

function permissionCounts(p: RolePermissions) {
  const screenAccess = normalizeScreenAccess(p.screen_access, false);
  const menuCount = Object.values(screenAccess).filter((entry) => entry.view || entry.modify).length;
  const modifyCount = Object.values(screenAccess).filter((entry) => entry.modify).length;
  return { menuCount, modifyCount };
}

function formatRoleCreatedDate(role: Role) {
  const createdRaw = (role as Role & { created_at?: unknown }).created_at;
  if (typeof createdRaw !== "string" || !createdRaw.trim()) return "-";
  const dt = new Date(createdRaw);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
  const authOrgIdNum = Number(authUser?.org_id);
  const isSystemAdminUser =
    authUser?.role_name === "admin" &&
    authUser?.org_id === "1" &&
    authUser?.user_id === "1" &&
    authUser?.role_id === "1" &&
    authUser?.user_type_id === "1";
  const isOrgScopedAdmin = !isSystemAdminUser && Number.isFinite(authOrgIdNum) && authOrgIdNum > 0;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedOrgFilter, setSelectedOrgFilter] = useState("");
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
    if (!selectedOrgFilter) return customRoles;
    const selectedOrgId = Number(selectedOrgFilter);
    if (!Number.isFinite(selectedOrgId)) return customRoles;
    return customRoles.filter((r) => roleOrgId(r) === selectedOrgId);
  }, [customRoles, selectedOrgFilter]);

  async function refresh(organisationFilter: string = selectedOrgFilter) {
    setLoading(true);
    setError(null);
    try {
      const orgId =
        isOrgScopedAdmin
          ? Math.trunc(authOrgIdNum)
          : organisationFilter && Number.isFinite(Number(organisationFilter))
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
    if (isSystemAdminUser && !selectedOrgFilter) {
      setSelectedOrgFilter("1");
      return;
    }
    if (!isOrgScopedAdmin) return;
    const ownOrg = String(Math.trunc(authOrgIdNum));
    if (selectedOrgFilter !== ownOrg) {
      setSelectedOrgFilter(ownOrg);
    }
  }, [isSystemAdminUser, isOrgScopedAdmin, authOrgIdNum, selectedOrgFilter]);

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
  }, [roleModalOpen, draft, draft?.apply_role_to, draft?.apply_attribute_id]);

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
          isOrgScopedAdmin
            ? Math.trunc(authOrgIdNum)
            : selectedOrgFilter !== "all" && Number.isFinite(Number(selectedOrgFilter))
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

  const isRootSystemAdminUser = Number(authUser?.user_id) === 1;
  const yourRoleKey = isRootSystemAdminUser
    ? baselineRoleKey("system_admin")
    : yourRoleName
      ? baselineRoleKey(yourRoleName)
      : null;

  const allRows = useMemo(
    () => [...filteredCustomRoles, ...defaultRoles],
    [filteredCustomRoles, defaultRoles]
  );
  const orgFilterOptions = useMemo(() => {
    const scoped = externalOrgs.filter(
      (org) => !isOrgScopedAdmin || Number(org.id) === Math.trunc(authOrgIdNum)
    );
    if (!isSystemAdminUser) return scoped;
    const hasOrgOne = scoped.some((org) => Number(org.id) === 1);
    if (hasOrgOne) return scoped;
    return [{ id: "1", organization_name: "Resolve Biz Services Pvt Ltd" }, ...scoped];
  }, [externalOrgs, isOrgScopedAdmin, authOrgIdNum, isSystemAdminUser]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
        <div className="flex items-center gap-2 text-xl font-semibold text-[#111827] dark:text-slate-100">
            <ShieldCheck className="h-5 w-5 text-[#1E88E5]" aria-hidden />
            Role & Permissions Management
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">Manage user roles and permissions</p>
        </div>
        <div className="flex items-center justify-between">
          {!isOrgScopedAdmin ? (
            <div className="w-full max-w-[280px]">
              <p className="text-sm text-slate-600 dark:text-muted-foreground">Select Organization</p>
              <select
                value={selectedOrgFilter}
                onChange={(e) => setSelectedOrgFilter(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                disabled={externalOrgsLoading}
              >
                {orgFilterOptions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {Number(org.id) === 1 && isSystemAdminUser
                      ? "Resolve Biz Services Pvt Ltd"
                      : org.organization_name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: EZII_BRAND.primary }}
        >
          <Plus className="h-4 w-4" />
          Create Role
        </button>
      </div>

      <GlassCard className="overflow-hidden rounded-2xl border border-black/10 bg-white/90 p-0 dark:border-white/10 dark:bg-white/[0.04]">
      
        {loading ? (
          <div className="p-6">
            <Loader label="Loading roles..." size="sm" className="min-h-[30vh]" />
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="text-sm text-red-600">{error}</div>
          </div>
        ) : (
          <div className="overflow-x-auto px-3 py-2">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  <th className="px-3 py-2">Role Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Permissions</th>
                  <th className="px-3 py-2">Created By</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {allRows.map((role) => {
                  const rp = permissionsSafe(role.permissions_json);
                  const counts = permissionCounts(rp);
                  const isYourRole = yourRoleKey != null && baselineRoleKey(role.name) === yourRoleKey;
                  return (
                    <tr
                      key={role.id}
                      className="bg-transparent text-[#1f2937] transition-colors hover:bg-slate-50/80 dark:text-slate-100 dark:hover:bg-white/[0.04]"
                    >
                      <td className="px-3 py-3 font-semibold">
                        <div className="flex items-center gap-2">
                          <span>{role.name}</span>
                          {isYourRole ? (
                            <span className="rounded-full bg-[#16A34A]/15 px-2 py-0.5 text-[10px] font-bold text-[#16A34A]">
                              You
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-[11px] font-semibold",
                            role.is_default
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                              : "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                          )}
                        >
                          {role.is_default ? "Default" : "Custom"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                            {counts.menuCount} menus
                          </span>
                          <span className="rounded-full bg-[#1E88E5]/15 px-2 py-1 text-[11px] font-semibold text-[#1E88E5]">
                            {counts.modifyCount} modify
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">System</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{formatRoleCreatedDate(role)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => startEdit(role)}
                            className="text-slate-600 hover:text-[#1E88E5] dark:text-slate-300 dark:hover:text-[#60A5FA]"
                            aria-label={`Edit ${role.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {!role.is_default ? (
                            <button
                              type="button"
                              onClick={() => void handleDelete(role)}
                              className="text-red-500 hover:text-red-600"
                              aria-label={`Delete ${role.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                  );
                })}
                {!allRows.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-300">
                      No roles found for the selected organization.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {roleModalOpen && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/10 dark:bg-zinc-950/90">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
              <div>
                <h2 className="text-xl font-bold leading-tight text-[#111827] dark:text-slate-100">
                  {creating ? "Create Custom Role" : `Edit Role: ${effectiveRole?.name ?? "Select role"}`}
                </h2>
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
        </div>,
        document.body
      )
        : null}
    </div>
  );
}

