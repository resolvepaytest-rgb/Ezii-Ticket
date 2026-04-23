import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { InstantTooltip } from "@components/common/InstantTooltip";
import {
  createUser,
  getUserDesignation,
  getAgentsTicketMetrics,
  getExternalOrganizations,
  syncAttendanceOooFromLeave,
  listDesignations,
  listOrganisationUserDirectory,
  listRoles,
  listProducts,
  listQueues,
  listInvitedAgentUsers,
  listTeamMembers,
  listTeams,
  listUserRoles,
  listUsers,
  setUserDesignation,
  setUserRoles,
  updateUser,
  type Designation,
  type ExternalOrganization,
  type OrgDirectoryUser,
  type Role,
  type User,
  type UserDesignation,
} from "@api/adminApi";
import { useAuthStore } from "@store/useAuthStore";
import { useScreenModifyAccess } from "@hooks/useScreenModifyAccess";
import { EZII_BRAND } from "@/lib/eziiBrand";
import {
  Activity,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Filter,
  RefreshCw,
  Search,
  Star,
  UserPlus,
  Users,
  X,
} from "lucide-react";

/** Ezii HQ org id — same as Users & Roles “invited” semantics (`origin_org_id === 1`). */
const EZII_ORG_ID = 1;

const EZII_HQ_ORG_LABEL = "Resolve Biz Services Pvt Ltd";

type TierFilter = "all" | "L1" | "L2" | "L3";
type StatusFilter = "all" | "active" | "online" | "offline";
type InviteState = {
  open: boolean;
  query: string;
  selectedUserIds: number[];
  selectedRoleId: number | null;
  selectedLevelKey: string;
  saving: boolean;
};
const LEVEL_KEYS = ["l1", "l2", "l3"] as const;

