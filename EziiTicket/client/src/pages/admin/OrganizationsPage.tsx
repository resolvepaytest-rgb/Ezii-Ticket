import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { OrgProductAssignModal } from "@pages/admin/OrgProductAssignModal";
import {
  getExternalOrganizations,
  getOrganisationProducts,
  getSystemOrganisationTicketMetrics,
  listAdminAuditLogs,
  listOrganisations,
  listProducts,
  type AdminAuditLog,
  type ExternalOrganization,
  type Organisation,
  type OrganisationProduct,
  type OrganisationTicketMetricsPayload,
  type Product,
} from "@api/adminApi";
import { EZII_BRAND } from "@/lib/eziiBrand";
import { resolveOrganisationDisplayName } from "@/lib/organisationDisplay";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@store/useAuthStore";
import {
  AlertTriangle,
  Clock,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const PRIMARY = EZII_BRAND.primary;
const ALERT_RED = "#B91C1C";

/** Main org shell: blur only, no frosted white fills or dark white panel/shadow */
const glassSubtle =
  "border border-black/10 bg-white/30 backdrop-blur-lg dark:border-white/10 dark:bg-white/[0.06]";

const glassInteractive =
  "border border-black/10 bg-white/45 backdrop-blur-md transition-colors hover:bg-white/55 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/[0.14]";

type WorkspaceTab = "active" | "archived";
type StatusFilter = "ALL" | "HEALTHY" | "WARNING";

function safeOrganisationDisplayName(
  org: Organisation,
  externalNameById: Map<string, string>
): string {
  const resolved = resolveOrganisationDisplayName(org, externalNameById);
  if (typeof resolved === "string" && resolved.trim()) return resolved.trim();
  const idNum = Number(org?.id);
  return Number.isFinite(idNum) ? `Organization ${idNum}` : "Organization";
}

function formatRelativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(deltaMs)) return "";
  const mins = Math.round(deltaMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function rowStatus(slaPct: number | null): "HEALTHY" | "WARNING" {
  if (slaPct == null) return "HEALTHY";
  return slaPct < 90 ? "WARNING" : "HEALTHY";
}

type RowModel = {
  org: Organisation;
  enabledProducts: OrganisationProduct[];
  openTickets: number;
  slaPct: number | null;
  status: "HEALTHY" | "WARNING";
};

async function batchOrgProducts(
  orgIds: number[],
  chunkSize: number
): Promise<Record<number, OrganisationProduct[]>> {
  const map: Record<number, OrganisationProduct[]> = {};
  for (let i = 0; i < orgIds.length; i += chunkSize) {
    const chunk = orgIds.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (id) => {
        try {
          const list = await getOrganisationProducts(id);
          return [id, list] as const;
        } catch {
          return [id, [] as OrganisationProduct[]] as const;
        }
      })
    );
    for (const [id, list] of results) map[id] = list;
  }
  return map;
}

