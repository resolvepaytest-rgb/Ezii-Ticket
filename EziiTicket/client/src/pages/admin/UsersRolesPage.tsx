import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { toast } from "sonner";
import {
  createDesignation,
  createUser,
  getUserDesignation,
  getExternalOrganizations,
  listDesignations,
  listOrganisationUserDirectory,
  listUserPermissionOverrides,
  listRoles,
  listUserRoles,
  listUserScopeOrg,
  listUsers,
  removeUserScopeOrg,
  setUserDesignation,
  setUserRoles,
  syncUsersFromWorkerMaster,
  type Designation,
  type ExternalOrganization,
  type OrgDirectoryUser,
  type Role,
  type User,
  type UserDesignation,
  type UserScopeOrg,
} from "@api/adminApi";
import { useAuthStore } from "@store/useAuthStore";
import { EZII_BRAND } from "@/lib/eziiBrand";
import { ChevronDown, ChevronUp, Search, UserPlus, X } from "lucide-react";

type InviteState = {
  open: boolean;
  query: string;
  selectedUserIds: number[];
  selectedRoleId: number | null;
  /** For Ezii → tenant invite: one of LEVEL_SLUGS; role is always Customer in the tenant */
  selectedLevelSlug: string;
  saving: boolean;
};

/**
 * Invited (Ezii) only when `user_scope_org.origin_org_id === 1` and a scope row exists
 * (`scope_org_id` set). All other directory rows are treated as customer org users.
 */
type UserTableRow = {
  user_id: number;
  name: string;
  email: string;
  status: string;
  assignedRoleLabel: string;
  /** Only set for worker-directory sourced rows; false = not yet in ticket DB */
  provisioned?: boolean;
  /** Department from worker/DB `type_id_1` */
  department?: string | null;
  /** From `user_scope_org` when present */
  originOrgId?: number | null;
  scopeOrgId?: number | null;
  /** Support tier (l1/l2/l3) from `user_designation` when name matches */
  levelLabel?: string;
};

const LEVEL_SLUGS = ["l1_agent", "l2_specialist", "l3_engineer"] as const;

function levelSlugFromDesignationName(name: string | null | undefined): string {
  if (!name) return "";
  const n = name.trim().toLowerCase();
  for (const s of LEVEL_SLUGS) {
    if (s === n) return s;
  }
  return "";
}

/** Routing tier from `user_org_support_levels` / org_support_levels (not from ticket role). */
function tierSlugFromUserDesignation(d: UserDesignation | null | undefined): string {
  return levelSlugFromDesignationName(d?.support_level_name ?? d?.designation_name);
}

type EffectiveAccessPreview = {
  userId: number;
  userName: string;
  roleName: string;
  levelName: string | null;
  permissionsJson: Record<string, unknown>;
  overrideCount: number;
};

function isEziiInvitedSectionRow(row: UserTableRow): boolean {
  return (
    row.originOrgId === 1 &&
    row.scopeOrgId != null &&
    Number.isFinite(Number(row.scopeOrgId))
  );
}

