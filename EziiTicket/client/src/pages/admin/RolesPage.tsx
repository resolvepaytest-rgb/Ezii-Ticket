import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { InstantTooltip } from "@components/common/InstantTooltip";
import { toast } from "sonner";
import {
  createRole,
  deleteRole,
  getExternalOrganizations,
  getExternalOrgAttributeSubAttributes,
  getExternalOrgAttributes,
  getExternalOrgWorkerTypes,
  listRoles,
  updateRole,
  type ApplyRoleTo,
  type ExternalOrganization,
  type Role,
} from "@api/adminApi";
import { getAuthMePermissions } from "@api/authApi";
import { useAuthStore } from "@store/useAuthStore";
import { EZII_BRAND } from "@/lib/eziiBrand";
import { cn } from "@/lib/utils";
import { Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";

type RolePermissions = {
  screen_access?: Record<string, { view: boolean; modify: boolean }>;
};

type DraftState = {
  name: string;
  description: string;
  permissions: RolePermissions;
  apply_role_to: ApplyRoleTo;
  apply_attribute_id: string;
  apply_sub_attribute_id: string;
  apply_worker_type_id: string;
};

type RolesToggleSwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
};

function RolesToggleSwitch({ checked, onChange, ariaLabel }: RolesToggleSwitchProps) {
  return (
    <label className="roles-toggle-switch">
      <input
        type="checkbox"
        className="roles-toggle-checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
      />
      <div className="roles-toggle-slider" />
    </label>
  );
}

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
  // { key: "api_tokens", label: "API Tokens" },
  // { key: "webhooks", label: "Webhooks" },
  // { key: "audit_logs", label: "Audit Logs" },
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
  const rest = { ...(permissions as RolePermissions & {
    ticket_access?: string;
    assign_scope?: string;
    can_resolve?: boolean;
    tier1_sla_config?: "none" | "view" | "edit";
    tier2_sla_config?: "none" | "view" | "edit";
  }) };
  delete rest.ticket_access;
  delete rest.assign_scope;
  delete rest.can_resolve;
  delete rest.tier1_sla_config;
  delete rest.tier2_sla_config;
  return {
    ...rest,
    screen_access: normalizeScreenAccess(rest.screen_access, false),
  };
}

function defaultPermissions(): RolePermissions {
  return {
    screen_access: defaultScreenAccess(false),
  };
}

const DEFAULT_ROLE_BASELINES: Record<string, RolePermissions> = {
  customer: {
    screen_access: defaultCustomerScreenAccessFull(),
  },
  "org admin": {
    screen_access: defaultScreenAccessAllView(),
  },
  agent: {
    screen_access: defaultScreenAccessAllViewAgentTier(),
  },
  "team lead": {
    screen_access: defaultScreenAccessAllViewAgentTier(),
  },
  "system admin": {
    screen_access: defaultScreenAccess(true),
  },
};

const CUSTOMER_ORG_DEFAULT_ROLE_KEYS = new Set(["customer", "org admin"]);

function normalizeRoleNameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isLegacyAgentLevelRole(name: string) {
  const key = baselineRoleKey(name);
  return key === "l1 agent" || key === "l2 specialist" || key === "l3 engineer";
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
    apply_worker_type_id: role?.apply_worker_type_id ?? "",
  };
}

