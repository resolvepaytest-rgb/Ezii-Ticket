import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { assignTicket, getTicket, listTickets, updateTicketStatus, type TicketDetail, type TicketRow } from "@api/ticketApi";
import { toast } from "sonner";
import { useAuthStore } from "@store/useAuthStore";
import { cn } from "@/lib/utils";
import { ChevronDown, ListFilter } from "lucide-react";

/** Theme-aware: strong headings / KPI numbers */
const HEADING = "text-foreground";
type LaneKey = "all" | "payroll" | "leave" | "benefits" | "onboarding";
type SortKey = "wait_desc" | "wait_asc" | "priority" | "updated_desc";

const LANE_KEYWORDS: Record<Exclude<LaneKey, "all">, string[]> = {
  payroll: ["payroll", "salary", "wage", "payslip"],
  leave: ["leave", "pto", "vacation", "absence", "holiday"],
  benefits: ["benefit", "insurance", "401", "pension", "medical"],
  onboarding: ["onboard", "new hire", "orientation", "probation"],
};

function initialsFromName(name: string | null | undefined) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase().slice(0, 2);
  return String(name ?? "—")
    .slice(0, 2)
    .toUpperCase() || "—";
}

function waitMsSinceCreated(row: TicketRow, nowMs: number) {
  const t = new Date(row.created_at).getTime();
  return Number.isFinite(t) ? Math.max(0, nowMs - t) : 0;
}

function formatWait(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function nextSlaDeadlineMs(row: TicketRow): number | null {
  const times: number[] = [];
  for (const iso of [row.first_response_due_at, row.resolution_due_at]) {
    if (!iso) continue;
    const x = new Date(iso).getTime();
    if (Number.isFinite(x)) times.push(x);
  }
  if (times.length === 0) return null;
  return Math.min(...times);
}

function priorityPill(p: TicketRow["priority"]) {
  if (p === "P1")
    return {
      label: "P1 CRITICAL",
      className: "border border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200",
    };
  if (p === "P2")
    return {
      label: "P2 HIGH",
      className:
        "border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100",
    };
  if (p === "P3")
    return {
      label: "P3 NORMAL",
      className: "border border-border bg-muted text-foreground",
    };
  return {
    label: "P4 LOW",
    className: "border border-border bg-muted/60 text-muted-foreground",
  };
}

function priorityRank(p: TicketRow["priority"]) {
  if (p === "P1") return 1;
  if (p === "P2") return 2;
  if (p === "P3") return 3;
  return 4;
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "new") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/35 dark:text-blue-200";
  if (s === "open") return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/35 dark:text-sky-200";
  if (s === "pending") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-200";
  if (s === "escalated") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-200";
  if (s === "reopened") return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/35 dark:text-violet-200";
  return "border-border bg-muted text-foreground";
}

type AgentTeamQueuePageProps = {
  onOpenTicket?: (ticketId: number) => void;
};

