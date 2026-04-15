import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import {
  getAgentsTicketMetrics,
  getExternalOrganizations,
  listProducts,
  listQueues,
  listInvitedAgentUsers,
  listTeamMembers,
  listTeams,
  listUserRoles,
  listUsers,
  updateUser,
  type ExternalOrganization,
  type Product,
  type User,
} from "@api/adminApi";
import { useAuthStore } from "@store/useAuthStore";
import { EZII_BRAND } from "@/lib/eziiBrand";
import {
  Activity,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Filter,
  Star,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";

/** Ezii HQ org id — same as Users & Roles “invited” semantics (`origin_org_id === 1`). */
const EZII_ORG_ID = 1;

const EZII_HQ_ORG_LABEL = "Resolve Biz Services Pvt Ltd";

type TierFilter = "all" | "L1" | "L2" | "L3";
type StatusFilter = "all" | "active" | "online" | "offline";

type AgentRow = {
  id: number;
  name: string;
  email: string;
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
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "A"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function inferTier(roleName: string, userType: string | null): "L1" | "L2" | "L3" {
  const src = `${roleName} ${userType ?? ""}`.toLowerCase();
  if (src.includes("l3") || src.includes("senior")) return "L3";
  if (src.includes("l2") || src.includes("specialist")) return "L2";
  return "L1";
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

  const [activeOrgId, setActiveOrgId] = useState<number | null>(shellOrgId);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [productFilter, setProductFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [listVersion, setListVersion] = useState(0);
  const [oooBusyId, setOooBusyId] = useState<number | null>(null);
  const [expandedWorkloads, setExpandedWorkloads] = useState<Set<number>>(new Set());

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
        const [usersRes, invitedUsersRes, productsRes, teamsRes, queuesRes, ticketMetrics] = await Promise.all([
          activeOrgId === EZII_ORG_ID ? listUsers(activeOrgId) : Promise.resolve([] as User[]),
          activeOrgId !== EZII_ORG_ID ? listInvitedAgentUsers(activeOrgId) : Promise.resolve([] as User[]),
          listProducts(),
          listTeams(activeOrgId),
          listQueues(activeOrgId),
          getAgentsTicketMetrics(activeOrgId).catch(() => []),
        ]);
        const metricsByUserId = new Map(
          ticketMetrics.map((m) => [m.user_id, m] as const)
        );
        setProducts(productsRes);

        // HQ: org 1 users. Tenant: server join `user_scope_org` + `users` (includes HQ-stored invited agents).
        const usersForAgents = activeOrgId === EZII_ORG_ID ? usersRes : invitedUsersRes;

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

        const mapped = await Promise.all(
          usersForAgents.map(async (u) => {
            let roleName = "Support Associate";
            try {
              const roles = await listUserRoles(Number(u.user_id));
              const scoped = roles.find((r) => Number(r.scope_organisation_id) === activeOrgId);
              const global = roles.find((r) => r.scope_organisation_id == null);
              roleName = scoped?.role_name ?? global?.role_name ?? roleName;
            } catch {
              // keep fallback role
            }

            const tier = inferTier(roleName, u.user_type);
            const uid = Number(u.user_id);
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
            const online = String(u.status).toLowerCase() === "active";
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
            };
            return row;
          })
        );

        setRows(mapped);
      } catch {
        setRows([]);
        setProducts([]);
        toast.error("Failed to load agents.");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeOrgId, listVersion]);

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

  const filtered = useMemo(() => {
    const base = rows.filter((r) => {
      if (tierFilter !== "all" && r.tier !== tierFilter) return false;
      if (statusFilter === "online" && !r.online) return false;
      if (statusFilter === "offline" && r.online) return false;
      if (statusFilter === "active" && String(r.status).toLowerCase() !== "active") return false;
      if (productFilter !== "all") {
        const name = products.find((p) => p.id === productFilter)?.name;
        if (name && !r.assignedProducts.includes(name)) return false;
      }
      return true;
    });
    return [...base].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [rows, tierFilter, statusFilter, productFilter, products]);

  const effectivePageSize = pageSize === "all" ? Math.max(1, filtered.length || 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  const pageRows = useMemo(() => {
    if (pageSize === "all") return filtered;
    const start = (page - 1) * effectivePageSize;
    return filtered.slice(start, start + effectivePageSize);
  }, [filtered, page, pageSize, effectivePageSize]);

  useEffect(() => {
    setPage(1);
  }, [tierFilter, productFilter, statusFilter, pageSize, activeOrgId]);

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
          <button className="inline-flex items-center gap-1 rounded-xl border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => toast.message("Invite flow", { description: "Invite New Agent modal can be wired next." })}
            className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-white"
            style={{ backgroundColor: EZII_BRAND.primary }}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invite New Agent
          </button>
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
          <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">{kpis.onlinePct}% of agents (active status)</div>
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
        <div className="flex items-center gap-1.5">
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
            <Filter className="h-3.5 w-3.5" />
            Product:
            <select
              value={String(productFilter)}
              onChange={(e) => setProductFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="bg-transparent outline-none"
            >
              <option value="all">All</option>
              {products.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
            <Zap className="h-3.5 w-3.5" />
            Status:
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-transparent outline-none"
            >
              <option value="all">All accounts</option>
              <option value="active">Active</option>
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
                <th className="px-4 py-3 text-[10px] font-semibold">OOO</th>
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
                            <div className="font-semibold text-slate-800 dark:text-slate-100">{r.name}</div>
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
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={r.outOfOffice}
                            disabled={oooBusyId === r.id}
                            onChange={(e) => void toggleOutOfOffice(r.id, e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          {r.outOfOffice ? <span className="text-amber-700 dark:text-amber-400">OOO</span> : <span className="text-slate-400">—</span>}
                        </label>
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
    </div>
  );
}

function CircleStatus({ online }: { online: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${online ? "bg-[#1E88E5]" : "bg-slate-400"}`} />
  );
}

