import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import {
  listTickets,
  listTicketFormProducts,
  type TicketFormProduct,
  type TicketRow,
} from "@api/ticketApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ListFilter } from "lucide-react";

/** Links and accents follow brand tokens (see `index.css`) for light/dark consistency. */
const linkClass = "text-[hsl(var(--brand))] dark:text-[hsl(var(--brand-2))]";

type DateRangeKey = "7" | "30" | "90" | "all";
type StatusFilter = "all" | "resolved" | "closed";
type PriorityFilter = "" | "P1" | "P2" | "P3" | "P4";

export type AgentHistoryPageProps = {
  onOpenTicket?: (ticketId: number) => void;
};

function formatResolvedDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
      new Date(iso)
    );
  } catch {
    return iso;
  }
}

function filterByDateRange(rows: TicketRow[], key: DateRangeKey): TicketRow[] {
  if (key === "all") return rows;
  const days = Number(key);
  const cutoff = Date.now() - days * 864e5;
  return rows.filter((r) => new Date(r.updated_at).getTime() >= cutoff);
}

function filterByStatus(rows: TicketRow[], status: StatusFilter): TicketRow[] {
  if (status === "all") return rows;
  return rows.filter((r) => String(r.status).toLowerCase() === status);
}

function filterByProduct(rows: TicketRow[], productId: "" | number): TicketRow[] {
  if (productId === "") return rows;
  return rows.filter((r) => r.product_id === productId);
}

function filterByPriority(rows: TicketRow[], p: PriorityFilter): TicketRow[] {
  if (p === "") return rows;
  return rows.filter((r) => r.priority === p);
}

function productBadgeLabel(row: TicketRow, productById: Map<number, TicketFormProduct>) {
  const p = productById.get(row.product_id);
  const raw = p?.name ?? p?.code ?? `Product ${row.product_id}`;
  return raw.replace(/\s+/g, " ").trim().toUpperCase().slice(0, 22);
}

function assigneeLabel(row: TicketRow) {
  if (row.assignee_user_id == null) return "Unassigned";
  return `Agent #${row.assignee_user_id}`;
}

function assigneeInitials(row: TicketRow) {
  if (row.assignee_user_id == null) return "—";
  const s = String(row.assignee_user_id);
  return s.length <= 2 ? s : s.slice(-2);
}

function uniqueDayCount(rows: TicketRow[]): number {
  const days = new Set<string>();
  for (const r of rows) {
    const d = new Date(r.updated_at);
    if (!Number.isFinite(d.getTime())) continue;
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  return Math.max(1, days.size);
}

function isSameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildPageList(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  for (let d = -1; d <= 1; d++) set.add(current + d);
  const sorted = [...set].filter((p) => p >= 1 && p <= total).sort((x, y) => x - y);
  const out: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (i > 0 && p - sorted[i - 1]! > 1) out.push("ellipsis");
    out.push(p);
  }
  return out;
}

