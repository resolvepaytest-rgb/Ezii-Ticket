import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { cn } from "@/lib/utils";
import { getTicket, type TicketDetail } from "@/api/ticketApi";
import {
  getSystemTicketFilterOptions,
  listQueues,
  listSystemTickets,
  type Queue,
  type SystemTicketRow,
  type SystemTicketFilterOptions,
} from "@/api/adminApi";
import { Eye, Filter, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const PAGE_SIZE = 15;

type SystemTicketListFilters = {
  organisation_ids: number[];
  product_ids: number[];
  priorities: string[];
  sla_statuses: string[];
};

const EMPTY_FILTERS: SystemTicketListFilters = {
  organisation_ids: [],
  product_ids: [],
  priorities: [],
  sla_statuses: [],
};

function countActiveFilters(f: SystemTicketListFilters) {
  return (
    f.organisation_ids.length +
    f.product_ids.length +
    f.priorities.length +
    f.sla_statuses.length
  );
}

function toggleNumId(arr: number[], id: number): number[] {
  const n = Number(id);
  const s = new Set(arr.map(Number));
  if (s.has(n)) s.delete(n);
  else s.add(n);
  return [...s].sort((a, b) => a - b);
}

function toggleStr(arr: string[], v: string): string[] {
  const s = new Set(arr);
  if (s.has(v)) s.delete(v);
  else s.add(v);
  return [...s].sort();
}

/** DB / API ids may be number or string (e.g. bigint); avoid `===` mismatches in lookups. */
function idEquals(a: unknown, b: unknown) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

function orgCodeFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.charAt(0) ?? "";
    const b = parts[1]?.charAt(0) ?? "";
    return (a + b).toUpperCase().slice(0, 2);
  }
  return name.slice(0, 2).toUpperCase() || "—";
}

function formatStatusLabel(status: string) {
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    new: "NEW",
    open: "OPEN",
    pending: "ON HOLD",
    escalated: "ESCALATED",
    resolved: "RESOLVED",
    closed: "CLOSED",
    cancelled: "CANCELLED",
    reopened: "REOPENED",
  };
  return map[s] ?? status.replace(/_/g, " ").toUpperCase();
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "open" || s === "new" || s === "reopened") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (s === "pending") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
  if (s === "escalated") return "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200";
  if (s === "resolved" || s === "closed") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  return "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-100";
}