type AgentRow = {
  id: number;
  name: string;
  email: string;
  personType: "internal" | "customer";
  status: string;
  tier: "L1" | "L2" | "L3";
  roleLabel: string;
  assignedProducts: string[];
  productWorkloads: Array<{
    productName: string;
    current: number;
    cap: number | null;
  }>;
  workloadCurrent: number;
  /** Sum of finite product caps; null when any assigned product is uncapped/unlimited. */
  workloadCap: number | null;
  /** Average CSAT from resolved/closed tickets with `metadata_json.csat_score`; null if none. */
  csat: number | null;
  online: boolean;
  outOfOffice: boolean;
  oooStartDate: string | null;
  oooEndDate: string | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "A"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function normalizeLevelKey(name: string | null | undefined): string {
  if (!name) return "";
  const n = name.trim().toLowerCase();
  if (n === "l1" || n === "l1_agent") return "l1";
  if (n === "l2" || n === "l2_specialist") return "l2";
  if (n === "l3" || n === "l3_engineer") return "l3";
  return "";
}

function inferTier(designation: UserDesignation | null | undefined): "L1" | "L2" | "L3" {
  const key = normalizeLevelKey(
    designation?.support_level_code ??
      designation?.support_level_name ??
      designation?.designation_code ??
      designation?.designation_name
  );
  if (key === "l3") return "L3";
  if (key === "l2") return "L2";
  return "L1";
}

function levelLabelFromKey(key: string | null | undefined): string {
  if (key === "l1") return "L1";
  if (key === "l2") return "L2";
  if (key === "l3") return "L3";
  return "—";
}

function supportLevelIdFromKey(designations: Designation[], key: string): number | null {
  const match = designations.find((d) => {
    const candidates = [normalizeLevelKey(d.code), normalizeLevelKey(d.name)];
    return candidates.includes(key);
  });
  return match?.id ?? null;
}

function isLegacyLevelRoleName(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  return n === "l1_agent" || n === "l2_specialist" || n === "l3_engineer";
}

function tierLabel(tier: "L1" | "L2" | "L3") {
  return `TIER ${tier}`;
}

function workloadColor(percent: number) {
  if (percent >= 75) return "bg-red-500";
  if (percent >= 45) return "bg-amber-500";
  return "bg-[#1E88E5]";
}

function mergeCap(current: number | null | undefined, next: number | null): number | null {
  if (next == null) return current ?? null;
  if (!Number.isFinite(next) || next < 0) return current ?? null;
  if (current == null || !Number.isFinite(current)) return next;
  return Math.min(current, next);
}

function overallTicketCap(caps: (number | null)[]): number | null {
  if (caps.length === 0) return null;
  if (caps.some((c) => c == null)) return null;
  const finite = caps.filter((c): c is number => c != null && Number.isFinite(c) && c >= 0);
  if (finite.length === 0) return null;
  return finite.reduce((sum, cap) => sum + cap, 0);
}

export function AgentsPage({ orgId }: { orgId: string }) {
  const authUser = useAuthStore((s) => s.user);
  const shellOrgId = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);

  const isSystemAdminUser =
    authUser?.role_name === "admin" &&
    authUser?.org_id === "1" &&
    authUser?.user_id === "1" &&
    authUser?.role_id === "1" &&
    authUser?.user_type_id === "1";
  const canModify = useScreenModifyAccess("agent");
  const modifyAccessMessage = "You don't have modify access";

  const [activeOrgId, setActiveOrgId] = useState<number | null>(shellOrgId);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [sourceUsers, setSourceUsers] = useState<User[]>([]);
  const [targetUsers, setTargetUsers] = useState<User[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<OrgDirectoryUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [productFilter, setProductFilter] = useState<string | "all">("all");
  const [agentSearch, setAgentSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [listVersion, setListVersion] = useState(0);
  const [oooBusyId, setOooBusyId] = useState<number | null>(null);
  const [oooRangeBusyId, setOooRangeBusyId] = useState<number | null>(null);
  const [oooDraftByUserId, setOooDraftByUserId] = useState<Record<number, { start: string; end: string }>>({});
  const [expandedOooRanges, setExpandedOooRanges] = useState<Set<number>>(new Set());
  const [expandedWorkloads, setExpandedWorkloads] = useState<Set<number>>(new Set());
  const [oooSyncBusy, setOooSyncBusy] = useState(false);
  const [invite, setInvite] = useState<InviteState>({
    open: false,
    query: "",
    selectedUserIds: [],
    selectedRoleId: null,
    selectedLevelKey: "",
    saving: false,
  });

  useEffect(() => {
    setActiveOrgId(shellOrgId);
  }, [shellOrgId]);

  useEffect(() => {
    if (!isSystemAdminUser) return;
    void getExternalOrganizations()
      .then((list) => setExternalOrgs(list))
      .catch(() => setExternalOrgs([]));
  }, [isSystemAdminUser]);

  useEffect(() => {
    if (!activeOrgId) return;
    setLoading(true);
    void (async () => {
      try {
        const customerOrgInviteMode = isSystemAdminUser && activeOrgId !== EZII_ORG_ID;
        const [usersRes, invitedUsersRes, sourceUsersRes, rolesRes, designationsRes, directoryBundle, productsRes, teamsRes, queuesRes, ticketMetrics] = await Promise.all([
          listUsers(activeOrgId).catch(() => [] as User[]),
          activeOrgId !== EZII_ORG_ID ? listInvitedAgentUsers(activeOrgId) : Promise.resolve([] as User[]),
          listUsers(activeOrgId === EZII_ORG_ID ? activeOrgId : EZII_ORG_ID).catch(() => [] as User[]),
          listRoles(activeOrgId).catch(() => [] as Role[]),
          listDesignations(activeOrgId).catch(() => [] as Designation[]),
          customerOrgInviteMode
            ? listOrganisationUserDirectory(activeOrgId, true).catch(() => ({ users: [] as OrgDirectoryUser[], has_local_users: true }))
            : Promise.resolve({ users: [] as OrgDirectoryUser[], has_local_users: true }),
          listProducts(),
          listTeams(activeOrgId),
          listQueues(activeOrgId),
          getAgentsTicketMetrics(activeOrgId).catch(() => []),
        ]);
        const metricsByUserId = new Map(
          ticketMetrics.map((m) => [m.user_id, m] as const)
        );

        // HQ: show org users. Tenant: merge local customer users + HQ-stored invited users.
        const usersForAgents = (() => {
          if (activeOrgId === EZII_ORG_ID) return usersRes;
          const merged = new Map<number, User>();
          for (const u of usersRes) merged.set(Number(u.user_id), u);
          for (const u of invitedUsersRes) {
            const uid = Number(u.user_id);
            if (!merged.has(uid)) merged.set(uid, u);
          }
          return Array.from(merged.values());
        })();
        const invitedEziiUserIdSet = new Set(
          directoryBundle.users
            .filter(
              (d) =>
                Number(d.scope_org_id) === activeOrgId &&
                Number(d.origin_org_id) === EZII_ORG_ID
            )
            .map((d) => Number(d.user_id))
        );
        setTargetUsers(usersForAgents);
        setSourceUsers(sourceUsersRes);
        setRoles(rolesRes);
        setDesignations(designationsRes);
        setDirectoryUsers(directoryBundle.users);

        const productNameById = new Map<number, string>();
        for (const p of productsRes) productNameById.set(p.id, p.name);

        // Product ownership from queue/team relation:
        // user -> team_member -> team -> queues(team_id) -> product_id.
        const queueProductsByTeamId = new Map<number, Set<string>>();
        for (const q of queuesRes) {
          if (!q.team_id) continue;
          if (!queueProductsByTeamId.has(q.team_id)) queueProductsByTeamId.set(q.team_id, new Set<string>());
          const bucket = queueProductsByTeamId.get(q.team_id)!;
          if (q.product_id && productNameById.has(q.product_id)) bucket.add(productNameById.get(q.product_id)!);
        }

        const membersByTeamId = await Promise.allSettled(
          teamsRes.map(async (team) => ({ team, members: await listTeamMembers(team.id) }))
        );
        const userProducts = new Map<number, Set<string>>();
        const userProductCapsByUserId = new Map<number, Map<string, number | null>>();
        for (const item of membersByTeamId) {
          if (item.status !== "fulfilled") continue;
          const { team, members } = item.value;
          const fromQueues = queueProductsByTeamId.get(team.id) ?? new Set<string>();
          const fallbackTeamProduct =
            team.product_id && productNameById.has(team.product_id)
              ? [productNameById.get(team.product_id)!]
              : [];
          const productNames = fromQueues.size > 0 ? Array.from(fromQueues) : fallbackTeamProduct;

          for (const m of members) {
            const uid = Number(m.user_id);
            if (!userProducts.has(uid)) userProducts.set(uid, new Set<string>());
            const bucket = userProducts.get(uid)!;
            for (const pn of productNames) bucket.add(pn);

            if (!userProductCapsByUserId.has(uid)) userProductCapsByUserId.set(uid, new Map<string, number | null>());
            const capBucket = userProductCapsByUserId.get(uid)!;
            for (const pn of productNames) {
              capBucket.set(pn, mergeCap(capBucket.get(pn), m.max_open_tickets_cap ?? null));
            }
          }
        }

        const mappedRaw = await Promise.all(
          usersForAgents.map(async (u) => {
            let roleName = "Support Associate";
            let designation: UserDesignation | null = null;
            let roleRows: Awaited<ReturnType<typeof listUserRoles>> = [];
            try {
              const [resolvedRoles, resolvedDesignation] = await Promise.all([
                listUserRoles(Number(u.user_id)),
                getUserDesignation(Number(u.user_id), activeOrgId).catch(() => null),
              ]);
              roleRows = resolvedRoles;
              const scoped = resolvedRoles.find((r) => Number(r.scope_organisation_id) === activeOrgId);
              const global = resolvedRoles.find((r) => r.scope_organisation_id == null);
              roleName = scoped?.role_name ?? global?.role_name ?? roleName;
              designation = resolvedDesignation;
            } catch {
              // keep fallback role
            }

            const tier = inferTier(designation);
            const uid = Number(u.user_id);
            const personType: AgentRow["personType"] =
              activeOrgId === EZII_ORG_ID ||
              invitedEziiUserIdSet.has(uid)
                ? "internal"
                : "customer";
            const metrics = metricsByUserId.get(uid);
            const workloadCurrent = metrics?.open_count ?? 0;
            const productCaps = userProductCapsByUserId.get(uid) ?? new Map<string, number | null>();
            const openByProduct = new Map<string, number>();
            for (const entry of metrics?.open_by_product ?? []) {
              const productName = String(entry.product_name ?? "").trim();
              if (!productName) continue;
              openByProduct.set(productName, Number(entry.open_count) || 0);
            }
            const csat = metrics?.csat_avg ?? null;
            const active = String(u.status).toLowerCase() === "active";
            const online = active && !u.out_of_office;
            const assignedProducts = Array.from(userProducts.get(Number(u.user_id)) ?? []);
            const workloadProductNames = Array.from(new Set([...assignedProducts, ...Array.from(openByProduct.keys())]))
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
            const productWorkloads = workloadProductNames.map((productName) => ({
              productName,
              current: openByProduct.get(productName) ?? 0,
              cap: productCaps.get(productName) ?? null,
            }));
            const workloadCap = overallTicketCap(productWorkloads.map((p) => p.cap));

            const row: AgentRow = {
              id: Number(u.user_id),
              name: u.name || `User ${u.user_id}`,
              email: u.email || "-",
              personType,
              status: u.status || "active",
              tier,
              roleLabel: roleName,
              assignedProducts,
              productWorkloads,
              workloadCurrent,
              workloadCap,
              csat,
              online,
              outOfOffice: Boolean(u.out_of_office),
              oooStartDate: typeof u.ooo_start_date === "string" ? u.ooo_start_date : null,
              oooEndDate: typeof u.ooo_end_date === "string" ? u.ooo_end_date : null,
            };
            const hasLevelAssigned = normalizeLevelKey(
              designation?.support_level_code ??
              designation?.support_level_name ??
              designation?.designation_code ??
              designation?.designation_name
            ) !== "";
            const hasAgentRole = roleRows.some((role) => {
              const inScope = Number(role.scope_organisation_id) === activeOrgId || role.scope_organisation_id == null;
              return inScope && String(role.role_name ?? "").trim().toLowerCase() === "agent";
            });
            return {
              row,
              hasLevelAssigned,
              hasAgentRole,
            };
          })
        );

        const mapped =
          activeOrgId === EZII_ORG_ID
            ? mappedRaw.map((entry) => entry.row)
            : mappedRaw
                .filter((entry) => entry.hasAgentRole || entry.hasLevelAssigned)
                .map((entry) => entry.row);
        setRows(mapped);
      } catch {
        setRows([]);
        setRoles([]);
        setDesignations([]);
        setSourceUsers([]);
        setTargetUsers([]);
        setDirectoryUsers([]);
        toast.error("Failed to load agents.");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeOrgId, isSystemAdminUser, listVersion]);

  const toggleOutOfOffice = async (userId: number, next: boolean) => {
    setOooBusyId(userId);
    try {
      await updateUser(userId, { out_of_office: next });
      toast.success(next ? "Marked out of office (excluded from auto-assign)" : "Cleared out of office");
      setListVersion((v) => v + 1);
    } catch {
      toast.error("Failed to update out of office");
    } finally {
      setOooBusyId(null);
    }
  };

  const handleSyncAttendanceOoo = async () => {
    if (!activeOrgId || oooSyncBusy) return;
    setOooSyncBusy(true);
    try {
      const summary = await syncAttendanceOooFromLeave(activeOrgId);
      toast.success(
        `Leave sync (${summary.start_date} → ${summary.end_date}): ${summary.users_with_leave} user(s) with leave, ${summary.updatedTrue} newly OOO today, ${summary.updatedFalse} cleared, ${summary.rowsFromApi} API row(s).`
      );
      setListVersion((v) => v + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Attendance OOO sync failed");
    } finally {
      setOooSyncBusy(false);
    }
  };

  const saveOutOfOfficeRange = async (userId: number, start: string, end: string) => {
    const normStart = start.trim();
    const normEnd = end.trim();
    if ((normStart && !normEnd) || (!normStart && normEnd)) {
      toast.error("Please choose both OOO start and end date.");
      return;
    }
    if (normStart && normEnd && normStart > normEnd) {
      toast.error("OOO start date cannot be after end date.");
      return;
    }
    setOooRangeBusyId(userId);
    try {
      await updateUser(userId, {
        ooo_start_date: normStart || null,
        ooo_end_date: normEnd || null,
      });
      toast.success(normStart ? "OOO date range saved." : "OOO date range cleared.");
      setListVersion((v) => v + 1);
    } catch {
      toast.error("Failed to save OOO date range");
    } finally {
      setOooRangeBusyId(null);
    }
  };

  const assignedProductOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows.flatMap((r) =>
            r.assignedProducts.map((name) => name.trim()).filter(Boolean)
          )
        )
      ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [rows]
  );

  const filtered = useMemo(() => {
    const normalizedSelectedProductName =
      productFilter === "all" ? null : productFilter.trim().toLowerCase();
    const normalizedSearch = agentSearch.trim().toLowerCase();

    const base = rows.filter((r) => {
      if (normalizedSearch) {
        const haystack = `${r.name} ${r.email}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      if (tierFilter !== "all" && r.tier !== tierFilter) return false;
      if (statusFilter === "online" && !r.online) return false;
      if (statusFilter === "offline" && r.online) return false;
      if (statusFilter === "active" && String(r.status).toLowerCase() !== "active") return false;
      if (normalizedSelectedProductName) {
        const hasSelectedProduct = r.assignedProducts.some(
          (name) => name.trim().toLowerCase() === normalizedSelectedProductName
        );
        if (!hasSelectedProduct) return false;
      }
      return true;
    });
    return [...base].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [rows, tierFilter, statusFilter, productFilter, agentSearch]);

  const effectivePageSize = pageSize === "all" ? Math.max(1, filtered.length || 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  const pageRows = useMemo(() => {
    if (pageSize === "all") return filtered;
    const start = (page - 1) * effectivePageSize;
    return filtered.slice(start, start + effectivePageSize);
  }, [filtered, page, pageSize, effectivePageSize]);

  useEffect(() => {
    setPage(1);
  }, [tierFilter, productFilter, statusFilter, pageSize, activeOrgId, agentSearch]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const kpis = useMemo(() => {
    const totalAgents = rows.length;
    const onlineNow = rows.filter((r) => r.online).length;
    const withCsat = rows.filter((r) => r.csat != null);
    const avgCsat =
      withCsat.length > 0 ? withCsat.reduce((s, r) => s + (r.csat as number), 0) / withCsat.length : null;
    const withCap = rows.filter((r) => r.workloadCap != null && r.workloadCap > 0);
    const avgWorkloadUtil =
      withCap.length > 0
        ? withCap.reduce((s, r) => s + r.workloadCurrent / (r.workloadCap as number), 0) / withCap.length
        : null;
    const onlinePct = totalAgents > 0 ? Math.round((onlineNow / totalAgents) * 100) : 0;
    return { totalAgents, onlineNow, avgCsat, avgWorkloadUtil, onlinePct };
  }, [rows]);

  /** System-admin org switcher: include Ezii HQ (org 1) with a fixed display name; API list is tenant orgs only. */
  const orgDropdownOptions = useMemo((): ExternalOrganization[] => {
    const hq: ExternalOrganization = {
      id: String(EZII_ORG_ID),
      organization_name: EZII_HQ_ORG_LABEL,
    };
    const rest = externalOrgs.filter((o) => String(o.id) !== String(EZII_ORG_ID));
    return [hq, ...rest];
  }, [externalOrgs]);

  const customerOrgInviteMode =
    isSystemAdminUser && activeOrgId != null && activeOrgId !== EZII_ORG_ID;
  const assignableRoles = useMemo(
    () => roles.filter((r) => !isLegacyLevelRoleName(r.name)),
    [roles]
  );
  const defaultAgentRoleId = useMemo(() => {
    const role = roles.find(
      (r) => String(r.name ?? "").trim().toLowerCase() === "agent"
    );
    return role ? Number(role.id) : null;
  }, [roles]);
  const recommendedInviteRoleId = useMemo(() => defaultAgentRoleId, [defaultAgentRoleId]);
  const levelOptions = useMemo(() => {
    const fromBackend = designations
      .map((d) => {
        const key = normalizeLevelKey(d.code ?? d.name);
        if (!key) return null;
        return {
          key,
          label: String(d.name ?? d.code ?? levelLabelFromKey(key)),
        };
      })
      .filter((option): option is { key: string; label: string } => option != null);
    if (fromBackend.length > 0) return fromBackend;
    return LEVEL_KEYS.map((key) => ({ key, label: levelLabelFromKey(key) }));
  }, [designations]);
  const orgName = useMemo(() => {
    if (activeOrgId === EZII_ORG_ID) return EZII_HQ_ORG_LABEL;
    return (
      orgDropdownOptions.find((o) => Number(o.id) === activeOrgId)?.organization_name ??
      `Organization ${activeOrgId ?? ""}`
    );
  }, [activeOrgId, orgDropdownOptions]);
  const inviteCandidates = useMemo(() => {
    const q = invite.query.trim().toLowerCase();
    const mergedById = new Map<number, User>();
    for (const u of sourceUsers) mergedById.set(Number(u.user_id), u);
    if (customerOrgInviteMode) {
      for (const d of directoryUsers) {
        const uid = Number(d.user_id);
        if (mergedById.has(uid) || Number(d.origin_org_id) !== EZII_ORG_ID) continue;
        mergedById.set(uid, {
          id: uid,
          user_id: uid,
          organisation_id: EZII_ORG_ID,
          name: d.name,
          email: d.email,
          phone: null,
          user_type: null,
          status: "active",
        });
      }
    } else {
      for (const u of targetUsers) {
        const uid = Number(u.user_id);
        if (!mergedById.has(uid)) mergedById.set(uid, u);
      }
    }
    const all = Array.from(mergedById.values());
    const rows = q
      ? all.filter(
          (u) =>
            (u.name ?? "").toLowerCase().includes(q) ||
            (u.email ?? "").toLowerCase().includes(q) ||
            String(u.user_id).includes(q)
        )
      : all;
    rows.sort((a, b) =>
      (a.name ?? "").trim().localeCompare((b.name ?? "").trim(), undefined, {
        sensitivity: "base",
      })
    );
    return rows;
  }, [sourceUsers, directoryUsers, targetUsers, invite.query, customerOrgInviteMode]);

  async function ensureUserExistsForTarget(
    userId: number,
    selected: Pick<User, "user_id" | "organisation_id" | "name" | "email" | "phone" | "user_type" | "status"> | null,
    targetOrgId: number
  ) {
    const scopedMode = isSystemAdminUser && targetOrgId !== EZII_ORG_ID;
    const createInOrgId = scopedMode ? EZII_ORG_ID : targetOrgId;
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
    return { userId, scopeOrgId: scopedMode ? targetOrgId : undefined };
  }

  async function handleInviteSubmit() {
    if (!activeOrgId) return;
    if (!invite.selectedUserIds.length) return toast.error("Select at least one user");
    if (customerOrgInviteMode) {
      const levelKey = invite.selectedLevelKey.trim();
      if (!levelKey || !LEVEL_KEYS.includes(levelKey as (typeof LEVEL_KEYS)[number])) {
        return toast.error("Select a level (L1 / L2 / L3)");
      }
      if (defaultAgentRoleId == null) return toast.error("Agent role not found for this organization.");
    } else if (!invite.selectedRoleId) {
      return toast.error("Select a role");
    }

    setInvite((prev) => ({ ...prev, saving: true }));
    try {
      let inviteBatchSupportLevelId: number | null = null;
      if (customerOrgInviteMode) {
        inviteBatchSupportLevelId = supportLevelIdFromKey(
          designations,
          invite.selectedLevelKey.trim() as (typeof LEVEL_KEYS)[number]
        );
        if (inviteBatchSupportLevelId == null) {
          throw new Error("Level options are not configured for this organization.");
        }
      }

      let processed = 0;
      for (const selectedUserId of invite.selectedUserIds) {
        const selectedUser =
          sourceUsers.find((u) => Number(u.user_id) === selectedUserId) ??
          targetUsers.find((u) => Number(u.user_id) === selectedUserId) ??
          null;
        if (!selectedUser) continue;
        const resolved = await ensureUserExistsForTarget(
          Number(selectedUser.user_id),
          selectedUser,
          activeOrgId
        );
        if (customerOrgInviteMode) {
          await setUserRoles(resolved.userId, [defaultAgentRoleId!], resolved.scopeOrgId);
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
        selectedLevelKey: "",
        saving: false,
      });
      setListVersion((v) => v + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite user");
      setInvite((prev) => ({ ...prev, saving: false }));
    }
  }

  return (
    <div className="mx-auto max-w-[1300px] min-w-0 space-y-3 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Agents Management</h1>
          <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
            Monitor team performance and distribution across all support tiers.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {isSystemAdminUser ? (
            <label className="inline-flex items-center gap-1 rounded-xl border border-black/10 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
              Org:
              <select
                value={String(activeOrgId ?? "")}
                onChange={(e) => setActiveOrgId(Number(e.target.value))}
                className="bg-transparent outline-none"
              >
                {orgDropdownOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.organization_name}</option>
                ))}
              </select>
            </label>
          ) : null}

          <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
            <button
              type="button"
              disabled={!canModify}
              onClick={() =>
                setInvite((prev) => ({
                  ...prev,
                  open: true,
                  query: "",
                  selectedUserIds: [],
                  selectedRoleId: customerOrgInviteMode ? defaultAgentRoleId : recommendedInviteRoleId,
                  selectedLevelKey: "",
                }))
              }
              className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: EZII_BRAND.primary }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invite New Agent
            </button>
          </InstantTooltip>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="border-black/10 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <div className="flex items-start justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Total Agents</div>
            <div className="rounded-xl bg-[#1E88E5]/15 p-1.5 text-[#1E88E5]"><Users className="h-3.5 w-3.5" /></div>
          </div>
          <div className="mt-1.5 text-3xl font-semibold text-slate-900 dark:text-slate-100">{kpis.totalAgents}</div>
          <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">In selected organisation</div>
        </GlassCard>
        <GlassCard className="border-black/10 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <div className="flex items-start justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Online Now</div>
            <div className="rounded-xl bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300"><Activity className="h-3.5 w-3.5" /></div>
          </div>
          <div className="mt-1.5 text-3xl font-semibold text-slate-900 dark:text-slate-100">{kpis.onlineNow}</div>
          <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">{kpis.onlinePct}% of agents (active, not OOO)</div>
        </GlassCard>
        <GlassCard className="border-black/10 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <div className="flex items-start justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Avg. CSAT Score</div>
            <div className="rounded-xl bg-blue-100 p-1.5 text-blue-700 dark:bg-blue-400/20 dark:text-blue-300"><Star className="h-3.5 w-3.5" /></div>
          </div>
          <div className="mt-1.5 text-3xl font-semibold text-slate-900 dark:text-slate-100">
            {kpis.avgCsat == null ? "—" : kpis.avgCsat.toFixed(2)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">From ticket CSAT scores (1–5)</div>
        </GlassCard>
        <GlassCard className="border-black/10 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <div className="flex items-start justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Avg. Workload</div>
            <div className="rounded-xl bg-red-100 p-1.5 text-red-700 dark:bg-red-400/20 dark:text-red-300"><CalendarClock className="h-3.5 w-3.5" /></div>
          </div>
          <div className="mt-1.5 text-3xl font-semibold text-slate-900 dark:text-slate-100">
            {kpis.avgWorkloadUtil == null ? "—" : `${Math.round(kpis.avgWorkloadUtil * 100)}%`}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">Avg. of open tickets vs cap (agents with a cap)</div>
        </GlassCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1 text-xs dark:bg-white/[0.08]">
          {(["all", "L1", "L2", "L3"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTierFilter(t)}
                className={`rounded-xl px-3 py-1 font-semibold ${
                tierFilter === t ? "bg-white text-slate-800 shadow-sm dark:bg-white/15 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {t === "all" ? "All Tiers" : `${t} Support`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <InstantTooltip
            disabled={!canModify}
            message={
              canModify
                ? "Sync approved leave from attendance API and refresh OOO. Org 1: all users in the org. Other orgs: users with an assigned support level only."
                : modifyAccessMessage
            }
          >
            <button
              type="button"
              disabled={!canModify || !activeOrgId || oooSyncBusy}
              onClick={() => void handleSyncAttendanceOoo()}
              className="inline-flex items-center gap-1 rounded-xl border border-black/10 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/[0.14]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${oooSyncBusy ? "animate-spin" : ""}`} />
              {oooSyncBusy ? "Syncing…" : "Sync leave"}
            </button>
          </InstantTooltip>
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
            <Search className="h-3.5 w-3.5" />
            <input
              type="text"
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              placeholder="Search Agent Name or Email"
              className="w-[180px] bg-transparent text-[11px] font-medium outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
            <Filter className="h-3.5 w-3.5" />
            Assigned Products:
            <select
              value={String(productFilter)}
              onChange={(e) =>
                setProductFilter(e.target.value === "all" ? "all" : e.target.value)
              }
              className="bg-transparent outline-none"
            >
              <option value="all">All</option>
              {assignedProductOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
            <Activity className="h-3.5 w-3.5" />
            Status:
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-transparent outline-none"
            >
              <option value="all">All</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </label>

        </div>
      </div>

      <GlassCard className="min-w-0 overflow-hidden border-black/10 bg-white/75 p-0 dark:border-white/10 dark:bg-white/[0.05]">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-slate-50/90 dark:bg-white/[0.03]">
              <tr className="text-left uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 text-[10px] font-semibold">Agent Name</th>
                <th className="px-4 py-3 text-[10px] font-semibold">Role & Tier</th>
                <th className="px-4 py-3 text-[10px] font-semibold">Assigned Products</th>
                <th className="px-4 py-3 text-[10px] font-semibold">Workload</th>
                <th className="px-4 py-3 text-[10px] font-semibold">CSAT</th>
                <th className="px-4 py-3 text-[10px] font-semibold">Status</th>
                <th className="px-4 py-3 text-[10px] font-semibold">Out Of Office</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                    <Loader size="sm" label="Loading agents..." />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                    No agents found.
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const isWorkloadExpanded = expandedWorkloads.has(r.id);
                  const workloadPct =
                    r.workloadCap != null && r.workloadCap > 0
                      ? Math.round((r.workloadCurrent / r.workloadCap) * 100)
                      : null;
                  return (
                    <tr key={r.id} className="border-t border-black/5 align-top dark:border-white/10">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1E88E5]/15 text-[11px] font-bold text-[#1E88E5]">
                            {initials(r.name)}
                          </div>
                          <div>
                            <div className="flex items-center justify-between ">
                              <div className="font-semibold text-slate-800 dark:text-slate-100">{r.name}</div>
                              <span
                                className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                  r.personType === "internal"
                                    ? "bg-violet-100 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300"
                                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300"
                                }`}
                              >
                                {r.personType === "internal" ? "Internal" : "Customer"}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{r.roleLabel}</div>
                        <div className="text-[10px] font-bold text-[#1E88E5]">{tierLabel(r.tier)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.assignedProducts.length === 0 ? (
                            <span className="text-[11px] text-slate-400">—</span>
                          ) : (
                            r.assignedProducts.map((p) => (
                              <span key={`${r.id}-${p}`} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-400/20 dark:text-blue-300">
                                {p}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          <span>
                            {r.workloadCurrent} / {r.workloadCap == null ? "—" : r.workloadCap}{" "}
                            {workloadPct != null ? (
                              <span className="ml-2 text-[#1E88E5]">{workloadPct}%</span>
                            ) : (
                              <span className="ml-2 text-slate-400">Mixed/No cap</span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-4 w-4 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
                            onClick={() =>
                              setExpandedWorkloads((prev) => {
                                const next = new Set(prev);
                                if (next.has(r.id)) next.delete(r.id);
                                else next.add(r.id);
                                return next;
                              })
                            }
                            aria-label={isWorkloadExpanded ? "Collapse product workload" : "Expand product workload"}
                            title={isWorkloadExpanded ? "Collapse product workload" : "Expand product workload"}
                          >
                            {isWorkloadExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        </div>
                        <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-200 dark:bg-white/15">
                          <div
                            className={`h-1.5 rounded-full ${workloadPct != null ? workloadColor(workloadPct) : "bg-slate-300 dark:bg-white/25"}`}
                            style={{ width: `${workloadPct != null ? Math.min(100, workloadPct) : 0}%` }}
                          />
                        </div>
                        {isWorkloadExpanded ? (
                          <div className="mt-2 space-y-1">
                            {r.productWorkloads.length === 0 ? (
                              <div className="text-[10px] text-slate-400">No product allocation</div>
                            ) : (
                              r.productWorkloads.map((pw) => {
                                const productPct =
                                  pw.cap != null && pw.cap > 0 ? Math.round((pw.current / pw.cap) * 100) : null;
                                return (
                                  <div key={`${r.id}-${pw.productName}`} className="flex items-center justify-between gap-2 text-[10px]">
                                    <span className="truncate text-slate-500 dark:text-slate-400">{pw.productName}</span>
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                                      {pw.current}/{pw.cap == null ? "—" : pw.cap}
                                      {productPct != null ? (
                                        <span className="ml-1 text-[#1E88E5]">{productPct}%</span>
                                      ) : null}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-base font-semibold text-slate-800 dark:text-slate-100">
                        {r.csat == null ? "—" : r.csat.toFixed(1)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${r.online ? "text-[#1E88E5]" : "text-slate-400"}`}>
                          <CircleStatus online={r.online} />
                          {r.online ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={r.outOfOffice}
                              disabled={!canModify || oooBusyId === r.id}
                              onChange={(e) => void toggleOutOfOffice(r.id, e.target.checked)}
                              className="rounded border-slate-300"
                              title={!canModify ? modifyAccessMessage : undefined}
                            />
                            {r.outOfOffice ? <span className="text-amber-700 dark:text-amber-400">OOO</span> : <span className="text-slate-400">—</span>}
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedOooRanges((prev) => {
                                const next = new Set(prev);
                                if (next.has(r.id)) next.delete(r.id);
                                else next.add(r.id);
                                return next;
                              })
                            }
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                          >
                            {expandedOooRanges.has(r.id) ? (
                              <>
                                <ChevronUp className="h-3 w-3" />
                                Date range
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3" />
                                Date range
                              </>
                            )}
                          </button>
                          {expandedOooRanges.has(r.id) ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="date"
                                value={oooDraftByUserId[r.id]?.start ?? r.oooStartDate ?? ""}
                                disabled={!canModify || oooRangeBusyId === r.id}
                                onChange={(e) =>
                                  setOooDraftByUserId((prev) => ({
                                    ...prev,
                                    [r.id]: { start: e.target.value, end: prev[r.id]?.end ?? r.oooEndDate ?? "" },
                                  }))
                                }
                                className="rounded border border-black/10 bg-white/80 px-1.5 py-1 text-[10px] dark:border-white/15 dark:bg-white/10"
                              />
                              <input
                                type="date"
                                value={oooDraftByUserId[r.id]?.end ?? r.oooEndDate ?? ""}
                                disabled={!canModify || oooRangeBusyId === r.id}
                                onChange={(e) =>
                                  setOooDraftByUserId((prev) => ({
                                    ...prev,
                                    [r.id]: { start: prev[r.id]?.start ?? r.oooStartDate ?? "", end: e.target.value },
                                  }))
                                }
                                className="rounded border border-black/10 bg-white/80 px-1.5 py-1 text-[10px] dark:border-white/15 dark:bg-white/10"
                              />
                              <button
                                type="button"
                                disabled={!canModify || oooRangeBusyId === r.id}
                                onClick={() =>
                                  void saveOutOfOfficeRange(
                                    r.id,
                                    oooDraftByUserId[r.id]?.start ?? r.oooStartDate ?? "",
                                    oooDraftByUserId[r.id]?.end ?? r.oooEndDate ?? ""
                                  )
                                }
                                title={!canModify ? modifyAccessMessage : undefined}
                                className="rounded bg-[#1E88E5] px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-[#1976D2] disabled:opacity-50 dark:bg-[#1E88E5] dark:hover:bg-[#1565C0]"
                              >
                                {oooRangeBusyId === r.id ? "Saving..." : "Save range"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Showing {filtered.length === 0 ? 0 : (page - 1) * effectivePageSize + 1}-{Math.min(page * effectivePageSize, filtered.length)} of {filtered.length} agents
            </span>
            <label className="inline-flex items-center gap-1 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Per page</span>
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  const v = e.target.value;
                  setPageSize(v === "all" ? "all" : Number(v));
                }}
                className="rounded-md border border-black/10 bg-white/80 px-2 py-1 text-[11px] text-slate-700 outline-none dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-full border border-black/10 p-1.5 disabled:opacity-40 dark:border-white/15"
              disabled={page <= 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {Array.from({ length: Math.min(3, totalPages) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`h-7 w-7 rounded-full text-[11px] font-semibold ${
                  page === n ? "bg-[#1E88E5] text-white" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-full border border-black/10 p-1.5 disabled:opacity-40 dark:border-white/15"
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </GlassCard>
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
                      value={invite.selectedLevelKey}
                      onChange={(e) =>
                        setInvite((prev) => ({
                          ...prev,
                          selectedLevelKey: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-black/10 bg-white/75 px-3 py-2.5 text-xs dark:border-white/10 dark:bg-white/10"
                    >
                      <option value="">Select level</option>
                      {levelOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Assigned role in this organization is fixed to <strong>Agent</strong>. Level is saved separately
                      for routing (L1 / L2 / L3).
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
                      {assignableRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
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
              <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
                <button
                  type="button"
                  disabled={!canModify || invite.saving}
                  onClick={() => void handleInviteSubmit()}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: EZII_BRAND.primary }}
                >
                  {invite.saving ? "Sending..." : "Send Invitation"}
                </button>
              </InstantTooltip>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CircleStatus({ online }: { online: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${online ? "bg-[#1E88E5]" : "bg-slate-400"}`} />
  );
}

