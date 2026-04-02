import { useEffect, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { listTickets, type TicketRow } from "@api/ticketApi";
import { toast } from "sonner";

type StatusFilter = "resolved" | "closed" | "all";

export function AgentHistoryPage() {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("resolved");
  const [limit, setLimit] = useState<20 | 50 | 100>(50);
  const [page, setPage] = useState(1);

  const load = async (nextStatus: StatusFilter) => {
    setLoading(true);
    try {
      if (nextStatus === "all") {
        const [resolved, closed] = await Promise.all([
          listTickets({ status: "resolved", limit: 200 }),
          listTickets({ status: "closed", limit: 200 }),
        ]);
        const merged = [...resolved, ...closed].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
        setRows(merged);
      } else {
        const data = await listTickets({ status: nextStatus, limit: 200 });
        setRows(data);
      }
      setPage(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load history");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(status);
  }, [status]);

  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const pagedRows = rows.slice((page - 1) * limit, (page - 1) * limit + limit);

  return (
    <div className="max-w-4xl">
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Resolved / History</h2>
            <p className="text-xs text-muted-foreground">Simple filter for resolved and closed tickets.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="rounded-md border border-black/10 bg-white/5 px-2 py-1 text-xs dark:border-white/10"
            >
              <option value="resolved">resolved</option>
              <option value="closed">closed</option>
              <option value="all">all</option>
            </select>
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
          <Loader label="Loading history..." />
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No history tickets found.</div>
        ) : (
          <div className="space-y-2">
            {pagedRows.map((row) => (
              <div key={row.id} className="rounded-lg border border-black/10 bg-white/5 p-3 dark:border-white/10">
                <div className="text-xs font-semibold text-[#1E88E5]">{row.ticket_code}</div>
                <div className="mt-1 text-sm font-medium">{row.subject}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  status: {row.status} • updated: {new Date(row.updated_at).toLocaleString()}
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
    </div>
  );
}