export function UsersRolesPage({ orgId }: { orgId: string }) {
  const authUser = useAuthStore((s) => s.user);
  const orgIdNumFromShell = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);

  const isSystemAdminUser =
    authUser?.role_name === "admin" &&
    authUser?.org_id === "1" &&
    authUser?.user_id === "1" &&
    authUser?.role_id === "1" &&
    authUser?.user_type_id === "1";

  const [activeOrgId, setActiveOrgId] = useState<number | null>(orgIdNumFromShell);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<OrgDirectoryUser[]>([]);
  /** Tenant org already has rows in `users` for this org — server skips client-worker-master on directory load. */
  const [orgHasLocalUsers, setOrgHasLocalUsers] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [sourceUsers, setSourceUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [scopeRows, setScopeRows] = useState<UserScopeOrg[]>([]);
  const [assignedRoleByUserId, setAssignedRoleByUserId] = useState<Record<number, string>>({});
  const [assignedRoleIdByUserId, setAssignedRoleIdByUserId] = useState<Record<number, number>>({});
  const [assignedDesignationByUserId, setAssignedDesignationByUserId] = useState<
    Record<number, UserDesignation | null>
  >({});
  /** Designations in org 1 — used for Level on invite list when inviting Ezii users into a tenant org */
  const [org1DesignationByUserId, setOrg1DesignationByUserId] = useState<
    Record<number, UserDesignation | null>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [rowRoleMap, setRowRoleMap] = useState<Record<number, number | null>>({});
  /** `undefined` = user has not changed Level; otherwise saved slug or "" for none */
  const [rowLevelMap, setRowLevelMap] = useState<Record<number, string | undefined>>({});
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(20);
  const [customerRowsPerPage, setCustomerRowsPerPage] = useState<number | "all">(20);
  const [invitedRowsPerPage, setInvitedRowsPerPage] = useState<number | "all">(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [customerPage, setCustomerPage] = useState(1);
  const [invitedPage, setInvitedPage] = useState(1);
  const [customerExpanded, setCustomerExpanded] = useState(false);
  const [invitedExpanded, setInvitedExpanded] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [preview, setPreview] = useState<EffectiveAccessPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [invite, setInvite] = useState<InviteState>({
    open: false,
    query: "",
    selectedUserIds: [],
    selectedRoleId: null,
    selectedLevelSlug: "",
    saving: false,
  });

  useEffect(() => {
    if (!orgIdNumFromShell) return;
    setActiveOrgId(orgIdNumFromShell);
  }, [orgIdNumFromShell]);

  useEffect(() => {
    if (!isSystemAdminUser) return;
    let cancelled = false;
    void getExternalOrganizations()
      .then((list) => {
        if (!cancelled) setExternalOrgs(list);
      })
      .catch(() => {
        if (!cancelled) setExternalOrgs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isSystemAdminUser]);

  async function loadPageData(targetOrgId: number) {
    setLoading(true);
    setError(null);
    try {
      const sourceOrgId = isSystemAdminUser && targetOrgId !== 1 ? 1 : targetOrgId;
      const [rolesRes, designationsRes, targetUsersRes, sourceUsersRes, scopedRes, directoryBundle] = await Promise.all([
        listRoles(targetOrgId),
        listDesignations(targetOrgId).catch(() => [] as Designation[]),
        listUsers(targetOrgId),
        listUsers(sourceOrgId),
        listUserScopeOrg(targetOrgId),
        isSystemAdminUser && targetOrgId !== 1
          ? listOrganisationUserDirectory(targetOrgId, true).catch(() => ({
              users: [] as OrgDirectoryUser[],
              has_local_users: true,
            }))
          : Promise.resolve({ users: [] as OrgDirectoryUser[], has_local_users: true }),
      ]);
      setRoles(rolesRes);
      setDesignations(designationsRes);
      setUsers(targetUsersRes);
      setSourceUsers(sourceUsersRes);
      setScopeRows(scopedRes);
      setDirectoryUsers(directoryBundle.users);
      setOrgHasLocalUsers(
        isSystemAdminUser && targetOrgId !== 1 ? directoryBundle.has_local_users : true
      );

      const usersToResolve = new Set<number>();
      for (const u of targetUsersRes) usersToResolve.add(Number(u.user_id));
      for (const s of scopedRes) usersToResolve.add(Number(s.user_id));
      for (const d of directoryBundle.users) usersToResolve.add(Number(d.user_id));

      const [pairs, org1DesignationMap] = await Promise.all([
        Promise.all(
          Array.from(usersToResolve).map(async (uid) => {
            try {
              const [list, designation] = await Promise.all([
                listUserRoles(uid),
                getUserDesignation(uid, targetOrgId).catch(() => null),
              ]);
              const scoped = list.find((r) => Number(r.scope_organisation_id) === targetOrgId);
              const global = list.find((r) => r.scope_organisation_id == null);
              const chosen = scoped ?? global ?? null;
              return {
                uid,
                roleName: chosen?.role_name ?? "",
                roleId: chosen?.role_id ? Number(chosen.role_id) : null,
                designation: designation,
              } as const;
            } catch {
              return { uid, roleName: "", roleId: null, designation: null } as const;
            }
          })
        ),
        (async (): Promise<Record<number, UserDesignation | null>> => {
          if (!isSystemAdminUser || targetOrgId === 1) return {};
          const org1UidSet = new Set<number>();
          for (const u of sourceUsersRes) org1UidSet.add(Number(u.user_id));
          for (const d of directoryBundle.users) {
            if (Number(d.origin_org_id) === 1) org1UidSet.add(Number(d.user_id));
          }
          const entries = await Promise.all(
            Array.from(org1UidSet).map(async (uid) => {
              const des = await getUserDesignation(uid, 1).catch(() => null);
              return [uid, des] as const;
            })
          );
          return Object.fromEntries(entries);
        })(),
      ]);

      const fromDirectoryNames = Object.fromEntries(directoryBundle.users.map((d) => [d.user_id, d.ticket_role || ""]));
      const fromDirectoryIds = Object.fromEntries(
        directoryBundle.users
          .filter((d) => d.ticket_role_id != null && Number.isFinite(Number(d.ticket_role_id)))
          .map((d) => [d.user_id, Number(d.ticket_role_id)])
      );

      const mergedNames = { ...fromDirectoryNames };
      const mergedIds = { ...fromDirectoryIds };
      const designationMap: Record<number, UserDesignation | null> = {};
      for (const p of pairs) {
        if (p.roleName) mergedNames[p.uid] = p.roleName;
        if (p.roleId != null && Number.isFinite(p.roleId)) mergedIds[p.uid] = p.roleId;
        designationMap[p.uid] = p.designation;
      }

      setAssignedRoleByUserId(mergedNames);
      setAssignedRoleIdByUserId(mergedIds);
      setAssignedDesignationByUserId(designationMap);
      setOrg1DesignationByUserId(org1DesignationMap);
      setRowRoleMap({});
      setRowLevelMap({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users and roles");
      setUsers([]);
      setSourceUsers([]);
      setRoles([]);
      setDesignations([]);
      setScopeRows([]);
      setAssignedRoleByUserId({});
      setAssignedRoleIdByUserId({});
      setAssignedDesignationByUserId({});
      setOrg1DesignationByUserId({});
      setDirectoryUsers([]);
      setOrgHasLocalUsers(true);
      setRowRoleMap({});
      setRowLevelMap({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeOrgId) return;
    setCustomerExpanded(false);
    setInvitedExpanded(false);
    void loadPageData(activeOrgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  const orgName = useMemo(() => {
    if (!activeOrgId) return "Organization";
    const fromExternal = externalOrgs.find((o) => Number(o.id) === activeOrgId)?.organization_name;
    if (fromExternal) return fromExternal;
    if (activeOrgId === 1) return "Ezii HQ";
    return `Organization ${activeOrgId}`;
  }, [activeOrgId, externalOrgs]);

  const defaultCustomerRoleId = useMemo(() => {
    const c = roles.find((r) => String(r.name ?? "").toLowerCase() === "customer");
    return c?.id ?? roles[0]?.id ?? null;
  }, [roles]);

  const requiredInvitedEziiRole = useMemo(() => {
    const roleBySlug = (slug: string) =>
      roles.find((r) => String(r.name ?? "").trim().toLowerCase() === slug)?.id ?? null;

    const l1Id = roleBySlug("l1_agent");
    const l2Id = roleBySlug("l2_specialist");
    const l3Id = roleBySlug("l3_engineer");
    return { l1Id, l2Id, l3Id };
  }, [roles]);

  /** At least one Ezii-invited user per routing tier. Tier lives on org support level, not ticket_role (invite uses Customer). */
  const missingInvitedEziiRoles = useMemo(() => {
    if (!isSystemAdminUser || activeOrgId == null || activeOrgId === 1) return [] as string[];

    const activeInvitedScopes = scopeRows.filter(
      (s) =>
        s.is_active &&
        Number(s.origin_org_id) === 1 &&
        Number(s.scope_org_id) === activeOrgId
    );

    const tierSlugs = new Set<string>();
    for (const s of activeInvitedScopes) {
      const slug = tierSlugFromUserDesignation(assignedDesignationByUserId[Number(s.user_id)]);
      if (slug) tierSlugs.add(slug);
    }

    const missing: string[] = [];
    if (!tierSlugs.has("l1_agent")) missing.push("L1");
    if (!tierSlugs.has("l2_specialist")) missing.push("L2");
    if (!tierSlugs.has("l3_engineer")) missing.push("L3");
    return missing;
  }, [isSystemAdminUser, activeOrgId, scopeRows, assignedDesignationByUserId]);

  const recommendedInviteRoleId = useMemo(() => {
    if (!isSystemAdminUser || activeOrgId == null || activeOrgId === 1) return defaultCustomerRoleId;
    if (missingInvitedEziiRoles.includes("L1") && requiredInvitedEziiRole.l1Id != null) return requiredInvitedEziiRole.l1Id;
    if (missingInvitedEziiRoles.includes("L2") && requiredInvitedEziiRole.l2Id != null) return requiredInvitedEziiRole.l2Id;
    if (missingInvitedEziiRoles.includes("L3") && requiredInvitedEziiRole.l3Id != null) return requiredInvitedEziiRole.l3Id;
    return defaultCustomerRoleId;
  }, [isSystemAdminUser, activeOrgId, missingInvitedEziiRoles, requiredInvitedEziiRole, defaultCustomerRoleId]);

  const departmentByUserId = useMemo(() => {
    const m: Record<number, string> = {};
    for (const u of users) {
      const t = u.type_id_1;
      if (t != null && String(t).trim()) m[Number(u.user_id)] = String(t).trim();
    }
    for (const u of sourceUsers) {
      const uid = Number(u.user_id);
      if (m[uid]) continue;
      const t = u.type_id_1;
      if (t != null && String(t).trim()) m[uid] = String(t).trim();
    }
    return m;
  }, [users, sourceUsers]);

  const visibleRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base: UserTableRow[] =
      isSystemAdminUser && activeOrgId !== 1 && directoryUsers.length > 0
        ? directoryUsers.map((d) => ({
            user_id: d.user_id,
            name: d.name,
            email: d.email,
            status: d.provisioned ? d.status : "active",
            assignedRoleLabel: assignedRoleByUserId[d.user_id] ?? d.ticket_role ?? "",
            provisioned: d.provisioned,
            department: d.department ?? null,
            originOrgId: d.origin_org_id ?? null,
            scopeOrgId: d.scope_org_id ?? null,
            levelLabel: tierSlugFromUserDesignation(assignedDesignationByUserId[d.user_id]) || "—",
          }))
        : isSystemAdminUser && activeOrgId !== 1
          ? scopeRows.map((r) => ({
              user_id: r.user_id,
              name: r.user_name ?? `User ${r.user_id}`,
              email: r.email ?? "-",
              status: r.is_active ? "active" : "suspended",
              assignedRoleLabel:
                assignedRoleByUserId[Number(r.user_id)] ?? r.ticket_role ?? "",
              provisioned: true,
              department: departmentByUserId[Number(r.user_id)] ?? null,
              originOrgId: Number(r.origin_org_id),
              scopeOrgId: Number(r.scope_org_id),
              levelLabel:
                tierSlugFromUserDesignation(assignedDesignationByUserId[Number(r.user_id)]) || "—",
            }))
          : users.map((u) => {
              const sc = scopeRows.find((sr) => Number(sr.user_id) === Number(u.user_id));
              return {
                user_id: Number(u.user_id),
                name: u.name || `User ${u.user_id}`,
                email: u.email || "-",
                status: u.status || "active",
                assignedRoleLabel: assignedRoleByUserId[Number(u.user_id)] ?? "",
                department:
                  (u.type_id_1 != null && String(u.type_id_1).trim()
                    ? String(u.type_id_1).trim()
                    : null) ?? departmentByUserId[Number(u.user_id)] ?? null,
                originOrgId: sc != null ? Number(sc.origin_org_id) : null,
                scopeOrgId: sc != null ? Number(sc.scope_org_id) : null,
                levelLabel:
                  tierSlugFromUserDesignation(assignedDesignationByUserId[Number(u.user_id)]) || "—",
              };
            });
    const rows = !q
      ? base
      : base.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q) ||
            String(r.user_id).includes(q)
        );
    rows.sort((a, b) => {
      const nameCmp = (a.name ?? "")
        .trim()
        .localeCompare((b.name ?? "").trim(), undefined, { sensitivity: "base" });
      if (nameCmp !== 0) return nameCmp;
      return (a.email ?? "")
        .trim()
        .localeCompare((b.email ?? "").trim(), undefined, { sensitivity: "base" });
    });
    return rows;
  }, [
    searchQuery,
    isSystemAdminUser,
    activeOrgId,
    scopeRows,
    users,
    directoryUsers,
    assignedRoleByUserId,
    assignedDesignationByUserId,
    departmentByUserId,
  ]);

  const totalRows = visibleRows.length;
  const totalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(totalRows / rowsPerPage));
  }, [rowsPerPage, totalRows]);

  const pagedVisibleRows = useMemo(() => {
    if (rowsPerPage === "all") return visibleRows;
    const start = (currentPage - 1) * rowsPerPage;
    return visibleRows.slice(start, start + rowsPerPage);
  }, [visibleRows, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
    setCustomerPage(1);
    setInvitedPage(1);
  }, [activeOrgId, searchQuery, rowsPerPage, customerRowsPerPage, invitedRowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const splitTenantUserSections = activeOrgId != null && activeOrgId !== 1;

  const { customerRows, eziiInvitedRows } = useMemo(() => {
    if (!splitTenantUserSections) {
      return { customerRows: visibleRows, eziiInvitedRows: [] as UserTableRow[] };
    }
    const customer: UserTableRow[] = [];
    const ezii: UserTableRow[] = [];
    for (const row of visibleRows) {
      if (isEziiInvitedSectionRow(row)) ezii.push(row);
      else customer.push(row);
    }
    return { customerRows: customer, eziiInvitedRows: ezii };
  }, [splitTenantUserSections, visibleRows]);

  const customerTotalPages = useMemo(() => {
    if (customerRowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(customerRows.length / customerRowsPerPage));
  }, [customerRowsPerPage, customerRows.length]);

  const invitedTotalPages = useMemo(() => {
    if (invitedRowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(eziiInvitedRows.length / invitedRowsPerPage));
  }, [invitedRowsPerPage, eziiInvitedRows.length]);

  const pagedCustomerRows = useMemo(() => {
    if (customerRowsPerPage === "all") return customerRows;
    const start = (customerPage - 1) * customerRowsPerPage;
    return customerRows.slice(start, start + customerRowsPerPage);
  }, [customerRowsPerPage, customerRows, customerPage]);

  const pagedInvitedRows = useMemo(() => {
    if (invitedRowsPerPage === "all") return eziiInvitedRows;
    const start = (invitedPage - 1) * invitedRowsPerPage;
    return eziiInvitedRows.slice(start, start + invitedRowsPerPage);
  }, [invitedRowsPerPage, eziiInvitedRows, invitedPage]);

  const pendingChangeUserIds = useMemo(() => {
    const ids = new Set<number>();
    for (const rawUid of Object.keys(rowRoleMap)) {
      const uid = Number(rawUid);
      if (!Number.isFinite(uid)) continue;
      const draftRoleId = rowRoleMap[uid];
      const currentRoleId = assignedRoleIdByUserId[uid] ?? null;
      if (draftRoleId != null && draftRoleId !== currentRoleId) ids.add(uid);
    }
    for (const rawUid of Object.keys(rowLevelMap)) {
      const uid = Number(rawUid);
      if (!Number.isFinite(uid)) continue;
      const draftLevel = rowLevelMap[uid] ?? "";
      const currentLevel = tierSlugFromUserDesignation(assignedDesignationByUserId[uid]) ?? "";
      if (draftLevel !== currentLevel) ids.add(uid);
    }
    return Array.from(ids);
  }, [rowRoleMap, rowLevelMap, assignedRoleIdByUserId, assignedDesignationByUserId]);

  const pendingChangesCount = pendingChangeUserIds.length;

  useEffect(() => {
    if (customerPage > customerTotalPages) setCustomerPage(customerTotalPages);
  }, [customerPage, customerTotalPages]);

  useEffect(() => {
    if (invitedPage > invitedTotalPages) setInvitedPage(invitedTotalPages);
  }, [invitedPage, invitedTotalPages]);

  /** System admin viewing a tenant org — invite Ezii (org 1) users only, not the tenant's local user table */
  const customerOrgInviteMode =
    isSystemAdminUser && activeOrgId != null && activeOrgId !== 1;

  const inviteCandidates = useMemo(() => {
    const q = invite.query.trim().toLowerCase();
    const mergedById = new Map<number, User>();
    for (const u of sourceUsers) mergedById.set(Number(u.user_id), u);
    if (customerOrgInviteMode) {
      for (const d of directoryUsers) {
        const uid = Number(d.user_id);
        if (mergedById.has(uid)) continue;
        if (Number(d.origin_org_id) !== 1) continue;
        mergedById.set(uid, {
          id: uid,
          user_id: uid,
          organisation_id: 1,
          name: d.name,
          email: d.email,
          phone: null,
          user_type: null,
          status: "active",
        });
      }
    } else {
      for (const u of users) {
        const uid = Number(u.user_id);
        if (!mergedById.has(uid)) mergedById.set(uid, u);
      }
    }
    const candidates = Array.from(mergedById.values());
    const rows = !q
      ? candidates
      : candidates.filter(
          (u) =>
            (u.name ?? "").toLowerCase().includes(q) ||
            (u.email ?? "").toLowerCase().includes(q) ||
            String(u.user_id).includes(q)
        );
    rows.sort((a, b) => {
      const nameCmp = (a.name ?? "")
        .trim()
        .localeCompare((b.name ?? "").trim(), undefined, { sensitivity: "base" });
      if (nameCmp !== 0) return nameCmp;
      return (a.email ?? "")
        .trim()
        .localeCompare((b.email ?? "").trim(), undefined, { sensitivity: "base" });
    });
    return rows;
  }, [sourceUsers, directoryUsers, users, invite.query, customerOrgInviteMode]);

  const roleById = useMemo(() => {
    const map = new Map<number, Role>();
    for (const r of roles) map.set(Number(r.id), r);
    return map;
  }, [roles]);

  function asObj(v: unknown): Record<string, unknown> {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }

  function bool(v: unknown) {
    return Boolean(v);
  }

  function mergePermissions(base: Record<string, unknown>, extra: Record<string, unknown>) {
    const b = asObj(base);
    const e = asObj(extra);
    const out: Record<string, unknown> = {
      ...b,
      ...e,
      can_assign: bool(b.can_assign) || bool(e.can_assign),
      can_resolve: bool(b.can_resolve) || bool(e.can_resolve),
    };
    const bScreen = asObj(b.screen_access);
    const eScreen = asObj(e.screen_access);
    const keys = new Set<string>([...Object.keys(bScreen), ...Object.keys(eScreen)]);
    const screen: Record<string, { view: boolean; modify: boolean }> = {};
    for (const key of keys) {
      const bs = asObj(bScreen[key]);
      const es = asObj(eScreen[key]);
      const modify = bool(bs.modify) || bool(es.modify);
      const view = bool(bs.view) || bool(es.view) || modify;
      screen[key] = { view, modify };
    }
    out.screen_access = screen;
    return out;
  }

  function applyOverrides(
    base: Record<string, unknown>,
    overrides: Array<{ permission_key: string; effect: "allow" | "deny" }>
  ) {
    const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    for (const ov of overrides) {
      const path = String(ov.permission_key ?? "").trim();
      if (!path) continue;
      const parts = path.split(".").filter(Boolean);
      if (!parts.length) continue;
      let ptr = out;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        const node = ptr[k];
        if (!node || typeof node !== "object" || Array.isArray(node)) ptr[k] = {};
        ptr = ptr[k] as Record<string, unknown>;
      }
      ptr[parts[parts.length - 1]] = ov.effect === "allow";
    }
    return out;
  }

  async function openPreview(row: UserTableRow) {
    if (!activeOrgId) return;
    const selectedRoleId =
      rowRoleMap[row.user_id] ??
      assignedRoleIdByUserId[row.user_id] ??
      null;
    const role = selectedRoleId ? roleById.get(Number(selectedRoleId)) ?? null : null;
    const selectedLevelSlug =
      rowLevelMap[row.user_id] !== undefined
        ? rowLevelMap[row.user_id]!
        : tierSlugFromUserDesignation(assignedDesignationByUserId[row.user_id]);
    const levelRole =
      selectedLevelSlug && selectedLevelSlug !== ""
        ? roles.find((r) => String(r.name ?? "").trim().toLowerCase() === selectedLevelSlug.toLowerCase()) ?? null
        : null;

    setPreviewLoading(true);
    try {
      const overrides = await listUserPermissionOverrides(row.user_id, activeOrgId).catch(() => []);
      const rolePerms = asObj(role?.permissions_json);
      const levelPerms = asObj(levelRole?.permissions_json);
      const merged = mergePermissions(rolePerms, levelPerms);
      const finalPerms = applyOverrides(
        merged,
        overrides.map((o) => ({ permission_key: o.permission_key, effect: o.effect }))
      );
      setPreview({
        userId: row.user_id,
        userName: row.name,
        roleName: role?.name ?? row.assignedRoleLabel ?? "—",
        levelName: selectedLevelSlug ? selectedLevelSlug : null,
        permissionsJson: finalPerms,
        overrideCount: overrides.length,
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  function getStatusPillClass(status: string) {
    const s = status.toLowerCase();
    if (s === "active") return "bg-emerald-100 text-emerald-700";
    if (s === "pending") return "bg-amber-100 text-amber-700";
    if (s === "suspended" || s === "inactive") return "bg-slate-200 text-slate-600";
    return "bg-slate-200 text-slate-600";
  }

  function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return `${parts[0]?.[0] ?? "U"}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  async function ensureUserExistsForTarget(
    userId: number,
    selected: Pick<User, "user_id" | "organisation_id" | "name" | "email" | "phone" | "user_type" | "status"> | null,
    targetOrgId: number
  ) {
    const scopedMode = isSystemAdminUser && targetOrgId !== 1;
    const createInOrgId = scopedMode ? 1 : targetOrgId;
    if (selected && Number(selected.organisation_id) !== createInOrgId) {
      await createUser({
        user_id: Number(selected.user_id),
        organisation_id: createInOrgId,
        name: selected.name,
        email: selected.email,
        phone: selected.phone ?? null,
        user_type: selected.user_type ?? null,
        status: selected.status,
      });
    }
    return {
      userId,
      scopeOrgId: scopedMode ? targetOrgId : undefined,
    };
  }

  async function handleInviteSubmit() {
    if (!activeOrgId) return;
    if (!invite.selectedUserIds.length) return toast.error("Select at least one user");

    const eziiToTenantInvite = customerOrgInviteMode;

    if (eziiToTenantInvite) {
      const slug = invite.selectedLevelSlug.trim();
      if (!slug || !LEVEL_SLUGS.includes(slug as (typeof LEVEL_SLUGS)[number])) {
        return toast.error("Select a level (L1 / L2 / L3)");
      }
      if (defaultCustomerRoleId == null) return toast.error("Customer role not found for this organization.");
    } else {
      if (!invite.selectedRoleId) return toast.error("Select a role");
    }

    setInvite((prev) => ({ ...prev, saving: true }));
    try {
      let processed = 0;
      /** One shared level row per org+slug — must not create inside the per-user loop (state is stale; 2nd+ insert hits unique constraint). */
      let inviteBatchSupportLevelId: number | null = null;
      if (eziiToTenantInvite) {
        const slug = invite.selectedLevelSlug.trim() as (typeof LEVEL_SLUGS)[number];
        const existing = designations.find(
          (d) => String(d.name ?? "").trim().toLowerCase() === slug.toLowerCase()
        );
        inviteBatchSupportLevelId = existing
          ? existing.id
          : (
              await createDesignation({
                organisation_id: activeOrgId,
                name: slug,
                code: slug.toUpperCase().replace(/\s+/g, "_"),
              })
            ).id;
      }

      for (const selectedUserId of invite.selectedUserIds) {
        const selectedUser =
          sourceUsers.find((u) => Number(u.user_id) === selectedUserId) ??
          users.find((u) => Number(u.user_id) === selectedUserId) ??
          null;
        if (!selectedUser) continue;
        const resolved = await ensureUserExistsForTarget(
          Number(selectedUser.user_id),
          selectedUser,
          activeOrgId
        );

        if (eziiToTenantInvite) {
          await setUserRoles(resolved.userId, [defaultCustomerRoleId!], resolved.scopeOrgId);
          await setUserDesignation(resolved.userId, {
            support_level_id: inviteBatchSupportLevelId!,
            organisation_id: activeOrgId,
          });
        } else {
          await setUserRoles(resolved.userId, [invite.selectedRoleId!], resolved.scopeOrgId);
        }
        processed += 1;
      }
      if (processed === 0) throw new Error("Selected users not found");
      toast.success(
        processed === 1
          ? "Invitation/assignment saved for 1 user."
          : `Invitation/assignment saved for ${processed} users.`
      );
      setInvite({
        open: false,
        query: "",
        selectedUserIds: [],
        selectedRoleId: null,
        selectedLevelSlug: "",
        saving: false,
      });
      await loadPageData(activeOrgId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite user");
      setInvite((prev) => ({ ...prev, saving: false }));
    }
  }

  async function handleSyncUsers() {
    if (!isSystemAdminUser) return;
    if (!activeOrgId) {
      toast.error("Select an organization first.");
      return;
    }
    try {
      const resp = await syncUsersFromWorkerMaster({ orgId: activeOrgId });
      toast.success(`Sync completed. Upserted ${resp.upserted} active user(s) (${resp.scanned} rows from API).`);
      await loadPageData(activeOrgId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to sync users");
    }
  }

  async function handleApplyAllChanges() {
    if (!activeOrgId || pendingChangesCount === 0) return;
    setBulkApplying(true);
    try {
      const designationIdBySlug = new Map<string, number>(
        designations.map((d) => [String(d.name ?? "").trim().toLowerCase(), Number(d.id)])
      );
      let appliedUsers = 0;
      for (const uid of pendingChangeUserIds) {
        const source =
          sourceUsers.find((u) => Number(u.user_id) === uid) ??
          users.find((u) => Number(u.user_id) === uid) ??
          null;
        if (!source) continue;
        const resolved = await ensureUserExistsForTarget(uid, source, activeOrgId);
        let userChanged = false;

        const draftRoleId = rowRoleMap[uid];
        const currentRoleId = assignedRoleIdByUserId[uid] ?? null;
        if (draftRoleId != null && draftRoleId !== currentRoleId) {
          await setUserRoles(resolved.userId, [draftRoleId], resolved.scopeOrgId);
          userChanged = true;
        }

        if (rowLevelMap[uid] !== undefined) {
          const draftLevel = (rowLevelMap[uid] ?? "").trim();
          let resolvedDesignationId: number | null = null;
          if (draftLevel) {
            const key = draftLevel.toLowerCase();
            const existingId = designationIdBySlug.get(key);
            if (existingId != null) {
              resolvedDesignationId = existingId;
            } else {
              const created = await createDesignation({
                organisation_id: activeOrgId,
                name: draftLevel,
                code: draftLevel.toUpperCase().replace(/\s+/g, "_"),
              });
              resolvedDesignationId = created.id;
              designationIdBySlug.set(key, created.id);
            }
          }
          const currentDesignationId = assignedDesignationByUserId[uid]?.designation_id ?? null;
          if (resolvedDesignationId !== currentDesignationId) {
            await setUserDesignation(resolved.userId, {
              support_level_id: resolvedDesignationId,
              organisation_id: activeOrgId,
            });
            userChanged = true;
          }
        }

        if (userChanged) appliedUsers += 1;
      }
      toast.success(
        appliedUsers === 1 ? "Applied changes for 1 user." : `Applied changes for ${appliedUsers} users.`
      );
      setRowRoleMap({});
      setRowLevelMap({});
      await loadPageData(activeOrgId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply changes");
    } finally {
      setBulkApplying(false);
    }
  }

  function sectionHeadingRow(
    title: string,
    count: number,
    isExpanded: boolean,
    onToggle: () => void
  ) {
    return (
      <tr
        key={`section-${title}`}
        className="border-b border-black/10 bg-black/[0.05] dark:border-white/10 dark:bg-white/[0.08]"
      >
        <td
          colSpan={6}
          className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#1E88E5] dark:text-sky-300"
        >
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center justify-between gap-2"
          >
            <span>
              {title} · {count}
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-[#1E88E5]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#1E88E5]" />
            )}
          </button>
        </td>
      </tr>
    );
  }

  function sectionPagerRow(args: {
    sectionName: string;
    totalRows: number;
    page: number;
    totalPages: number;
    rowsPerPage: number | "all";
    onRowsPerPageChange: (value: number | "all") => void;
    onPrev: () => void;
    onNext: () => void;
  }) {
    return (
      <tr className="border-b border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
        <td colSpan={6} className="px-5 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-600 dark:text-slate-300">
                {args.sectionName}: {args.totalRows}
              </span>
              <label className="text-slate-600 dark:text-slate-300">Per page</label>
              <select
                value={args.rowsPerPage === "all" ? "all" : String(args.rowsPerPage)}
                onChange={(e) => {
                  const v = e.target.value;
                  args.onRowsPerPageChange(v === "all" ? "all" : Number(v));
                }}
                className="rounded-lg border border-black/10 bg-white/75 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/10"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={args.onPrev}
                disabled={args.rowsPerPage === "all" || args.page <= 1}
                className="rounded-lg border border-black/10 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10"
              >
                Prev
              </button>
              <span className="min-w-[70px] text-center text-slate-600 dark:text-slate-300">
                Page {args.rowsPerPage === "all" ? 1 : args.page} / {args.totalPages}
              </span>
              <button
                type="button"
                onClick={args.onNext}
                disabled={args.rowsPerPage === "all" || args.page >= args.totalPages}
                className="rounded-lg border border-black/10 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10"
              >
                Next
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  function renderUserTableRow(row: UserTableRow) {
    const currentDesignationId = assignedDesignationByUserId[row.user_id]?.designation_id ?? null;
    const canEditLevel =
      activeOrgId == null || activeOrgId === 1 ? true : isEziiInvitedSectionRow(row);
    const selectedRoleId =
      rowRoleMap[row.user_id] ??
      assignedRoleIdByUserId[row.user_id] ??
      null;
    const persistedLevel = tierSlugFromUserDesignation(assignedDesignationByUserId[row.user_id]);
    const selectedLevelSlug =
      rowLevelMap[row.user_id] !== undefined ? rowLevelMap[row.user_id]! : persistedLevel;
    const showRemove = isEziiInvitedSectionRow(row);
    return (
      <tr key={row.user_id} className="border-b border-black/5 dark:border-white/5">
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700">
              {initials(row.name)}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.name}</div>
              <div className="text-xs text-slate-500">{row.email}</div>
              <div className="mt-1">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                  Assigned Role: {row.assignedRoleLabel || "—"} | Level: {row.levelLabel || "—"}
                </span>
              </div>
            </div>
          </div>
        </td>
        <td className="px-5 py-4 text-slate-700 dark:text-slate-200">
          {row.department != null && String(row.department).trim()
            ? String(row.department).trim()
            : "—"}
        </td>
        <td className="px-5 py-4">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusPillClass(row.status)}`}>
            {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
          </span>
        </td>
        <td className="px-5 py-4">
          {canEditLevel ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedLevelSlug}
                onChange={(e) => {
                  const nextLevel = e.target.value;
                  setRowLevelMap((prev) => ({
                    ...prev,
                    [row.user_id]: nextLevel,
                  }));
                  if (!isEziiInvitedSectionRow(row) || !nextLevel) return;
                  const matchedRole = roles.find(
                    (r) => String(r.name ?? "").trim().toLowerCase() === nextLevel.trim().toLowerCase()
                  );
                  if (!matchedRole?.id) return;
                  setRowRoleMap((prev) => ({
                    ...prev,
                    [row.user_id]: matchedRole.id,
                  }));
                }}
                className="min-w-[180px] rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
              >
                <option value="">No level</option>
                {LEVEL_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  if (!activeOrgId) return;
                  const source =
                    sourceUsers.find((u) => Number(u.user_id) === row.user_id) ??
                    users.find((u) => Number(u.user_id) === row.user_id) ??
                    null;
                  try {
                    const resolved = await ensureUserExistsForTarget(Number(row.user_id), source, activeOrgId);
                    await setUserDesignation(resolved.userId, {
                      support_level_id: null,
                      organisation_id: activeOrgId,
                    });
                    toast.success("Level cleared.");
                    await loadPageData(activeOrgId);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to clear level");
                  }
                }}
                disabled={currentDesignationId == null}
                className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200"
              >
                Clear
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-500">{row.levelLabel || "—"}</span>
          )}
        </td>
        <td className="px-5 py-4">
          <select
            value={selectedRoleId ?? ""}
            onChange={(e) =>
              setRowRoleMap((prev) => ({
                ...prev,
                [row.user_id]: e.target.value ? Number(e.target.value) : null,
              }))
            }
            className="min-w-[160px] rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/10"
          >
            <option value="">Select role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-5 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            {showRemove ? (
              <button
                type="button"
                onClick={async () => {
                  if (!activeOrgId) return;
                  try {
                    await removeUserScopeOrg(row.user_id, activeOrgId);
                    toast.success("User removed from scope.");
                    await loadPageData(activeOrgId);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to remove user");
                  }
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700"
              >
                Remove
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void openPreview(row)}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200"
            >
              Preview
            </button>
          </div>
        </td>
      </tr>
    );
  }

  const emptySplitHint = searchQuery.trim()
    ? "No rows match this filter."
    : "None yet for this organization.";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-tight text-[#0f172a] dark:text-foreground">
            Users & Roles Management
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-muted-foreground">
            Manage organization-level permissions and user assignments across the ecosystem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSystemAdminUser ? (
            <button
              type="button"
              onClick={() => void handleSyncUsers()}
              className="rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
            >
              Sync Users
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              setInvite((prev) => ({
                ...prev,
                open: true,
                query: "",
                selectedUserIds: [],
                selectedRoleId: customerOrgInviteMode ? defaultCustomerRoleId : recommendedInviteRoleId,
                selectedLevelSlug: "",
              }))
            }
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white shadow-md"
            style={{ backgroundColor: EZII_BRAND.primary }}
          >
            <UserPlus className="h-4 w-4" />
            Invite New User
          </button>
        </div>
      </div>

      <GlassCard className="border-black/10 bg-white/35 p-6 dark:border-white/10 dark:bg-white/[0.06]">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#1E88E5]">
          Active Target Organization
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full max-w-xl">
            {isSystemAdminUser ? (
              <select
                value={String(activeOrgId ?? "")}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setActiveOrgId(Number.isFinite(n) ? n : orgIdNumFromShell);
                }}
                className="w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2.5 text-sm font-semibold text-slate-800 dark:border-white/10 dark:bg-white/10 dark:text-slate-100"
              >
                {orgIdNumFromShell ? (
                  <option value={String(orgIdNumFromShell)}>{orgName}</option>
                ) : null}
                {externalOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.organization_name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2.5 text-sm font-semibold text-slate-800 dark:border-white/10 dark:bg-white/10 dark:text-slate-100">
                {orgName}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            {splitTenantUserSections ? (
              <>
                <div className="rounded-xl border border-black/10 bg-white/65 px-5 py-2 dark:border-white/10 dark:bg-white/10">
                  <div className="text-2xl font-bold text-[#1E88E5]">{customerRows.length}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Customer Users
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 bg-white/65 px-5 py-2 dark:border-white/10 dark:bg-white/10">
                  <div className="text-2xl font-bold text-[#1E88E5]">{eziiInvitedRows.length}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Invited Users (Ezii)
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-black/10 bg-white/65 px-5 py-3 dark:border-white/10 dark:bg-white/10">
                  <div className="text-3xl font-bold text-[#1E88E5]">{visibleRows.length}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total Users</div>
                </div>
                <div className="rounded-xl border border-black/10 bg-white/65 px-5 py-3 dark:border-white/10 dark:bg-white/10">
                  <div className="text-3xl font-bold text-[#1E88E5]">
                    {visibleRows.filter((r) => r.assignedRoleLabel.toLowerCase().includes("admin")).length}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Admins</div>
                </div>
              </>
            )}
          </div>
        </div>
      </GlassCard>

      {isSystemAdminUser &&
      activeOrgId != null &&
      activeOrgId !== 1 &&
      missingInvitedEziiRoles.length > 0 ? (
        <GlassCard className="border border-amber-300/70 bg-amber-50/50 p-4 dark:border-amber-800/60 dark:bg-amber-950/25">
          <p className="text-xs leading-relaxed text-amber-950 dark:text-amber-100">
            <span className="font-semibold">Action required:</span> For this organization, invite at least
            one Ezii user each for <strong>L1</strong>, <strong>L2</strong>, and <strong>L3</strong>. Missing:
            <strong> {missingInvitedEziiRoles.join(", ")}</strong>.
          </p>
        </GlassCard>
      ) : null}

      {isSystemAdminUser && activeOrgId != null && activeOrgId !== 1 && !orgHasLocalUsers ? (
        <GlassCard className="border border-amber-300/70 bg-amber-50/50 p-4 dark:border-amber-800/60 dark:bg-amber-950/25">
          <p className="text-xs leading-relaxed text-amber-950 dark:text-amber-100">
            <span className="font-semibold">This organization has no rows in the ticket users table yet.</span> The list
            below may show people from Ezii (client-worker-master) for reference only. Click{" "}
            <strong>Sync Users</strong> to import <strong>active</strong> employees for the selected org. After a
            successful sync, reopening this org will load from the database only—no extra client-worker-master call.
          </p>
        </GlassCard>
      ) : null}

      {loading ? (
        <GlassCard className="p-6">
          <Loader className="min-h-[50vh]" label="Loading users..." size="sm" />
        </GlassCard>
      ) : error ? (
        <GlassCard className="p-6">
          <div className="text-sm text-red-600">{error}</div>
        </GlassCard>
      ) : (
        <GlassCard className="border-black/10 bg-white/40 p-0 dark:border-white/10 dark:bg-white/[0.06]">
          <div className="border-b border-black/10 px-5 py-4 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative max-w-sm flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by name or email..."
                  className="w-full rounded-xl border border-black/10 bg-white/75 py-2 pl-9 pr-3 text-xs dark:border-white/10 dark:bg-white/10"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleApplyAllChanges()}
                disabled={bulkApplying || pendingChangesCount === 0}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: EZII_BRAND.primary }}
              >
                {bulkApplying ? "Applying..." : `Apply Changes (${pendingChangesCount})`}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 bg-black/[0.04] text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-muted-foreground">
                  <th className="px-5 py-3">User Identity</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Level</th>
                  <th className="px-5 py-3">Assigned Role</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {splitTenantUserSections ? (
                  !visibleRows.length ? (
                    <tr>
                      <td className="px-5 py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                        No users found for selected organization.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {sectionHeadingRow(
                        "Customer users",
                        customerRows.length,
                        customerExpanded,
                        () => setCustomerExpanded((v) => !v)
                      )}
                      {customerExpanded ? (
                        <>
                          {pagedCustomerRows.length ? pagedCustomerRows.map(renderUserTableRow) : null}
                          {!pagedCustomerRows.length ? (
                            <tr>
                              <td className="px-5 py-6 text-center text-xs text-slate-500" colSpan={6}>
                                {emptySplitHint}
                              </td>
                            </tr>
                          ) : null}
                          {sectionPagerRow({
                            sectionName: "Customer",
                            totalRows: customerRows.length,
                            page: customerPage,
                            totalPages: customerTotalPages,
                            rowsPerPage: customerRowsPerPage,
                            onRowsPerPageChange: setCustomerRowsPerPage,
                            onPrev: () => setCustomerPage((p) => Math.max(1, p - 1)),
                            onNext: () => setCustomerPage((p) => Math.min(customerTotalPages, p + 1)),
                          })}
                          <tr>
                            <td colSpan={6} className="h-6 bg-transparent" />
                          </tr>
                        </>
                      ) : null}

                      {sectionHeadingRow(
                        "Invited Ezii users",
                        eziiInvitedRows.length,
                        invitedExpanded,
                        () => setInvitedExpanded((v) => !v)
                      )}
                      {invitedExpanded ? (
                        <>
                          {pagedInvitedRows.length ? pagedInvitedRows.map(renderUserTableRow) : null}
                          {!pagedInvitedRows.length ? (
                            <tr>
                              <td className="px-5 py-6 text-center text-xs text-slate-500" colSpan={6}>
                                {emptySplitHint}
                              </td>
                            </tr>
                          ) : null}
                          {sectionPagerRow({
                            sectionName: "Invited",
                            totalRows: eziiInvitedRows.length,
                            page: invitedPage,
                            totalPages: invitedTotalPages,
                            rowsPerPage: invitedRowsPerPage,
                            onRowsPerPageChange: setInvitedRowsPerPage,
                            onPrev: () => setInvitedPage((p) => Math.max(1, p - 1)),
                            onNext: () => setInvitedPage((p) => Math.min(invitedTotalPages, p + 1)),
                          })}
                        </>
                      ) : null}
                    </>
                  )
                ) : (
                  <>
                    {pagedVisibleRows.map(renderUserTableRow)}
                    {!pagedVisibleRows.length ? (
                      <tr>
                        <td className="px-5 py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                          No users found for selected organization.
                        </td>
                      </tr>
                    ) : null}
                  </>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-5 py-3 text-xs dark:border-white/10">
            {splitTenantUserSections ? (
              <span className="text-slate-600 dark:text-slate-300">
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-slate-600 dark:text-slate-300">Per page</label>
                <select
                  value={rowsPerPage === "all" ? "all" : String(rowsPerPage)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRowsPerPage(v === "all" ? "all" : Number(v));
                  }}
                  className="rounded-lg border border-black/10 bg-white/75 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/10"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="all">All</option>
                </select>
                <span className="text-slate-600 dark:text-slate-300">
                  Showing{" "}
                  {totalRows === 0
                    ? 0
                    : rowsPerPage === "all"
                      ? totalRows
                      : Math.min(totalRows, (currentPage - 1) * rowsPerPage + 1)}
                  -
                  {totalRows === 0
                    ? 0
                    : rowsPerPage === "all"
                      ? totalRows
                      : Math.min(totalRows, currentPage * rowsPerPage)}{" "}
                  of {totalRows}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={rowsPerPage === "all" || currentPage <= 1}
                  className="rounded-lg border border-black/10 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10"
                >
                  Prev
                </button>
                <span className="min-w-[70px] text-center text-slate-600 dark:text-slate-300">
                  Page {rowsPerPage === "all" ? 1 : currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={rowsPerPage === "all" || currentPage >= totalPages}
                  className="rounded-lg border border-black/10 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {invite.open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/10 dark:bg-zinc-950/90">
            <div className="flex items-start justify-between gap-3 border-b border-black/10 px-6 py-5 dark:border-white/10">
              <div>
                <h2 className="text-lg font-bold text-[#111827] dark:text-slate-100">
                  Invite New User to {orgName}
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Add a team member to the organizational directory.
                </p>
                {customerOrgInviteMode ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Showing Ezii HQ (organization 1) users only. The <strong>Level</strong> column is each person&apos;s
                    current tier in org 1; choose a level below to set their tier for <strong>this tenant</strong>.
                    Assigned role in this organization is always <strong>Customer</strong>.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setInvite((prev) => ({ ...prev, open: false }))}
                className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Find User</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={invite.query}
                    onChange={(e) => setInvite((prev) => ({ ...prev, query: e.target.value }))}
                    placeholder="Search users by name or email..."
                    className="w-full rounded-xl border border-black/10 bg-white/75 py-2.5 pl-9 pr-3 text-xs dark:border-white/10 dark:bg-white/10"
                  />
                </div>
              </div>

              <div className="max-h-[220px] overflow-y-auto rounded-xl border border-black/10 bg-white/50 p-2 dark:border-white/10 dark:bg-white/[0.04]">
                {inviteCandidates.map((u) => {
                  const uid = Number(u.user_id);
                  const selected = invite.selectedUserIds.includes(uid);
                  const inviteLevel =
                    customerOrgInviteMode
                      ? tierSlugFromUserDesignation(org1DesignationByUserId[uid]) || "—"
                      : null;
                  return (
                    <button
                      key={u.user_id}
                      type="button"
                      onClick={() =>
                        setInvite((prev) => ({
                          ...prev,
                          selectedUserIds: selected
                            ? prev.selectedUserIds.filter((id) => id !== uid)
                            : [...prev.selectedUserIds, uid],
                        }))
                      }
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${
                        selected ? "bg-[#1E88E5]/10" : "hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{u.name}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                      {customerOrgInviteMode ? (
                        <div className="shrink-0 text-right">
                          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Level</div>
                          <div className="max-w-[120px] truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {inviteLevel}
                          </div>
                        </div>
                      ) : null}
                      <div
                        className={`h-4 w-4 shrink-0 rounded-full border ${
                          selected ? "border-[#1E88E5] bg-[#1E88E5]" : "border-slate-300"
                        }`}
                      />
                    </button>
                  );
                })}
                {!inviteCandidates.length ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">No users found.</div>
                ) : null}
              </div>

              <div>
                {customerOrgInviteMode ? (
                  <>
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Level</div>
                    <select
                      value={invite.selectedLevelSlug}
                      onChange={(e) =>
                        setInvite((prev) => ({
                          ...prev,
                          selectedLevelSlug: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-black/10 bg-white/75 px-3 py-2.5 text-xs dark:border-white/10 dark:bg-white/10"
                    >
                      <option value="">Select level</option>
                      {LEVEL_SLUGS.map((slug) => (
                        <option key={slug} value={slug}>
                          {slug}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Assigned role in this organization is fixed to <strong>Customer</strong>. Level is saved for this
                      tenant (L1 / L2 / L3).
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Assigned Role</div>
                    <select
                      value={invite.selectedRoleId ?? ""}
                      onChange={(e) =>
                        setInvite((prev) => ({
                          ...prev,
                          selectedRoleId: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-black/10 bg-white/75 px-3 py-2.5 text-xs dark:border-white/10 dark:bg-white/10"
                    >
                      <option value="">Select role</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs italic text-slate-500">
                      Role list is loaded for selected org and includes custom roles when present.
                    </p>
                  </>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Selected users: {invite.selectedUserIds.length}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setInvite((prev) => ({ ...prev, open: false }))}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-700 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={invite.saving}
                onClick={() => void handleInviteSubmit()}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: EZII_BRAND.primary }}
              >
                {invite.saving ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {(previewLoading || preview) ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/10 dark:bg-zinc-950/90">
            <div className="flex items-start justify-between gap-3 border-b border-black/10 px-6 py-5 dark:border-white/10">
              <div>
                <h2 className="text-lg font-bold text-[#111827] dark:text-slate-100">
                  Effective Access Preview
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Merged Assigned Role + Level + Override permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setPreviewLoading(false);
                }}
                className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-6 py-5">
              {previewLoading ? (
                <div className="text-xs text-slate-500">Loading preview...</div>
              ) : preview ? (
                <>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    User: <strong>{preview.userName}</strong> ({preview.userId}) | Assigned Role:{" "}
                    <strong>{preview.roleName}</strong> | Level:{" "}
                    <strong>{preview.levelName ?? "—"}</strong> | Overrides:{" "}
                    <strong>{preview.overrideCount}</strong>
                  </div>
                  {preview.overrideCount === 0 ? (
                    <div className="rounded-xl border border-amber-300/70 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                      No user-level overrides found for this user in current organization. Effective access is from
                      Assigned Role + Level merge.
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-3">
                    <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/10">
                      <div className="text-slate-500">Ticket Access</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {String(preview.permissionsJson.ticket_access ?? "own_tickets")}
                      </div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/10">
                      <div className="text-slate-500">Assign Scope</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {String(preview.permissionsJson.assign_scope ?? "none")}
                      </div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/10">
                      <div className="text-slate-500">Can Assign</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {preview.permissionsJson.can_assign ? "Yes" : "No"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/10">
                      <div className="text-slate-500">Can Resolve</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {preview.permissionsJson.can_resolve ? "Yes" : "No"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/10">
                      <div className="text-slate-500">Tier1 SLA</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {String(preview.permissionsJson.tier1_sla_config ?? "none")}
                      </div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/10">
                      <div className="text-slate-500">Tier2 SLA</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {String(preview.permissionsJson.tier2_sla_config ?? "none")}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/10">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Screen Access
                    </div>
                    <div className="max-h-[220px] overflow-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-black/10 dark:border-white/10">
                            <th className="py-1.5">Screen</th>
                            <th className="py-1.5">View</th>
                            <th className="py-1.5">Modify</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(
                            (preview.permissionsJson.screen_access as Record<
                              string,
                              { view?: boolean; modify?: boolean }
                            >) ?? {}
                          ).map(([screenKey, access]) => (
                            <tr key={screenKey} className="border-b border-black/5 dark:border-white/5">
                              <td className="py-1.5">{screenKey}</td>
                              <td className="py-1.5">{access?.view ? "Yes" : "No"}</td>
                              <td className="py-1.5">{access?.modify ? "Yes" : "No"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