function formatSlaRemainingLabel(remainingMs: number) {
  const totalSec = Math.floor(Math.max(0, remainingMs) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Duration past deadline (day prefix when ≥ 24h overdue). */
function formatSlaOverdueLabel(absOverdueMs: number) {
  const totalSec = Math.floor(Math.max(0, absOverdueMs) / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const hms = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (d > 0) return `${d}d ${hms}`;
  return hms;
}

function useSlaCountdown(deadlineIso: string | null, status: string) {
  const terminal = ["resolved", "closed", "cancelled"].includes(status.toLowerCase());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (terminal || !deadlineIso) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [deadlineIso, terminal]);

  if (terminal || !deadlineIso) {
    return { label: "--:--:--" as const, level: "none" as const, isOverdue: false };
  }

  const ms = new Date(deadlineIso).getTime() - now;
  if (ms <= 0) {
    return {
      label: formatSlaOverdueLabel(Math.abs(ms)),
      level: "critical" as const,
      isOverdue: true,
    };
  }
  const label = formatSlaRemainingLabel(ms);
  let level: "critical" | "warning" | "normal" | "none" = "normal";
  if (ms < 15 * 60 * 1000) level = "critical";
  else if (ms < 60 * 60 * 1000) level = "warning";
  return { label, level, isOverdue: false };
}

function SlaCountdownCell({ row }: { row: SystemTicketRow }) {
  const { label, level, isOverdue } = useSlaCountdown(row.next_sla_deadline_at, row.status);

  return (
    <div
      className={cn(
        "text-xs font-semibold tabular-nums",
        level === "critical" || isOverdue ? "text-[#B91C1C] dark:text-red-400" : "text-slate-700 dark:text-slate-200"
      )}
    >
      <span>{label}</span>
      {isOverdue ? (
        <span className="ml-1 text-[10px] font-medium text-[#B91C1C]/90 dark:text-red-400/90">overdue</span>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  labelClassName,
  valueClassName,
}: {
  label: string;
  value: string;
  labelClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/75 p-4 backdrop-blur-md dark:border-white/10 dark:bg-white/10">
      <div
        className={cn(
          "text-[11px] font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-200",
          labelClassName
        )}
      >
        {label}
      </div>
      <div className={cn("mt-2 text-4xl font-semibold text-slate-900 dark:text-white", valueClassName)}>{value}</div>
    </div>
  );
}

const SLA_OPTIONS: { value: string; label: string }[] = [
  { value: "breached", label: "Breached (past due)" },
  { value: "at_risk", label: "At risk (within 4 hours)" },
  { value: "on_track", label: "On track (> 4 hours)" },
  { value: "no_deadline", label: "No SLA deadline" },
];

export function SystemTicketsPage({
  onOpenTicket,
}: {
  onOpenTicket?: (ticketId: number) => void;
}) {
  const [rows, setRows] = useState<SystemTicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState({
    total_active: 0,
    p1_critical: 0,
    sla_at_risk: 0,
    avg_resolution_hours: 0,
  });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailOpenId, setDetailOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailQueues, setDetailQueues] = useState<Queue[]>([]);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState<SystemTicketFilterOptions | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<SystemTicketListFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<SystemTicketListFilters>(EMPTY_FILTERS);

  useEffect(() => {
    let cancelled = false;
    void getSystemTicketFilterOptions()
      .then((data) => {
        if (!cancelled) setFilterOptions(data);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load filter options");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!detailOpenId) {
      setDetail(null);
      setDetailQueues([]);
      return;
    }
    setDetailLoading(true);
    void getTicket(detailOpenId)
      .then((d) => setDetail(d))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load ticket detail");
        setDetail(null);
      })
      .finally(() => setDetailLoading(false));
  }, [detailOpenId]);

  useEffect(() => {
    if (!detail?.organisation_id) {
      setDetailQueues([]);
      return;
    }
    void listQueues(detail.organisation_id)
      .then((rows) => setDetailQueues(rows))
      .catch(() => setDetailQueues([]));
  }, [detail?.organisation_id]);

  const detailProductName = useMemo(() => {
    if (!detail) return "-";
    const fromRows = rows.find((r) => Number(r.id) === Number(detail.id))?.product_name;
    if (fromRows?.trim()) return fromRows;
    const fromFilters = filterOptions?.products.find((p) => idEquals(p.id, detail.product_id))?.name;
    return fromFilters?.trim() || String(detail.product_id);
  }, [detail, rows, filterOptions]);

  const detailQueueName = useMemo(() => {
    if (!detail?.queue_id) return "-";
    return (
      detailQueues.find((q) => Number(q.id) === Number(detail.queue_id))?.name ??
      String(detail.queue_id)
    );
  }, [detail?.queue_id, detailQueues]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSystemTickets({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        organisation_ids: appliedFilters.organisation_ids.length ? appliedFilters.organisation_ids : undefined,
        product_ids: appliedFilters.product_ids.length ? appliedFilters.product_ids : undefined,
        priorities: appliedFilters.priorities.length ? appliedFilters.priorities : undefined,
        sla_statuses:
          appliedFilters.sla_statuses.length > 0
            ? (appliedFilters.sla_statuses as ("breached" | "at_risk" | "on_track" | "no_deadline")[])
            : undefined,
      });
      setRows(data.rows);
      setTotal(data.total);
      setKpis(data.kpis);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tickets");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, appliedFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeFilterCount = useMemo(() => countActiveFilters(appliedFilters), [appliedFilters]);

  function openFilterModal() {
    setDraftFilters(appliedFilters);
    setFilterModalOpen(true);
  }

  function applyFiltersFromModal() {
    setAppliedFilters(draftFilters);
    setPage(0);
    setFilterModalOpen(false);
  }

  function clearDraftFilters() {
    setDraftFilters(EMPTY_FILTERS);
  }

  function clearAllFiltersAndReload() {
    setAppliedFilters(EMPTY_FILTERS);
    setDraftFilters(EMPTY_FILTERS);
    setPage(0);
    setFilterModalOpen(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE + rows.length);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 pb-10">
      <div className="">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#475569] dark:text-foreground">Global Ticket</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
              Managing operational flow across All organizations. Real-time SLA monitoring and critical ticket
              resolution hub.
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-[690px]">
            <KpiCard
              label="Total Active"
              value={kpis.total_active.toLocaleString()}
              labelClassName="text-[#1E88E5] dark:text-[#93C5FD]"
            />
            <KpiCard
              label="P1 Critical"
              value={String(kpis.p1_critical)}
              labelClassName="text-[#B91C1C] dark:text-[#FCA5A5]"
              valueClassName="text-[#B91C1C] dark:text-[#FCA5A5]"
            />
            <KpiCard
              label="SLA At Risk"
              value={String(kpis.sla_at_risk)}
              labelClassName="text-[#8C4A00] dark:text-[#FDBA74]"
            />
            <KpiCard
              label="Avg Res."
              value={`${kpis.avg_resolution_hours.toFixed(1)}h`}
            />
          </div>
        </div>

        <GlassCard className="mt-5 border-black/10 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.06]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs">
              <span className="shrink-0 font-bold text-slate-700 dark:text-slate-200">Filters:</span>
              {activeFilterCount === 0 ? (
                <span className="text-slate-500 dark:text-slate-400">No filters applied</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {appliedFilters.organisation_ids.length > 0 && filterOptions && (
                    <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
                      Org:{" "}
                      {appliedFilters.organisation_ids
                        .map((oid) => filterOptions.organisations.find((o) => idEquals(o.id, oid))?.name ?? String(oid))
                        .join(", ")}
                    </span>
                  )}
                  {appliedFilters.product_ids.length > 0 && filterOptions && (
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 font-medium text-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
                      Product:{" "}
                      {appliedFilters.product_ids
                        .map((pid) => filterOptions.products.find((p) => idEquals(p.id, pid))?.name ?? String(pid))
                        .join(", ")}
                    </span>
                  )}
                  {appliedFilters.priorities.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                      Priority: {appliedFilters.priorities.join(", ")}
                    </span>
                  )}
                  {appliedFilters.sla_statuses.length > 0 && (
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 font-medium text-rose-900 dark:bg-rose-950/50 dark:text-rose-100">
                      SLA:{" "}
                      {appliedFilters.sla_statuses
                        .map((sv) => SLA_OPTIONS.find((o) => o.value === sv)?.label ?? sv)
                        .join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => clearAllFiltersAndReload()}
                  className="rounded-full border border-black/10 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white/80 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => openFilterModal()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0F5EA8] px-4 py-2 text-xs font-bold text-white"
              >
                <Filter className="h-3.5 w-3.5" />
                {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
              </button>
            </div>
          </div>
        </GlassCard>

        {filterModalOpen ? (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setFilterModalOpen(false);
            }}
          >
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-black/10 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900"
              role="dialog"
              aria-labelledby="system-ticket-filter-title"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 id="system-ticket-filter-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Filter tickets
                </h2>
                <button
                  type="button"
                  onClick={() => setFilterModalOpen(false)}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Organizations and products are limited to those that appear on at least one ticket. Select one or more
                in each group; leave a group empty to include all.
              </p>

              <div className="mt-5 space-y-5">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Organization
                  </span>
                  <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5">
                    {(filterOptions?.organisations ?? []).length === 0 ? (
                      <p className="text-xs text-slate-500">No organizations with tickets.</p>
                    ) : (
                      (filterOptions?.organisations ?? []).map((o) => (
                        <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={draftFilters.organisation_ids.some((x) => idEquals(x, o.id))}
                            onChange={() =>
                              setDraftFilters((d) => ({
                                ...d,
                                organisation_ids: toggleNumId(d.organisation_ids, Number(o.id)),
                              }))
                            }
                          />
                          <span>{o.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Product
                  </span>
                  <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5">
                    {(filterOptions?.products ?? []).length === 0 ? (
                      <p className="text-xs text-slate-500">No products with tickets.</p>
                    ) : (
                      (filterOptions?.products ?? []).map((p) => (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={draftFilters.product_ids.some((x) => idEquals(x, p.id))}
                            onChange={() =>
                              setDraftFilters((d) => ({
                                ...d,
                                product_ids: toggleNumId(d.product_ids, Number(p.id)),
                              }))
                            }
                          />
                          <span>{p.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Priority
                  </span>
                  <div className="mt-2 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5">
                    {(["P1", "P2", "P3", "P4"] as const).map((p) => (
                      <label key={p} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={draftFilters.priorities.includes(p)}
                          onChange={() =>
                            setDraftFilters((d) => ({
                              ...d,
                              priorities: toggleStr(d.priorities, p),
                            }))
                          }
                        />
                        <span>{p}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    SLA status
                  </span>
                  <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5">
                    {SLA_OPTIONS.map((o) => (
                      <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={draftFilters.sla_statuses.includes(o.value)}
                          onChange={() =>
                            setDraftFilters((d) => ({
                              ...d,
                              sla_statuses: toggleStr(d.sla_statuses, o.value),
                            }))
                          }
                        />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => clearDraftFilters()}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  Reset form
                </button>
                <button
                  type="button"
                  onClick={() => setFilterModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => applyFiltersFromModal()}
                  className="rounded-lg bg-[#0F5EA8] px-4 py-2 text-xs font-bold text-white hover:bg-[#0d5290]"
                >
                  Apply filters
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <GlassCard className="mt-4 overflow-hidden border-black/10 bg-white/35 p-0 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 bg-black/[0.04] text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-muted-foreground">
                  <th className="px-4 py-3 text-left">Ticket ID & Subject</th>
                  <th className="px-4 py-3 text-left">Organization</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">SLA Countdown</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      Loading tickets…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      No tickets found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-black/5 transition-colors last:border-0 hover:bg-white/40 dark:border-white/5 dark:hover:bg-white/[0.06]"
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="text-xs font-semibold text-[#1E88E5]">#{row.ticket_code}</div>
                        <div className="mt-1 max-w-[210px] font-semibold text-slate-800 dark:text-slate-100">{row.subject}</div>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[9px] font-bold text-slate-700">
                            {orgCodeFromName(row.organisation_name)}
                          </div>
                          <span className="text-sm text-slate-700 dark:text-slate-200">{row.organisation_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                          {row.product_name}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn("text-xs font-bold", row.priority === "P1" ? "text-[#B91C1C]" : "text-slate-600")}>
                          {row.priority}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusBadgeClass(row.status))}>
                          {formatStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <SlaCountdownCell row={row} />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailOpenId(row.id)}
                          className="inline-flex rounded-lg p-2 text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10"
                          aria-label={`View details for ${row.ticket_code}`}
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-black/10 bg-white/25 px-4 py-3 text-xs text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium">
              {total === 0 ? "No tickets" : `Showing ${from}-${to} of ${total.toLocaleString()} tickets`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-md px-2 py-1 disabled:opacity-40"
              >
                {"<"}
              </button>
              <span className="rounded-md bg-[#0F5EA8] px-3 py-1 font-semibold text-white">{page + 1}</span>
              <span className="text-slate-500">/ {totalPages}</span>
              <button
                type="button"
                disabled={loading || (page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md px-2 py-1 disabled:opacity-40"
              >
                {">"}
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
      {detailOpenId ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/10 dark:bg-zinc-950/90">
            <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4 dark:border-white/10">
              <div>
                <div className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  {detail?.ticket_code ?? "Ticket"}
                </div>
                <h3 className="mt-0.5 text-base font-semibold text-[#1A202C] dark:text-foreground">
                  {detail?.subject ?? "Loading..."}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailOpenId(null);
                  setDetail(null);
                }}
                className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5">
              {detailLoading ? (
                <Loader label="Loading ticket detail..." size="sm" />
              ) : !detail ? (
                <div className="text-xs text-muted-foreground">Ticket detail unavailable.</div>
              ) : (
                <div className="space-y-5">
                  {detail.description ? (
                    <div className="rounded-xl border border-black/10 bg-white/60 p-3 text-sm dark:border-white/10 dark:bg-white/5">
                      {detail.description}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusBadgeClass(detail.status))}>
                      {formatStatusLabel(detail.status)}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                      Priority: {detail.priority}
                    </span>
                    <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">
                      Organization: {detail.organisation_name ?? detail.organisation_id}
                    </span>
                    <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300">
                      Product: {detailProductName}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                      Queue: {detailQueueName}
                    </span>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-semibold">Messages</div>
                    {detail.messages.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No messages yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {detail.messages.map((m) => (
                          <div
                            key={m.id}
                            className={cn(
                              "rounded-xl border p-3 text-xs",
                              m.author_type === "customer"
                                ? "border-sky-200 bg-sky-50 text-slate-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-slate-100"
                                : m.author_type === "agent"
                                  ? "border-emerald-200 bg-emerald-50 text-slate-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-slate-100"
                                  : "border-violet-200 bg-violet-50 text-slate-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-slate-100"
                            )}
                          >
                            <div className="mb-1 font-semibold text-slate-700 dark:text-slate-200">
                              {m.author_name || `User ${m.author_user_id ?? "-"}`} - {new Date(m.created_at).toLocaleString()}
                            </div>
                            <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{m.body}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-semibold">Attachments</div>
                      {detail.attachments.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No attachments yet.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {detail.attachments.map((a) => (
                            <div key={a.id} className="text-xs text-slate-700 dark:text-slate-200">
                              {a.file_name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-semibold">Timeline</div>
                      {detail.events.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No timeline events yet.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {detail.events.slice(0, 12).map((e) => (
                            <div key={e.id} className="text-xs text-slate-700 dark:text-slate-200">
                              {e.event_type} - {new Date(e.created_at).toLocaleString()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-black/10 px-5 py-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => detailOpenId && onOpenTicket?.(detailOpenId)}
                className="rounded-lg bg-[#0F5EA8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0d5290]"
              >
                Open full ticket page
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
