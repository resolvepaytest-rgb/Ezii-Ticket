import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { InstantTooltip } from "@components/common/InstantTooltip";
import { OrgProductAssignModal } from "@pages/admin/OrgProductAssignModal";
import {
  getExternalOrganizations,
  getOrganisationProducts,
  getSystemOrganisationTicketMetrics,
  listOrganisations,
  listProducts,
  type ExternalOrganization,
  type Organisation,
  type OrganisationProduct,
  type OrganisationTicketMetricsPayload,
  type Product,
} from "@api/adminApi";
import { EZII_BRAND } from "@/lib/eziiBrand";
import { resolveOrganisationDisplayName } from "@/lib/organisationDisplay";
import { cn } from "@/lib/utils";
import { syncClientProductsFromExternal } from "@api/authApi";
import { useAuthStore } from "@store/useAuthStore";
import { useUIStore } from "@store/useUIStore";
import { useScreenModifyAccess } from "@hooks/useScreenModifyAccess";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const PRIMARY = EZII_BRAND.primary;
const ALERT_RED = "#B91C1C";

/** Main org shell: blur only, no frosted white fills or dark white panel/shadow */
const glassSubtle =
  "border border-black/10 bg-white/30 backdrop-blur-lg dark:border-white/10 dark:bg-white/[0.06]";

const glassInteractive =
  "border border-black/10 bg-white/45 backdrop-blur-md transition-colors hover:bg-white/55 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/[0.14]";

type StatusFilter = "ALL" | "HEALTHY" | "WARNING";

/** `organisations.id` is bigint; APIs often return it as string. Compare filters with this. */
function organisationIdNum(id: Organisation["id"]): number {
  return Number(id);
}

function normalizeOrgId(id: string | number): string {
  const n = Number(id);
  return Number.isFinite(n) ? String(n) : String(id).trim();
}