export function OrganizationsPage({
  orgId,
  onOrgChange,
}: {
  orgId: string;
  onOrgChange?: (orgId: string) => void;
}) {
  const authUser = useAuthStore((s) => s.user);
  const authOrgId = authUser?.org_id ? String(authUser.org_id) : null;
  const isSystemAdminUser =
    authUser?.role_name === "admin" &&
    authUser?.org_id === "1" &&
    authUser?.user_id === "1" &&
    authUser?.role_id === "1" &&
    authUser?.user_type_id === "1";
  const [tab, setTab] = useState<WorkspaceTab>("active");
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orgProductsMap, setOrgProductsMap] = useState<
    Record<number, OrganisationProduct[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [orgProductsLoading, setOrgProductsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketMetrics, setTicketMetrics] =
    useState<OrganisationTicketMetricsPayload | null>(null);
  const [recentAudit, setRecentAudit] = useState<AdminAuditLog[]>([]);

  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(
    () => new Set()
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [orgModalInitialId, setOrgModalInitialId] = useState<string | null>(
    null
  );
  const [orgModalInitialName, setOrgModalInitialName] = useState<string | null>(
    null
  );

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, p, ext, metrics, audit] = await Promise.all([
        listOrganisations(),
        listProducts(),
        getExternalOrganizations().catch(() => [] as ExternalOrganization[]),
        getSystemOrganisationTicketMetrics().catch(() => null),
        listAdminAuditLogs({ limit: 5 }).catch(() => [] as AdminAuditLog[]),
      ]);
      const scopedOrgId = authOrgId ?? String(orgId);
      const scopedOrgs = isSystemAdminUser
        ? o
        : o.filter((org) => String(org.id) === scopedOrgId);
      setOrgs(scopedOrgs);
      setProducts(p);
      setExternalOrgs(ext);
      setTicketMetrics(metrics);
      setRecentAudit(Array.isArray(audit) ? audit : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organizations");
      setOrgs([]);
      setTicketMetrics(null);
      setRecentAudit([]);
    } finally {
      setLoading(false);
    }
  }, [authOrgId, isSystemAdminUser, orgId]);

  const externalNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of externalOrgs) {
      const n = x.organization_name?.trim();
      if (n) m.set(String(x.id), n);
    }
    return m;
  }, [externalOrgs]);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  const rowsBase: RowModel[] = useMemo(() => {
    return orgs.map((org) => {
      const all = orgProductsMap[org.id] ?? [];
      const enabledProducts = all.filter((x) => x.enabled);
      const m = ticketMetrics?.by_org[String(org.id)];
      const openTickets = m?.open_tickets ?? 0;
      const slaPct = m?.sla_attainment_pct ?? null;
      return {
        org,
        enabledProducts,
        openTickets,
        slaPct,
        status: rowStatus(slaPct),
      };
    });
  }, [orgs, orgProductsMap, ticketMetrics]);

  const filteredRows = useMemo(() => {
    if (tab === "archived") return [];
    return rowsBase.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (selectedProductIds.size === 0) return true;
      return row.enabledProducts.some((ep) =>
        selectedProductIds.has(ep.product_id)
      );
    });
  }, [rowsBase, tab, statusFilter, selectedProductIds]);

  const totalFiltered = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, selectedProductIds, orgs.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!orgs.length) {
      setOrgProductsMap({});
      return;
    }
    let cancelled = false;
    setOrgProductsLoading(true);
    void (async () => {
      try {
        const map = await batchOrgProducts(
          orgs.map((o) => o.id),
          10
        );
        if (!cancelled) setOrgProductsMap(map);
      } finally {
        if (!cancelled) setOrgProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgs]);

  const globalSlaAll = ticketMetrics?.global.sla_attainment_pct ?? null;

  const worstOrgBelowThreshold = useMemo(() => {
    let w: RowModel | null = null;
    for (const r of rowsBase) {
      if (r.slaPct == null || r.slaPct >= 90) continue;
      if (!w || r.slaPct < (w.slaPct ?? 0)) w = r;
    }
    return w;
  }, [rowsBase]);

  const recentActivityLine = useMemo(() => {
    const log = recentAudit[0];
    if (!log) return "No recent admin activity recorded yet.";
    const rel = formatRelativeTime(log.created_at);
    const tail = rel ? ` ${rel}.` : ".";
    return `${log.module}: ${log.summary}${tail}`;
  }, [recentAudit]);

  function toggleProductFilter(id: number) {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setSelectedProductIds(new Set());
    setStatusFilter("ALL");
  }

  const startIdx = totalFiltered === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, totalFiltered);

  const pageNumbers = useMemo((): (number | "ellipsis")[] => {
    const n = totalPages;
    const c = safePage;
    if (n <= 9) return Array.from({ length: n }, (_, i) => i + 1);
    const out: (number | "ellipsis")[] = [1];
    const mid = [c - 1, c, c + 1].filter((p) => p > 1 && p < n);
    if (mid.length && mid[0]! > 2) out.push("ellipsis");
    out.push(...mid);
    if (mid.length && mid[mid.length - 1]! < n - 1) out.push("ellipsis");
    if (n > 1) out.push(n);
    return out;
  }, [totalPages, safePage]);

  return (
    <div
      className="mx-auto max-w-[1400px] space-y-5 pb-10 "
      style={{ backgroundColor: "transparent" }}
    >
      <div
        className={cn(
          "-mx-4 -mt-2 rounded-2xl px-4 py-6 md:-mx-6 md:px-6",
          
        )}
        data-surface="orgs"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              System workspace
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#475569] dark:text-foreground">
              Organizations
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-600 dark:text-muted-foreground">
              Manage client tenants, product activation, and org-specific settings.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div
              className={cn(
                "inline-flex rounded-xl border border-[#1E88E5]/25 bg-[#1E88E5]/10 p-1 backdrop-blur-md dark:border-[#1E88E5]/35 dark:bg-[#1E88E5]/15"
              )}
            >
              <button
                type="button"
                onClick={() => setTab("active")}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-all",
                  tab === "active"
                    ? "bg-white/90 text-[#475569] shadow-sm backdrop-blur-sm dark:bg-white/20 dark:text-foreground"
                    : "text-slate-600 dark:text-muted-foreground"
                )}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setTab("archived")}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-all",
                  tab === "archived"
                    ? "bg-white/90 text-[#475569] shadow-sm backdrop-blur-sm dark:bg-white/20 dark:text-foreground"
                    : "text-slate-600 dark:text-muted-foreground"
                )}
              >
                Archived
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setOrgModalInitialId(null);
                setOrgModalInitialName(null);
                setOrgModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
              style={{ backgroundColor: PRIMARY }}
            >
              <Plus className="h-4 w-4" />
              Add New Organization
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          {tab === "active" ? (
            <div
              className={cn(
                "w-full rounded-xl px-4 py-3 shadow-sm",
                "md:flex md:items-center md:justify-between md:gap-4",
                glassSubtle
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
                  Filter by product
                </span>
                {products.map((p) => {
                  const on = selectedProductIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProductFilter(p.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                        on
                          ? "border-[#1E88E5] bg-[#1E88E5]/90 text-white shadow-sm backdrop-blur-sm dark:border-primary dark:bg-primary/90"
                          : cn(
                              "border-black/10 text-slate-700 dark:border-white/15 dark:text-foreground",
                              "bg-white/50 backdrop-blur-sm hover:bg-white/70 dark:bg-white/5 dark:hover:bg-white/10"
                            )
                      )}
                    >
                      {p.code || p.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 md:mt-0">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-muted-foreground">
                  <span className="uppercase tracking-wide">Status</span>
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as StatusFilter)
                    }
                    className="rounded-lg border border-black/10 bg-white/60 px-2 py-1.5 text-xs font-medium backdrop-blur-sm dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="ALL">All statuses</option>
                    <option value="HEALTHY">Healthy</option>
                    <option value="WARNING">Warning</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-[#475569] underline-offset-2 hover:underline dark:text-primary"
                >
                  Clear filters
                </button>
              </div>
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}
          <div
            className={cn(
              "w-full rounded-2xl border border-[#1E88E5]/35 bg-gradient-to-br from-[#1E88E5]/18 to-[#1E88E5]/6 p-4 shadow-[0_8px_28px_rgba(30,136,229,0.12)] backdrop-blur-xl dark:border-[#1E88E5]/40 dark:from-[#1E88E5]/25 dark:to-[#1E88E5]/8 lg:w-[350px] lg:shrink-0"
            )}
          >
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#475569]/80 dark:text-white/70">
                  Total clients
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-[#1E88E5] dark:text-white">
                  {tab === "archived" ? 0 : orgs.length}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#475569]/80 dark:text-white/70">
                  Global SLA
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-[#1E88E5] dark:text-white">
                  {tab === "archived" || globalSlaAll == null
                    ? "—"
                    : `${globalSlaAll}%`}
                </div>
              </div>
            </div>
          </div>
        </div>

        <GlassCard className="mt-4 overflow-hidden border-black/10 bg-white/25 p-0 supports-[backdrop-filter]:bg-white/30 dark:border-white/10 dark:bg-white/5">
          {loading ? (
            <div className="p-12">
              <Loader label="Loading organizations…" size="sm" />
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : tab === "archived" ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No archived organizations. Archived tenants will appear here when
              lifecycle APIs are enabled.
            </div>
          ) : (
            <>
              {orgProductsLoading ? (
                <div className="border-b border-black/10 bg-white/20 px-4 py-2 text-center text-xs text-muted-foreground backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                  Loading product activation per organization…
                </div>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 bg-black/[0.04] text-[11px] font-bold uppercase tracking-wide text-slate-600 backdrop-blur-sm dark:border-white/10 dark:bg-white/10 dark:text-muted-foreground">
                      <th className="px-4 py-3">Organization name</th>
                      <th className="px-4 py-3">Active products</th>
                      <th className="px-4 py-3 text-center">Open tickets</th>
                      <th className="px-4 py-3">SLA attainment %</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageSlice.map((row) => {
                      const displayName = safeOrganisationDisplayName(
                        row.org,
                        externalNameById
                      );
                      const orgIdLabel = Number.isFinite(Number(row.org.id))
                        ? String(Number(row.org.id)).padStart(4, "0")
                        : "0000";
                      return (
                      <tr
                        key={row.org.id}
                        className="border-b border-black/5 transition-colors last:border-0 hover:bg-white/40 dark:border-white/5 dark:hover:bg-white/[0.06]"
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-start gap-3">
                            {row.org.logo_url ? (
                              <img
                                src={row.org.logo_url}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded-md border border-slate-200 object-cover dark:border-white/10"
                              />
                            ) : (
                              <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                                style={{ backgroundColor: PRIMARY }}
                              >
                                {displayName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-[#475569] dark:text-foreground">
                                {displayName}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-muted-foreground">
                                ID: ORG-{orgIdLabel}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap gap-1">
                            {row.enabledProducts.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            ) : (
                              row.enabledProducts.map((ep) => (
                                <span
                                  key={ep.product_id}
                                  className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
                                >
                                  {ep.code || ep.name}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center tabular-nums font-medium">
                          {row.openTickets.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {row.slaPct == null ? (
                            <span className="text-sm font-medium text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <>
                              <div
                                className={cn(
                                  "text-sm font-semibold tabular-nums",
                                  row.slaPct < 90
                                    ? "text-[#B91C1C]"
                                    : "text-[#475569] dark:text-foreground"
                                )}
                              >
                                {row.slaPct}%
                              </div>
                              <div className="mt-1 h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, row.slaPct)}%`,
                                    backgroundColor:
                                      row.slaPct < 90 ? ALERT_RED : PRIMARY,
                                  }}
                                />
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right align-middle">
                          <button
                            type="button"
                            title="Products & queues"
                            onClick={() => {
                              const id = String(row.org.id);
                              setOrgModalInitialId(id);
                              setOrgModalInitialName(displayName);
                              setOrgModalOpen(true);
                              onOrgChange?.(id);
                            }}
                            className={cn(
                              "inline-flex rounded-lg p-2 text-slate-600 dark:text-muted-foreground",
                              glassInteractive
                            )}
                            aria-label={`Configure ${displayName}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                    {!pageSlice.length ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                          No organizations match the current filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-black/10 bg-white/25 px-4 py-3 text-xs text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium uppercase tracking-wide">
                  Showing {startIdx} to {endIdx} of {totalFiltered}{" "}
                  organizations
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {pageNumbers.map((p, i) =>
                    p === "ellipsis" ? (
                      <span key={`e-${i}`} className="px-2">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={cn(
                          "min-w-[2rem] rounded-md px-2 py-1 text-xs font-semibold",
                          safePage === p
                            ? "text-white shadow-sm"
                            : "text-slate-700 hover:bg-white/60 dark:text-foreground dark:hover:bg-white/15"
                        )}
                        style={
                          safePage === p ? { backgroundColor: PRIMARY } : undefined
                        }
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>
              </div>
            </>
          )}
        </GlassCard>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <GlassCard className="border-black/10 bg-white/20 p-4 supports-[backdrop-filter]:bg-white/25 dark:border-white/10 dark:bg-white/5">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/5 bg-white/50 backdrop-blur-sm dark:border-white/10 dark:bg-white/10">
                <Clock className="h-5 w-5 text-slate-600 dark:text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#475569] dark:text-foreground">
                  Recent activity
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-muted-foreground">
                  {recentActivityLine}
                </p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="border-l-4 border-l-[#B91C1C] border-black/10 bg-white/20 p-4 supports-[backdrop-filter]:bg-white/25 dark:border-white/10 dark:bg-white/5">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-[#B91C1C]" />
              <div>
                <div className="text-sm font-semibold text-[#B91C1C]">
                  SLA critical alert
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-muted-foreground">
                  {worstOrgBelowThreshold
                    ? `${resolveOrganisationDisplayName(worstOrgBelowThreshold.org, externalNameById)} is below 90% resolution SLA attainment (completed tickets with a resolution due date).`
                    : "No organizations are currently below the 90% resolution SLA attainment threshold."}
                </p>
              </div>
            </div>
          </GlassCard>
          <GlassCard
            className={cn(
              "border border-[#1E88E5]/40 bg-gradient-to-br from-[#1E88E5]/35 to-[#1E88E5]/15 p-4 text-slate-900 shadow-lg backdrop-blur-xl dark:border-[#1E88E5]/50 dark:from-[#1E88E5]/30 dark:to-[#1E88E5]/10 dark:text-white"
            )}
          >
            <div className="flex gap-3">
              <Sparkles className="h-5 w-5 shrink-0 text-[#CC6C00] dark:text-amber-200" />
              <div>
                <div className="text-sm font-semibold">System health snapshot</div>
                <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-white/85">
                  {ticketMetrics == null
                    ? "Ticket metrics are unavailable (check system admin access)."
                    : `Open tickets across all organizations: ${ticketMetrics.global.open_tickets.toLocaleString("en-IN")}. Weighted resolution SLA on completed tickets: ${
                        ticketMetrics.global.sla_attainment_pct == null
                          ? "—"
                          : `${ticketMetrics.global.sla_attainment_pct}%`
                      }.`}
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      <OrgProductAssignModal
        open={orgModalOpen}
        onOpenChange={setOrgModalOpen}
        initialOrgId={orgModalInitialId}
        initialOrgName={orgModalInitialName}
        onSaved={() => {
          void loadOrgs();
        }}
      />
    </div>
  );
}