export function AgentHistoryPage({ onOpenTicket }: AgentHistoryPageProps) {
  const [sourceRows, setSourceRows] = useState<TicketRow[]>([]);
  const [products, setProducts] = useState<TicketFormProduct[]>([]);
  const [loading, setLoading] = useState(false);

  const [pendingDateRange, setPendingDateRange] = useState<DateRangeKey>("90");
  const [pendingProductId, setPendingProductId] = useState<"" | number>("");
  const [pendingStatus, setPendingStatus] = useState<StatusFilter>("all");
  const [pendingPriority, setPendingPriority] = useState<PriorityFilter>("");

  const [appliedDateRange, setAppliedDateRange] = useState<DateRangeKey>("90");
  const [appliedProductId, setAppliedProductId] = useState<"" | number>("");
  const [appliedStatus, setAppliedStatus] = useState<StatusFilter>("all");
  const [appliedPriority, setAppliedPriority] = useState<PriorityFilter>("");

  const [page, setPage] = useState(1);
  const pageSize = 25;

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resolved, closed, prods] = await Promise.all([
        listTickets({ status: "resolved", limit: 200 }),
        listTickets({ status: "closed", limit: 200 }),
        listTicketFormProducts(),
      ]);
      const merged = [...resolved, ...closed].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
      setSourceRows(merged);
      setProducts(prods);
      setPage(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load archive");
      setSourceRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    let r = sourceRows;
    r = filterByStatus(r, appliedStatus);
    r = filterByDateRange(r, appliedDateRange);
    r = filterByProduct(r, appliedProductId);
    r = filterByPriority(r, appliedPriority);
    return r;
  }, [sourceRows, appliedStatus, appliedDateRange, appliedProductId, appliedPriority]);

  const kpis = useMemo(() => {
    const total = filteredRows.length;
    const days = uniqueDayCount(filteredRows);
    const historicalAvg = days > 0 ? Math.round((total / days) * 10) / 10 : 0;
    const now = new Date();
    const todayCount = filteredRows.filter((r) => isSameLocalDay(new Date(r.updated_at), now)).length;
    const pct =
      historicalAvg > 0 ? Math.round(((todayCount - historicalAvg) / historicalAvg) * 100) : todayCount > 0 ? 100 : 0;
    return { total, historicalAvg, todayCount, pct };
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const applyFilters = () => {
    setAppliedDateRange(pendingDateRange);
    setAppliedProductId(pendingProductId);
    setAppliedStatus(pendingStatus);
    setAppliedPriority(pendingPriority);
    setPage(1);
  };

  const fromIdx = filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, filteredRows.length);

  const selectClass =
    "h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground shadow-sm outline-none focus:border-[hsl(var(--brand))]/50 focus:ring-1 focus:ring-[hsl(var(--brand))]/25 dark:border-slate-600/70 dark:bg-black/20 dark:shadow-none dark:focus:border-[hsl(var(--brand))]/40";

  const labelClass = "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <div className={cn("min-h-full rounded-lg  ")}>
      <div className="mx-auto max-w-6xl space-y-3 p-3 sm:p-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-base font-bold tracking-tight text-foreground sm:text-[17px]">Resolved Archive</h1>
            <p className="max-w-xl text-[11px] leading-snug text-muted-foreground sm:text-[12px]">
              Accessing {kpis.total.toLocaleString()} historical records in the current view. Efficiency and clarity are
              prioritized for auditing and data retrieval tasks.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <GlassCard className="rounded-lg px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Historical avg</div>
              <div className="text-lg font-bold leading-tight text-card-foreground">{kpis.historicalAvg}</div>
              <div className={cn("text-[10px] font-medium", linkClass)}>Tickets / day</div>
            </GlassCard>
            <GlassCard className="rounded-lg !border-transparent !bg-primary !backdrop-blur-none px-3 py-2 !text-primary-foreground !shadow-md ring-1 ring-black/10 dark:ring-white/15">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-primary-foreground/85">
                Today&apos;s volume
              </div>
              <div className="text-lg font-bold leading-tight text-primary-foreground">{kpis.todayCount}</div>
              <div className="text-[10px] font-medium text-primary-foreground/90">
                {kpis.pct >= 0 ? "+" : ""}
                {kpis.pct}% vs avg
              </div>
            </GlassCard>
          </div>
        </header>

        <GlassCard className="rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="ah-date-range">
                Date range
              </label>
              <select
                id="ah-date-range"
                className={selectClass}
                value={pendingDateRange}
                onChange={(e) => setPendingDateRange(e.target.value as DateRangeKey)}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="ah-product">
                Product category
              </label>
              <select
                id="ah-product"
                className={selectClass}
                value={pendingProductId === "" ? "" : String(pendingProductId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setPendingProductId(v === "" ? "" : Number(v));
                }}
              >
                <option value="">All products</option>
                {products.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="ah-type">
                Type
              </label>
              <select
                id="ah-type"
                className={selectClass}
                value={pendingStatus}
                onChange={(e) => setPendingStatus(e.target.value as StatusFilter)}
              >
                <option value="all">All types</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="ah-priority">
                Priority
              </label>
              <select
                id="ah-priority"
                className={selectClass}
                value={pendingPriority}
                onChange={(e) => setPendingPriority(e.target.value as PriorityFilter)}
              >
                <option value="">All priorities</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
                <option value="P4">P4</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              <ListFilter className="h-3.5 w-3.5" strokeWidth={2.25} />
              Apply
            </button>
          </div>
        </GlassCard>

        <GlassCard className="overflow-hidden rounded-lg p-0">
          {loading ? (
            <div className="p-8">
              <Loader label="Loading archive…" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-[12px] text-foreground">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Ticket ID
                      </th>
                      <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Subject
                      </th>
                      <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Product
                      </th>
                      <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Date resolved
                      </th>
                      <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Agent assigned
                      </th>
                      <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-10 text-center text-[12px] text-muted-foreground"
                        >
                          No tickets match these filters.
                        </td>
                      </tr>
                    ) : (
                      pagedRows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-border last:border-0 hover:bg-muted/40"
                        >
                          <td className="whitespace-nowrap px-3 py-2 align-top">
                            <span className={cn("font-semibold", linkClass)}>#{row.ticket_code}</span>
                          </td>
                          <td className="max-w-[240px] px-3 py-2 align-top">
                            <div className="font-semibold leading-snug text-foreground">{row.subject}</div>
                            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                              Resolution: {String(row.status)} · {row.priority}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle">
                            <span className="inline-block rounded-md bg-[hsl(var(--brand)/0.12)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--brand))] dark:bg-[hsl(var(--brand)/0.22)] dark:text-[hsl(var(--brand-2))]">
                              {productBadgeLabel(row, productById)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle text-muted-foreground">
                            {formatResolvedDate(row.updated_at)}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-foreground">
                                {assigneeInitials(row)}
                              </div>
                              <span className="text-[12px] text-foreground">{assigneeLabel(row)}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle">
                            <button
                              type="button"
                              disabled={!onOpenTicket}
                              onClick={() => onOpenTicket?.(row.id)}
                              className={cn(
                                "text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40",
                                linkClass
                              )}
                            >
                              View snapshot
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <footer className="flex flex-col gap-2 border-t border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Showing {fromIdx} to {toIdx} of {filteredRows.length.toLocaleString()} results
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted/60 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {buildPageList(page, totalPages).map((item, i) =>
                    item === "ellipsis" ? (
                      <span key={`e-${i}`} className="px-1 text-[11px] text-muted-foreground">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPage(item)}
                        className={cn(
                          "flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-2 text-[11px] font-semibold",
                          item === page
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted/70"
                        )}
                      >
                        {item}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted/60 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </footer>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