function safeOrganisationDisplayName(
  org: Organisation,
  externalNameById: Map<string, string>
): string {
  const resolved = resolveOrganisationDisplayName(org, externalNameById);
  if (typeof resolved === "string" && resolved.trim()) return resolved.trim();
  const idNum = Number(org?.id);
  return Number.isFinite(idNum) ? `Organization ${idNum}` : "Organization";
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

export function OrganizationsPage({ orgId }: { orgId: string }) {
  const authUser = useAuthStore((s) => s.user);
  const authOrgId = authUser?.org_id ? String(authUser.org_id) : null;
  const isSystemAdminUser =
    authUser?.role_name === "admin" &&
    authUser?.org_id === "1" &&
    authUser?.user_id === "1" &&
    authUser?.role_id === "1" &&
    authUser?.user_type_id === "1";
  const canModify = useScreenModifyAccess("organizations");
  const modifyAccessMessage = "You don't have modify access";
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
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(
    () => new Set()
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  /** `null` = show all organizations */
  const [orgFilterId, setOrgFilterId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

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
      const sync = await syncClientProductsFromExternal().catch(() => null);
      if (sync) useUIStore.getState().setBrand(sync.is_ngo ? "ngo" : "ezii");
      const [o, p, ext, metrics] = await Promise.all([
        listOrganisations(),
        listProducts(),
        getExternalOrganizations().catch(() => [] as ExternalOrganization[]),
        getSystemOrganisationTicketMetrics().catch(() => null),
      ]);
      const externalOrgIds = new Set(ext.map((x) => normalizeOrgId(x.id)));
      const matchedOrgs = o.filter((org) => externalOrgIds.has(normalizeOrgId(org.id)));
      const scopedOrgId = authOrgId ?? String(orgId);
      const scopedOrgs = isSystemAdminUser
        ? matchedOrgs
        : matchedOrgs.filter((org) => normalizeOrgId(org.id) === normalizeOrgId(scopedOrgId));
      setOrgs(scopedOrgs);
      setProducts(p);
      setExternalOrgs(ext);
      setTicketMetrics(metrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organizations");
      setOrgs([]);
      setTicketMetrics(null);
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

  useEffect(() => {
    if (orgFilterId == null) return;
    if (!orgs.some((o) => organisationIdNum(o.id) === orgFilterId)) setOrgFilterId(null);
  }, [orgs, orgFilterId]);

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

  const orgSelectOptions = useMemo(() => {
    return [...orgs]
      .sort((a, b) =>
        safeOrganisationDisplayName(a, externalNameById).localeCompare(
          safeOrganisationDisplayName(b, externalNameById),
          undefined,
          { sensitivity: "base" }
        )
      )
      .map((org) => ({
        id: organisationIdNum(org.id),
        label: safeOrganisationDisplayName(org, externalNameById),
      }));
  }, [orgs, externalNameById]);

  const filteredRows = useMemo(() => {
    return rowsBase
      .filter((row) => {
        if (orgFilterId != null && organisationIdNum(row.org.id) !== orgFilterId) return false;
        if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
        if (selectedProductIds.size === 0) return true;
        return row.enabledProducts.some((ep) =>
          selectedProductIds.has(ep.product_id)
        );
      })
      .sort((a, b) =>
        safeOrganisationDisplayName(a.org, externalNameById).localeCompare(
          safeOrganisationDisplayName(b.org, externalNameById),
          undefined,
          { sensitivity: "base" }
        )
      );
  }, [rowsBase, orgFilterId, statusFilter, selectedProductIds, externalNameById]);

  const totalFiltered = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const canGoPrev = safePage > 1;
  const canGoNext = safePage < totalPages;
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, selectedProductIds, orgFilterId, orgs.length]);

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
    setOrgFilterId(null);
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
            
            <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
              <button
                type="button"
                disabled={!canModify}
                onClick={() => {
                  setOrgModalInitialId(null);
                  setOrgModalInitialName(null);
                  setOrgModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
                style={{ backgroundColor: PRIMARY }}
              >
                <Plus className="h-4 w-4" />
                Add New Organization
              </button>
            </InstantTooltip>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
              {selectedProductIds.size > 0 || orgFilterId != null ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-[#1E88E5] underline-offset-2 hover:underline dark:text-sky-300"
                >
                  Clear filters
                </button>
              ) : null}
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
            {orgs.length > 1 ? (
              <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[220px] sm:max-w-xs">
                <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
                  Filter by organization
                </span>
                <select
                  value={orgFilterId == null ? "" : String(orgFilterId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") setOrgFilterId(null);
                    else {
                      const n = Number(v);
                      setOrgFilterId(Number.isFinite(n) ? n : null);
                    }
                  }}
                  className="w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-800 dark:border-white/10 dark:bg-white/10 dark:text-slate-100"
                >
                  <option value="">All organizations</option>
                  {orgSelectOptions.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div
            className={cn(
              "w-full rounded-2xl border border-[#1E88E5]/35 bg-gradient-to-br from-[#1E88E5]/18 to-[#1E88E5]/6 p-2 shadow-[0_8px_28px_rgba(30,136,229,0.12)] backdrop-blur-xl dark:border-[#1E88E5]/40 dark:from-[#1E88E5]/25 dark:to-[#1E88E5]/8 lg:w-[350px] lg:shrink-0"
            )}
          >
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#475569]/80 dark:text-white/70">
                  Total clients
                </div>
                <div className="text-2xl font-bold tabular-nums text-[#1E88E5] dark:text-white">
                  {orgs.length}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#475569]/80 dark:text-white/70">
                  Global SLA
                </div>
                <div className="text-2xl font-bold tabular-nums text-[#1E88E5] dark:text-white">
                  {globalSlaAll == null ? "—" : `${globalSlaAll}%`}
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
                        ? String(Number(row.org.id)).padStart(1, "0")
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
                          <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
                            <button
                              type="button"
                              disabled={!canModify}
                              title="Products & queues"
                              onClick={() => {
                                const id = String(row.org.id);
                                setOrgModalInitialId(id);
                                setOrgModalInitialName(displayName);
                                setOrgModalOpen(true);
                              }}
                              className={cn(
                                "inline-flex rounded-lg p-2 text-slate-600 disabled:opacity-60 dark:text-muted-foreground",
                                glassInteractive
                              )}
                              aria-label={`Configure ${displayName}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </InstantTooltip>
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
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium uppercase tracking-wide">
                    Showing {startIdx} to {endIdx} of {totalFiltered}{" "}
                    organizations
                  </span>
                  <div className="flex items-center gap-2">
                    <label htmlFor="org-page-size" className="text-[11px] font-medium uppercase tracking-wide">
                      Per page
                    </label>
                    <select
                      id="org-page-size"
                      value={String(pageSize)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setPageSize(Number.isFinite(n) ? n : 10);
                        setPage(1);
                      }}
                      className="rounded-md border border-black/10 bg-white/70 px-2 py-1 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-white/10 dark:text-slate-100"
                    >
                      {[10, 20, 50, 100].map((size) => (
                        <option key={size} value={String(size)}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={!canGoPrev}
                    className={cn(
                      "inline-flex min-w-[2rem] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold",
                      canGoPrev
                        ? "text-slate-700 hover:bg-white/60 dark:text-foreground dark:hover:bg-white/15"
                        : "cursor-not-allowed opacity-50"
                    )}
                    aria-label="First page"
                    title="First page"
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={!canGoPrev}
                    className={cn(
                      "inline-flex min-w-[2rem] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold",
                      canGoPrev
                        ? "text-slate-700 hover:bg-white/60 dark:text-foreground dark:hover:bg-white/15"
                        : "cursor-not-allowed opacity-50"
                    )}
                    aria-label="Previous page"
                    title="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
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
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={!canGoNext}
                    className={cn(
                      "inline-flex min-w-[2rem] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold",
                      canGoNext
                        ? "text-slate-700 hover:bg-white/60 dark:text-foreground dark:hover:bg-white/15"
                        : "cursor-not-allowed opacity-50"
                    )}
                    aria-label="Next page"
                    title="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    disabled={!canGoNext}
                    className={cn(
                      "inline-flex min-w-[2rem] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold",
                      canGoNext
                        ? "text-slate-700 hover:bg-white/60 dark:text-foreground dark:hover:bg-white/15"
                        : "cursor-not-allowed opacity-50"
                    )}
                    aria-label="Last page"
                    title="Last page"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </GlassCard>

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