export function AgentTeamQueuePage({ onOpenTicket }: AgentTeamQueuePageProps) {
  const authUser = useAuthStore((s) => s.user);
  const myUserId = Number(authUser?.user_id ?? 0);
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [status, setStatus] = useState("all");
  const [priorityApi, setPriorityApi] = useState<"" | "P1" | "P2" | "P3" | "P4">("");
  const [search, setSearch] = useState("");
  const [lane, setLane] = useState<LaneKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("wait_desc");
  const [pageSize, setPageSize] = useState<5 | 10 | 20>(5);
  const [page, setPage] = useState(1);
  const [assigneeUserId, setAssigneeUserId] = useState<number | "">("");
  const [assigning, setAssigning] = useState(false);
  const [rowActionBusyId, setRowActionBusyId] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const prevTotalRef = useRef<number | null>(null);
  const [queueTrendPct, setQueueTrendPct] = useState<number | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTickets({
        status: status === "all" ? undefined : status,
        priority: priorityApi || undefined,
        q: searchRef.current.trim() || undefined,
        unassigned_only: true,
        limit: 200,
      });
      const list = Array.isArray(data) ? data : [];
      const prev = prevTotalRef.current;
      prevTotalRef.current = list.length;
      if (prev != null && prev > 0) {
        setQueueTrendPct(Math.round(((list.length - prev) / prev) * 100));
      } else {
        setQueueTrendPct(null);
      }
      setRows(list);
      setPage(1);
      setSelectedId((cur) => (cur && list.some((r) => r.id === cur) ? cur : null));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load team queue");
      setRows([]);
      setQueueTrendPct(null);
    } finally {
      setLoading(false);
    }
  }, [priorityApi, status]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    void getTicket(selectedId)
      .then(setDetail)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load ticket detail");
        setDetail(null);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const laneFiltered = useMemo(() => {
    if (lane === "all") return rows;
    const keys = LANE_KEYWORDS[lane];
    return rows.filter((r) => keys.some((k) => r.subject.toLowerCase().includes(k)));
  }, [rows, lane]);

  const sortedRows = useMemo(() => {
    const copy = [...laneFiltered];
    copy.sort((a, b) => {
      if (sortBy === "wait_desc") return waitMsSinceCreated(b, nowMs) - waitMsSinceCreated(a, nowMs);
      if (sortBy === "wait_asc") return waitMsSinceCreated(a, nowMs) - waitMsSinceCreated(b, nowMs);
      if (sortBy === "priority") return priorityRank(a.priority) - priorityRank(b.priority);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return copy;
  }, [laneFiltered, sortBy, nowMs]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const kpis = useMemo(() => {
    const total = sortedRows.length;
    const waits = sortedRows.map((r) => waitMsSinceCreated(r, nowMs));
    const avgWaitMin =
      waits.length > 0 ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length / 60000) : 0;
    const p12 = sortedRows.filter((r) => r.priority === "P1" || r.priority === "P2").length;
    const atRisk = sortedRows.filter((r) => {
      const terminal = ["resolved", "closed", "cancelled"].includes(String(r.status).toLowerCase());
      if (terminal) return false;
      const due = nextSlaDeadlineMs(r);
      if (due == null) return false;
      const delta = due - nowMs;
      return delta > 0 && delta < 5 * 60 * 1000;
    }).length;
    const p12Ratio = total > 0 ? Math.min(100, Math.round((p12 / total) * 100)) : 0;
    return { total, avgWaitMin, p12, atRisk, p12Ratio };
  }, [sortedRows, nowMs]);

  const quickAssign = async () => {
    if (!selectedId || assigneeUserId === "") {
      toast.error("Assignee user id is required");
      return;
    }
    setAssigning(true);
    try {
      await assignTicket(selectedId, {
        assignee_user_id: assigneeUserId,
        team_id: selected?.team_id ?? null,
        queue_id: selected?.queue_id ?? null,
      });
      toast.success("Ticket assigned");
      setAssigneeUserId("");
      await loadRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigning(false);
    }
  };

  const claimMe = async () => {
    if (!selectedId || !myUserId) {
      toast.error("Current user id unavailable");
      return;
    }
    setAssigning(true);
    try {
      await assignTicket(selectedId, {
        assignee_user_id: myUserId,
        team_id: selected?.team_id ?? null,
        queue_id: selected?.queue_id ?? null,
      });
      toast.success("Ticket claimed by you");
      onOpenTicket?.(selectedId);
      await loadRows();
      setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setAssigning(false);
    }
  };

  const claimMeFromRow = async (row: TicketRow) => {
    if (!myUserId) {
      toast.error("Current user id unavailable");
      return;
    }
    setRowActionBusyId(row.id);
    try {
      await assignTicket(row.id, {
        assignee_user_id: myUserId,
        team_id: row.team_id ?? null,
        queue_id: row.queue_id ?? null,
      });
      toast.success(`${row.ticket_code} claimed`);
      onOpenTicket?.(row.id);
      await loadRows();
      if (selectedId === row.id) setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setRowActionBusyId(null);
    }
  };

  const setPendingFromRow = async (row: TicketRow) => {
    setRowActionBusyId(row.id);
    try {
      await updateTicketStatus(row.id, {
        status: "pending",
        reason: "set_pending_from_queue_row",
      });
      toast.success(`${row.ticket_code} set to pending`);
      await loadRows();
      if (selectedId === row.id) setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set pending");
    } finally {
      setRowActionBusyId(null);
    }
  };

  const waitTargetMin = 15;

  const pageFrom = sortedRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageTo = sortedRows.length === 0 ? 0 : (page - 1) * pageSize + pagedRows.length;

  return (
    <div className={cn("min-h-full rounded-lg px-2 pb-4 pt-1 text-[11px]")}>
      <div className="mx-auto max-w-[1200px] space-y-2">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className={cn("text-xl font-bold tracking-tight sm:text-[22px]", HEADING)}>Team Queue</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Unassigned tickets awaiting action in
              
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "payroll", "leave", "benefits", "onboarding"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setLane(key);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                  lane === key
                    ? "border-[hsl(var(--brand))] bg-card text-[hsl(var(--brand))] shadow-sm dark:border-[hsl(var(--brand)/0.55)] dark:bg-card dark:text-[hsl(var(--brand-2))]"
                    : "border-border bg-card/80 text-muted-foreground hover:bg-card dark:bg-card/60 dark:hover:bg-card/90"
                )}
              >
                {key === "all" ? "All" : key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
            ))}
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
              <ListFilter className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        {/* Server filters — compact row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-[10px] font-medium text-foreground"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="new">New</option>
            <option value="pending">Pending</option>
            <option value="escalated">Escalated</option>
            <option value="reopened">Reopened</option>
          </select>
          <select
            value={priorityApi}
            onChange={(e) => setPriorityApi(e.target.value as "" | "P1" | "P2" | "P3" | "P4")}
            className="h-7 rounded-md border border-border bg-background px-2 text-[10px] font-medium text-foreground"
          >
            <option value="">All priorities</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
            <option value="P4">P4</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void loadRows()}
            placeholder="Search…"
            className="h-7 min-w-[140px] flex-1 rounded-md border border-border bg-background px-2 text-[10px] text-foreground placeholder:text-muted-foreground sm:max-w-[220px]"
          />
          <button
            type="button"
            onClick={() => void loadRows()}
            className="h-7 rounded-md bg-[hsl(var(--brand))] px-2.5 text-[10px] font-semibold text-white shadow-sm hover:opacity-90 dark:text-white"
          >
            Apply
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
          <GlassCard className="rounded-lg p-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Queue total</div>
            <div className={cn("mt-0.5 text-[22px] font-bold tabular-nums leading-none", HEADING)}>{kpis.total}</div>
            <div className="mt-1 text-[9px] font-medium text-red-600 dark:text-red-400">
              {queueTrendPct != null ? `↗ ${queueTrendPct >= 0 ? "+" : ""}${queueTrendPct}% from last refresh` : "—"}
            </div>
          </GlassCard>
          <GlassCard className="rounded-lg p-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Avg wait time</div>
            <div className={cn("mt-0.5 text-[22px] font-bold tabular-nums leading-none", HEADING)}>
              {kpis.total ? `${kpis.avgWaitMin}m` : "—"}
            </div>
            <div className="mt-1 text-[9px] text-muted-foreground">Target: &lt; {waitTargetMin}m</div>
          </GlassCard>
          <GlassCard className="rounded-lg p-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">High priority (P1/P2)</div>
            <div className={cn("mt-0.5 text-[22px] font-bold tabular-nums leading-none", HEADING)}>{kpis.p12}</div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-red-500 transition-all"
                style={{ width: `${kpis.p12Ratio}%` }}
              />
            </div>
          </GlassCard>
          <GlassCard className="rounded-lg p-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">SLA at risk</div>
            <div className={cn("mt-0.5 text-[22px] font-bold tabular-nums leading-none", HEADING)}>{kpis.atRisk}</div>
            <div className="mt-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300">Expiring in &lt; 5m</div>
          </GlassCard>
        </div>

        {/* Table card */}
        <GlassCard className="overflow-hidden rounded-lg p-0">
          <div className="flex flex-col gap-1.5 border-b border-border px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("text-[10px] font-bold uppercase tracking-[0.12em]", HEADING)}>Active team queue</span>
              <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-sky-900 dark:bg-sky-950/60 dark:text-sky-100">
                Real-time update on
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-medium text-muted-foreground">Sort by:</span>
              <div className="relative inline-flex items-center">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as SortKey);
                    setPage(1);
                  }}
                  className={cn(
                    "h-7 appearance-none rounded-md border border-border bg-background py-0 pl-2 pr-7 text-[10px] font-semibold text-foreground"
                  )}
                >
                  <option value="wait_desc">Wait Time (Longest)</option>
                  <option value="wait_asc">Wait Time (Shortest)</option>
                  <option value="priority">Priority (Highest)</option>
                  <option value="updated_desc">Last Updated</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              </div>
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as 5 | 10 | 20);
                  setPage(1);
                }}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-[9px] font-medium text-foreground"
              >
                <option value="5">5 / page</option>
                <option value="10">10 / page</option>
                <option value="20">20 / page</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-6">
              <Loader label="Loading queue..." size="sm" />
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="p-6 text-center text-[11px] text-muted-foreground">No unassigned tickets in this view.</div>
          ) : (
            <div className="overflow-x-auto scrollbar-slim">
              <table className="w-full min-w-[720px] text-left text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-1.5">Priority</th>
                    <th className="px-2 py-1.5">Ticket ID</th>
                    <th className="px-2 py-1.5">Subject</th>
                    <th className="px-2 py-1.5">Requester</th>
                    <th className="px-2 py-1.5">Wait time</th>
                    <th className="px-2 py-1.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedRows.map((row) => {
                    const wait = waitMsSinceCreated(row, nowMs);
                    const waitLabel = formatWait(wait);
                    const urgentWait = wait > waitTargetMin * 60 * 1000;
                    const pill = priorityPill(row.priority);
                    const highPri = row.priority === "P1" || row.priority === "P2";
                    const name = row.reporter_name?.trim() || `User ${row.reporter_user_id}`;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/50",
                          selectedId === row.id && "bg-[hsl(var(--brand)/0.08)] dark:bg-[hsl(var(--brand)/0.15)]"
                        )}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <td className="px-2 py-1.5 align-middle">
                          <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-bold", pill.className)}>
                            {pill.label}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          <span className="font-semibold text-[hsl(var(--brand))] dark:text-[hsl(var(--brand-2))]">
                            #{row.ticket_code}
                          </span>
                        </td>
                        <td className="max-w-[240px] px-2 py-1.5 align-middle">
                          <div className={cn("line-clamp-1 font-semibold leading-tight", HEADING)}>{row.subject}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide",
                                priorityPill(row.priority).className
                              )}
                            >
                              {row.priority}
                            </span>
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide",
                                statusBadgeClass(String(row.status))
                              )}
                            >
                              {String(row.status)}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-foreground">
                              {initialsFromName(name)}
                            </span>
                            <span className="line-clamp-1 text-muted-foreground">{name}</span>
                          </div>
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 align-middle font-semibold tabular-nums",
                            urgentWait ? "text-red-600 dark:text-red-400" : HEADING
                          )}
                        >
                          {waitLabel}
                        </td>
                        <td className="px-2 py-1.5 text-right align-middle">
                          <button
                            type="button"
                            disabled={rowActionBusyId === row.id || !myUserId}
                            onClick={(e) => {
                              e.stopPropagation();
                              void claimMeFromRow(row);
                            }}
                            className={cn(
                              "rounded-md px-2 py-1 text-[10px] font-semibold transition-opacity disabled:opacity-50",
                              highPri
                                ? "bg-primary text-primary-foreground hover:opacity-90"
                                : "border border-border bg-muted/60 text-foreground hover:bg-muted"
                            )}
                          >
                            {rowActionBusyId === row.id ? "…" : "Pick up"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-1.5 border-t border-border px-2.5 py-2 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {sortedRows.length === 0
                ? "No tickets"
                : `Showing ${pageFrom}–${pageTo} of ${sortedRows.length} tickets`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground disabled:opacity-40"
              >
                ‹
              </button>
              {totalPages <= 7 ? (
                Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={cn(
                      "min-w-[1.5rem] rounded border px-1 py-0.5 text-[10px] font-semibold",
                      page === n
                        ? "border-[hsl(var(--brand))] bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand))] dark:bg-[hsl(var(--brand)/0.2)] dark:text-[hsl(var(--brand-2))]"
                        : "border-transparent text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    {n}
                  </button>
                ))
              ) : (
                <span className="tabular-nums text-[10px] font-medium text-foreground">
                  Page {page} / {totalPages}
                </span>
              )}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Compact detail + assign */}
        {selectedId ? (
          <GlassCard className="rounded-lg p-2.5">
            {!selected ? (
              <div className="text-[11px] text-muted-foreground">Select a ticket in the table.</div>
            ) : detailLoading ? (
              <Loader label="Loading…" size="sm" />
            ) : !detail ? (
              <div className="text-[11px] text-muted-foreground">Detail unavailable.</div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold text-[hsl(var(--brand))] dark:text-[hsl(var(--brand-2))]">
                      {detail.ticket_code}
                    </div>
                    <h3 className={cn("text-sm font-semibold leading-snug", HEADING)}>{detail.subject}</h3>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={assigning || !myUserId}
                      onClick={() => void claimMe()}
                      className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Pick up (me)
                    </button>
                    <button
                      type="button"
                      disabled={rowActionBusyId === selected.id}
                      onClick={() => void setPendingFromRow(selected)}
                      className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-foreground"
                    >
                      Set pending
                    </button>
                  </div>
                </div>
                <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{detail.description}</p>
                <div className="flex flex-wrap items-end gap-1.5 border-t border-border pt-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-medium uppercase text-muted-foreground">Assign to user id</span>
                    <input
                      type="number"
                      min={1}
                      value={assigneeUserId}
                      onChange={(e) => setAssigneeUserId(e.target.value ? Number(e.target.value) : "")}
                      className="h-7 w-32 rounded-md border border-border bg-background px-2 text-[10px] text-foreground"
                      placeholder="User id"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={assigning}
                    onClick={() => void quickAssign()}
                    className="h-7 rounded-md bg-[hsl(var(--brand))] px-2.5 text-[10px] font-semibold text-white disabled:opacity-50"
                  >
                    {assigning ? "…" : "Assign"}
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
        ) : null}
      </div>
    </div>
  );
}
