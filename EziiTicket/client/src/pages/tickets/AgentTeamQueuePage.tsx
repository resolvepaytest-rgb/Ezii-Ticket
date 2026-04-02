import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { assignTicket, getTicket, listTickets, updateTicketStatus, type TicketDetail, type TicketRow } from "@api/ticketApi";
import { toast } from "sonner";
import { useAuthStore } from "@store/useAuthStore";

function badgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "open" || s === "reopened") return "bg-blue-100 text-blue-700";
  if (s === "pending") return "bg-amber-100 text-amber-800";
  if (s === "escalated") return "bg-purple-100 text-purple-800";
  if (s === "resolved") return "bg-emerald-100 text-emerald-800";
  if (s === "closed") return "bg-slate-200 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

export function AgentTeamQueuePage() {
  const authUser = useAuthStore((s) => s.user);
  const myUserId = Number(authUser?.user_id ?? 0);
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState<"" | "P1" | "P2" | "P3" | "P4">("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState<20 | 50 | 100>(50);
  const [page, setPage] = useState(1);
  const [assigneeUserId, setAssigneeUserId] = useState<number | "">("");
  const [assigning, setAssigning] = useState(false);
  const [rowActionBusyId, setRowActionBusyId] = useState<number | null>(null);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);
  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * limit;
    return rows.slice(start, start + limit);
  }, [rows, page, limit]);

  const loadRows = async () => {
    setLoading(true);
    try {
      const data = await listTickets({
        status,
        priority: priority || undefined,
        q: search.trim() || undefined,
        unassigned_only: true,
        limit: 200,
      });
      setRows(data);
      setPage(1);
      setSelectedId((prev) => prev ?? (data[0]?.id ?? null));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load team queue");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <GlassCard className="p-4 lg:col-span-2">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Team Queue</h2>
          <p className="text-xs text-muted-foreground">Unassigned tickets with quick assign action.</p>
        </div>
        <div className="mb-3 grid grid-cols-1 gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-black/10 bg-white/5 px-2 py-1 text-xs dark:border-white/10"
          >
            <option value="open">open</option>
            <option value="pending">pending</option>
            <option value="escalated">escalated</option>
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as "" | "P1" | "P2" | "P3" | "P4")}
            className="rounded-md border border-black/10 bg-white/5 px-2 py-1 text-xs dark:border-white/10"
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
            placeholder="Search code/subject"
            className="rounded-md border border-black/10 bg-white/5 px-2 py-1 text-xs dark:border-white/10"
          />
          <button
            type="button"
            onClick={() => void loadRows()}
            className="rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/10"
          >
            Apply Filters
          </button>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Page size</span>
            <select
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value) as 20 | 50 | 100)}
              className="rounded-md border border-black/10 bg-white/5 px-2 py-1 text-xs dark:border-white/10"
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>

        {loading ? (
          <Loader label="Loading queue..." />
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No unassigned tickets found.</div>
        ) : (
          <div className="space-y-2">
            {pagedRows.map((row) => (
              <div
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  row.id === selectedId
                    ? "border-[#0F5EA8] bg-[#0F5EA8]/10"
                    : "border-black/10 bg-white/5 hover:bg-white/10 dark:border-white/10"
                }`}
              >
                <div className="text-xs font-semibold text-[#1E88E5]">{row.ticket_code}</div>
                <div className="mt-1 text-sm font-medium">{row.subject}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${badgeClass(row.status)}`}>
                    {row.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(row.updated_at).toLocaleString()}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={rowActionBusyId === row.id || !myUserId}
                    onClick={(e) => {
                      e.stopPropagation();
                      void claimMeFromRow(row);
                    }}
                    className="rounded border border-black/10 px-2 py-1 text-[11px] dark:border-white/10 disabled:opacity-60"
                  >
                    {rowActionBusyId === row.id ? "Working..." : "Claim Me"}
                  </button>
                  <button
                    type="button"
                    disabled={rowActionBusyId === row.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(row.id);
                    }}
                    className="rounded border border-black/10 px-2 py-1 text-[11px] dark:border-white/10 disabled:opacity-60"
                  >
                    Open Detail
                  </button>
                  <button
                    type="button"
                    disabled={rowActionBusyId === row.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void setPendingFromRow(row);
                    }}
                    className="rounded border border-black/10 px-2 py-1 text-[11px] dark:border-white/10 disabled:opacity-60"
                  >
                    Set Pending
                  </button>
                </div>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-black/10 px-2 py-1 disabled:opacity-50 dark:border-white/10"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded border border-black/10 px-2 py-1 disabled:opacity-50 dark:border-white/10"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4 lg:col-span-3">
        {!selected ? (
          <div className="text-sm text-muted-foreground">Select a ticket to assign.</div>
        ) : detailLoading ? (
          <Loader label="Loading ticket..." />
        ) : !detail ? (
          <div className="text-sm text-muted-foreground">Ticket detail unavailable.</div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-[#1E88E5]">{detail.ticket_code}</div>
            <h3 className="text-lg font-semibold">{detail.subject}</h3>
            <div className="text-sm text-muted-foreground">{detail.description}</div>

            <div className="rounded-lg border border-black/10 bg-white/5 p-3 dark:border-white/10">
              <div className="mb-2 text-sm font-semibold">Quick Assign</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={assigneeUserId}
                  onChange={(e) => setAssigneeUserId(e.target.value ? Number(e.target.value) : "")}
                  className="w-40 rounded-md border border-black/10 bg-white/5 px-2 py-1 text-xs dark:border-white/10"
                  placeholder="assignee user id"
                />
                <button
                  type="button"
                  disabled={assigning}
                  onClick={() => void quickAssign()}
                  className="rounded-md bg-[#0F5EA8] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {assigning ? "Assigning..." : "Assign"}
                </button>
                <button
                  type="button"
                  disabled={assigning || !myUserId}
                  onClick={() => void claimMe()}
                  className="rounded-md border border-black/10 px-3 py-1 text-xs font-semibold dark:border-white/10 disabled:opacity-60"
                >
                  Claim Me
                </button>
              </div>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