function parseCsvIds(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function mergeCsvId(csv: string, nextId: string): string {
  const current = parseCsvIds(csv);
  if (!nextId || current.includes(nextId)) return csv;
  return [...current, nextId].join(",");
}

function removeCsvId(csv: string, removeId: string): string {
  return parseCsvIds(csv)
    .filter((id) => id !== removeId)
    .join(",");
}

function formatWorkerTypeLabel(id: string, workerTypes: Array<{ id: number; customer_worker_type: string }>) {
  return workerTypes.find((w) => String(w.id) === id)?.customer_worker_type ?? id;
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
  const [meScopedRoleName, setMeScopedRoleName] = useState<string | null>(null);
  const [canModifyRolesScreen, setCanModifyRolesScreen] = useState(isSystemAdminUser);
  const [extAttributes, setExtAttributes] = useState<Array<{ attribute_id: string; attribute: string }>>([]);
  const [extSubAttributes, setExtSubAttributes] = useState<Array<{ attribute_sub_id: string; attribute_sub: string }>>(
    []
  );
  const [extWorkerTypes, setExtWorkerTypes] = useState<Array<{ id: number; customer_worker_type: string }>>([]);

  const selectedRole = useMemo(
    () => (selectedRoleId == null ? null : roles.find((r) => r.id === selectedRoleId) ?? null),
    [selectedRoleId, roles]
  );

  const visibleRoles = useMemo(() => roles.filter((r) => !isLegacyAgentLevelRole(r.name)), [roles]);
  const activeOrgId = useMemo(() => {
    if (isOrgScopedAdmin && Number.isFinite(authOrgIdNum) && authOrgIdNum > 0) return Math.trunc(authOrgIdNum);
    if (selectedOrgFilter && Number.isFinite(Number(selectedOrgFilter))) return Number(selectedOrgFilter);
    return null;
  }, [isOrgScopedAdmin, authOrgIdNum, selectedOrgFilter]);
  const defaultRoles = useMemo(() => {
    const defaults = visibleRoles.filter((r) => r.is_default);
    if (activeOrgId == null) return defaults;
    const needsCustomerDefaults = activeOrgId !== 1;
    return defaults.filter((r) => {
      const isCustomerDefault = CUSTOMER_ORG_DEFAULT_ROLE_KEYS.has(baselineRoleKey(r.name));
      return needsCustomerDefaults ? isCustomerDefault : !isCustomerDefault;
    });
  }, [visibleRoles, activeOrgId]);
  const customRoles = useMemo(() => visibleRoles.filter((r) => !r.is_default), [visibleRoles]);
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
      const visible = all.filter((role) => !isLegacyAgentLevelRole(role.name));
      if ((!selectedRoleId || !visible.some((role) => role.id === selectedRoleId)) && visible.length) {
        setSelectedRoleId(visible[0]!.id);
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
    if (!roleModalOpen || !draft || draft.apply_role_to !== "attribute" || !draft.apply_attribute_id) {
      setExtSubAttributes([]);
      return;
    }
    let cancelled = false;
    const attributeIds = parseCsvIds(draft.apply_attribute_id);
    if (!attributeIds.length) {
      setExtSubAttributes([]);
      return;
    }
    void Promise.all(attributeIds.map((id) => getExternalOrgAttributeSubAttributes(id)))
      .then((rawList) => {
        if (cancelled) return;
        const byId = new Map<string, { attribute_sub_id: string; attribute_sub: string }>();
        for (const raw of rawList) {
          const list =
            (raw as { sub_attributes?: { attribute_sub_id: string; attribute_sub: string }[] })?.sub_attributes ?? [];
          for (const item of list) {
            if (item.attribute_sub_id) byId.set(item.attribute_sub_id, item);
          }
        }
        setExtSubAttributes(Array.from(byId.values()));
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
    if (!authUser) {
      setMeScopedRoleName(null);
      return;
    }
    let cancelled = false;
    void getAuthMePermissions()
      .then((res) => {
        if (!cancelled) setMeScopedRoleName(res.role_name ?? null);
      })
      .catch(() => {
        if (!cancelled) setMeScopedRoleName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (isSystemAdminUser) {
      setCanModifyRolesScreen(true);
      return;
    }
    let cancelled = false;
    void getAuthMePermissions()
      .then((res) => {
        if (cancelled) return;
        setCanModifyRolesScreen(Boolean(res.permissions_json?.screen_access?.roles_permissions?.modify));
      })
      .catch(() => {
        if (!cancelled) setCanModifyRolesScreen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSystemAdminUser]);

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

  const scopedRoleKey = meScopedRoleName ? baselineRoleKey(meScopedRoleName) : null;
  const ticketRoleKey = authUser?.ticket_role ? baselineRoleKey(authUser.ticket_role) : null;
  const authUserRoleKey = authUser?.role_name ? baselineRoleKey(authUser.role_name) : null;
  const yourRoleKey = isSystemAdminUser
    ? baselineRoleKey("system_admin")
    : scopedRoleKey ?? ticketRoleKey ?? authUserRoleKey;
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
  const modifyAccessMessage = "You don't have modify access";

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
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Organization</p>
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
        <InstantTooltip disabled={!canModifyRolesScreen} message={modifyAccessMessage}>
          <button
            type="button"
            onClick={startCreate}
            disabled={!canModifyRolesScreen}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: EZII_BRAND.primary }}
          >
            <Plus className="h-4 w-4" />
            Create Role
          </button>
        </InstantTooltip>
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
                  const roleType: "internal_support" | "customer_org" = role.is_default
                    ? CUSTOMER_ORG_DEFAULT_ROLE_KEYS.has(baselineRoleKey(role.name))
                      ? "customer_org"
                      : "internal_support"
                    : roleOrgId(role) === 1
                    ? "internal_support"
                    : "customer_org";
                  return (
                    <tr
                      key={role.id}
                      className="bg-transparent text-[#1f2937] transition-colors hover:bg-slate-50/80 dark:text-slate-100 dark:hover:bg-white/[0.04]"
                    >
                      <td className="px-3 py-3 font-semibold">
                        <div className="flex items-center gap-2">
                          <span>{role.name}</span>
                          {isYourRole ? (
                            <span className="rounded-full bg-[#16A34A]/15 px-2 py-0.5 text-[10px] text-[#16A34A]">
                              Your Role
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-full px-2 py-1 text-[11px] font-semibold",
                              roleType === "internal_support"
                                ? "bg-[#1E88E5]/15 text-[#1E88E5]"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                            )}
                          >
                            {roleType === "internal_support" ? "Internal Support" : "Customer Org"}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-1 text-[11px] font-semibold",
                              role.is_default
                                ? "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"
                                : "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                            )}
                          >
                            {role.is_default ? "Default" : "Custom"}
                          </span>
                        </div>
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
                          <InstantTooltip disabled={!canModifyRolesScreen} message={modifyAccessMessage}>
                            <button
                              type="button"
                              onClick={() => startEdit(role)}
                              disabled={!canModifyRolesScreen}
                              className="text-slate-600 hover:text-[#1E88E5] disabled:opacity-60 dark:text-slate-300 dark:hover:text-[#60A5FA]"
                              aria-label={`Edit ${role.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </InstantTooltip>
                          {!role.is_default ? (
                            <InstantTooltip disabled={!canModifyRolesScreen} message={modifyAccessMessage}>
                              <button
                                type="button"
                                onClick={() => void handleDelete(role)}
                                disabled={!canModifyRolesScreen}
                                className="text-red-500 hover:text-red-600 disabled:opacity-60"
                                aria-label={`Delete ${role.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </InstantTooltip>
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
                <InstantTooltip disabled={!canModifyRolesScreen} message={modifyAccessMessage}>
                  <button
                    type="button"
                    onClick={resetChanges}
                    disabled={!canModifyRolesScreen}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-black/5 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    Reset Changes
                  </button>
                </InstantTooltip>
                <InstantTooltip disabled={!canModifyRolesScreen} message={modifyAccessMessage}>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={!canModifyRolesScreen || saving || !effectiveDraft}
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: EZII_BRAND.primary }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </InstantTooltip>
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
                    Modes: <code className="text-[10px]">all</code>, <code className="text-[10px]">reportees</code>,{" "}
                    <code className="text-[10px]">attribute</code>, <code className="text-[10px]">customer_org</code>,{" "}
                    <code className="text-[10px]">internal_support</code>. Reportees are resolved at runtime for the
                    logged-in user. Attribute supports multiple attributes and sub-attributes.
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
                                  apply_attribute_id: e.target.value === "attribute" ? d.apply_attribute_id : "",
                                  apply_sub_attribute_id: e.target.value === "attribute" ? d.apply_sub_attribute_id : "",
                                  apply_worker_type_id: e.target.value === "attribute" ? d.apply_worker_type_id : "",
                                }
                              : d
                          )
                        }
                        className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                      >
                        <option value="all">All</option>
                        <option value="reportees">Reportees</option>
                        <option value="attribute">Attribute</option>
                        <option value="customer_org">Customer Org</option>
                        <option value="internal_support">Internal Support</option>
                      </select>
                    </label>
                    {effectiveDraft.apply_role_to === "attribute" ? (
                      <label className="grid gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Worker type (optional)
                        </span>
                        <div className="rounded-lg border border-black/10 bg-white/75 p-2 text-xs dark:border-white/10 dark:bg-white/10">
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {parseCsvIds(effectiveDraft.apply_worker_type_id).length ? (
                              parseCsvIds(effectiveDraft.apply_worker_type_id).map((id) => (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                >
                                  {formatWorkerTypeLabel(id, extWorkerTypes)}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraft((d) =>
                                        d
                                          ? { ...d, apply_worker_type_id: removeCsvId(d.apply_worker_type_id, id) }
                                          : d
                                      )
                                    }
                                    className="rounded px-1 text-[10px] leading-none hover:bg-emerald-200 dark:hover:bg-emerald-500/30"
                                    aria-label={`Remove ${formatWorkerTypeLabel(id, extWorkerTypes)}`}
                                  >
                                    x
                                  </button>
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-slate-500">All worker types</span>
                            )}
                          </div>
                          <select
                            value=""
                            onChange={(e) => {
                              const selectedId = e.target.value;
                              if (!selectedId) return;
                              setDraft((d) =>
                                d
                                  ? { ...d, apply_worker_type_id: mergeCsvId(d.apply_worker_type_id, selectedId) }
                                  : d
                              );
                            }}
                            className="w-full rounded-lg border border-black/10 bg-white/75 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/10"
                          >
                            <option value="">Select worker type...</option>
                            {extWorkerTypes
                              .filter((w) => !parseCsvIds(effectiveDraft.apply_worker_type_id).includes(String(w.id)))
                              .map((w) => (
                                <option key={w.id} value={String(w.id)}>
                                  {w.customer_worker_type}
                                </option>
                              ))}
                          </select>
                        </div>
                      </label>
                    ) : null}
                    {effectiveDraft.apply_role_to === "attribute" && (
                      <label className="grid gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Attribute</span>
                        <select
                          value={parseCsvIds(effectiveDraft.apply_attribute_id)[0] ?? ""}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    apply_attribute_id: e.target.value,
                                  }
                                : d
                            )
                          }
                          className="rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
                        >
                          <option value="">Select attribute...</option>
                          {extAttributes.map((a) => (
                            <option key={a.attribute_id} value={a.attribute_id}>
                              {a.attribute}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {effectiveDraft.apply_role_to === "attribute" && effectiveDraft.apply_attribute_id ? (
                      <label className="grid gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Sub-attributes (multiple, optional)
                        </span>
                        <div className="rounded-lg border border-black/10 bg-white/75 p-2 text-xs dark:border-white/10 dark:bg-white/10">
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {parseCsvIds(effectiveDraft.apply_sub_attribute_id).length ? (
                              parseCsvIds(effectiveDraft.apply_sub_attribute_id).map((id) => {
                                const label = extSubAttributes.find((s) => s.attribute_sub_id === id)?.attribute_sub ?? id;
                                return (
                                  <span
                                    key={id}
                                    className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                                  >
                                    {label}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDraft((d) =>
                                          d
                                            ? { ...d, apply_sub_attribute_id: removeCsvId(d.apply_sub_attribute_id, id) }
                                            : d
                                        )
                                      }
                                      className="rounded px-1 text-[10px] leading-none hover:bg-violet-200 dark:hover:bg-violet-500/30"
                                      aria-label={`Remove ${label}`}
                                    >
                                      x
                                    </button>
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-[11px] text-slate-500">No sub-attributes selected</span>
                            )}
                          </div>
                          <select
                            value=""
                            onChange={(e) => {
                              const selectedId = e.target.value;
                              if (!selectedId) return;
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      apply_sub_attribute_id: mergeCsvId(d.apply_sub_attribute_id, selectedId),
                                    }
                                  : d
                              );
                            }}
                            className="w-full rounded-lg border border-black/10 bg-white/75 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/10"
                          >
                            <option value="">Select sub-attribute...</option>
                            {extSubAttributes
                              .filter((s) => !parseCsvIds(effectiveDraft.apply_sub_attribute_id).includes(s.attribute_sub_id))
                              .map((s) => (
                                <option key={s.attribute_sub_id} value={s.attribute_sub_id}>
                                  {s.attribute_sub}
                                </option>
                              ))}
                          </select>
                        </div>
                      </label>
                    ) : null}
                    {effectiveDraft.apply_role_to === "reportees" ? (
                      <p className="text-[11px] text-slate-500 md:col-span-2">
                        Reportees scope is evaluated at runtime for the logged-in user and is not pre-fetched here.
                      </p>
                    ) : null}
                    {effectiveDraft.apply_role_to === "customer_org" ? (
                      <p className="text-[11px] text-slate-500 md:col-span-2">
                        Customer org scope applies to users/tickets outside org 1 (tenant org users only).
                      </p>
                    ) : null}
                    {effectiveDraft.apply_role_to === "internal_support" ? (
                      <p className="text-[11px] text-slate-500 md:col-span-2">
                        Internal support scope applies to internal team agent users (org 1 support pool).
                      </p>
                    ) : null}
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
                          {(() => {
                            const allViewEnabled = group.screens.every((screen) => p.screen_access?.[screen.key]?.view);
                            const allModifyEnabled = group.screens.every((screen) => p.screen_access?.[screen.key]?.modify);
                            return (
                              <div className="grid grid-cols-[minmax(0,1fr)_140px_140px] items-center gap-2 rounded-lg border border-black/10 bg-slate-50/90 px-3 py-2 dark:border-white/10 dark:bg-white/[0.08]">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                                    {group.title}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{group.subtitle}</div>
                                </div>
                                <div className="flex items-center justify-center gap-2">
                                  <RolesToggleSwitch
                                    checked={allViewEnabled}
                                    ariaLabel={`Toggle all view for ${group.title}`}
                                    onChange={(nextView) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const currentAccess = normalizeScreenAccess(d.permissions.screen_access, false);
                                        for (const screen of group.screens) {
                                          currentAccess[screen.key] = {
                                            view: nextView,
                                            modify: nextView ? currentAccess[screen.key]?.modify ?? false : false,
                                          };
                                        }
                                        return {
                                          ...d,
                                          permissions: { ...d.permissions, screen_access: currentAccess },
                                        };
                                      })
                                    }
                                  />
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">All View</span>
                                </div>
                                <div className="flex items-center justify-center gap-2">
                                  <RolesToggleSwitch
                                    checked={allModifyEnabled}
                                    ariaLabel={`Toggle all modify for ${group.title}`}
                                    onChange={(nextModify) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const currentAccess = normalizeScreenAccess(d.permissions.screen_access, false);
                                        for (const screen of group.screens) {
                                          currentAccess[screen.key] = {
                                            view: nextModify ? true : currentAccess[screen.key]?.view ?? false,
                                            modify: nextModify,
                                          };
                                        }
                                        return {
                                          ...d,
                                          permissions: { ...d.permissions, screen_access: currentAccess },
                                        };
                                      })
                                    }
                                  />
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">All Modify</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="space-y-2">
                          {group.screens.map((screen) => {
                            const entry = p.screen_access?.[screen.key] ?? { view: false, modify: false };
                            return (
                              <div
                                key={`${group.key}:${screen.key}`}
                                className="grid grid-cols-[minmax(0,1fr)_140px_140px] items-center gap-2 rounded-lg border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/10"
                              >
                                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                  {screen.label}
                                </div>
                                <div className="flex items-center justify-center gap-2">
                                  <RolesToggleSwitch
                                    checked={entry.view}
                                    ariaLabel={`Toggle view for ${screen.label}`}
                                    onChange={(nextView) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const currentAccess = normalizeScreenAccess(d.permissions.screen_access, false);
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
                                  />
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">View</span>
                                </div>
                                <div className="flex items-center justify-center gap-2">
                                  <RolesToggleSwitch
                                    checked={entry.modify}
                                    ariaLabel={`Toggle modify for ${screen.label}`}
                                    onChange={(nextModify) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const currentAccess = normalizeScreenAccess(d.permissions.screen_access, false);
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
                                  />
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Modify</span>
                                </div>
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

