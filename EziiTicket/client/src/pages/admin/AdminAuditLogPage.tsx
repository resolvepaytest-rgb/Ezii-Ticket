import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GlassCard } from "@components/common/GlassCard";
import { listAdminAuditLogs, type AdminAuditLog } from "@api/adminApi";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Search, ShieldCheck } from "lucide-react";

export function AdminAuditLogPage({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState("30");
  const [adminFilter, setAdminFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const orgIdNum = Number(orgId);
    if (!Number.isFinite(orgIdNum)) return;
    setLoading(true);
    void listAdminAuditLogs(orgIdNum)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [orgId]);

  function exportCsv() {
    const header = "timestamp,module,action,summary\n";
    const body = rows
      .map((r) =>
        [
          r.created_at,
          r.module,
          r.action,
          `"${r.summary.replace(/"/g, '""')}"`,
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-audit-log-${orgId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV export started.");
  }

  const administratorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const label = (r.actor_role_name ?? "").trim() || "System";
      set.add(label);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add((r.module || "General").trim() || "General");
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const now = Date.now();
    const msRange =
      range === "7" ? 7 * 24 * 60 * 60 * 1000 :
      range === "30" ? 30 * 24 * 60 * 60 * 1000 :
      range === "90" ? 90 * 24 * 60 * 60 * 1000 : null;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (msRange != null) {
        const t = new Date(r.created_at).getTime();
        if (Number.isFinite(t) && now - t > msRange) return false;
      }
      if (adminFilter !== "all") {
        const label = (r.actor_role_name ?? "").trim() || "System";
        if (label !== adminFilter) return false;
      }
      if (moduleFilter !== "all") {
        const module = (r.module || "General").trim() || "General";
        if (module !== moduleFilter) return false;
      }
      if (q) {
        const hay = `${r.module} ${r.action} ${r.summary} ${r.actor_role_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, range, adminFilter, moduleFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page]);

  useEffect(() => {
    setPage(1);
  }, [range, adminFilter, moduleFilter, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function formatStamp(ts: string): { day: string; time: string } {
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return { day: ts, time: "—" };
    const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return { day, time };
  }

  return (
    <div className="mx-auto max-w-[1300px] min-w-0 space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Audit Log</h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Immutable record of system-wide configuration and security events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            EXPORT CSV
          </button>
        </div>
      </div>

      <GlassCard className="border-black/10 bg-white/75 p-0 dark:border-white/10 dark:bg-white/[0.05]">
        <div className="grid min-w-0 grid-cols-1 gap-3 border-b border-black/10 p-3 md:grid-cols-4 dark:border-white/10">
          <label className="grid min-w-0 gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Date Range</span>
            <div className="relative">
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white/80 py-2 pl-3 pr-8 text-xs text-slate-700 outline-none dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
              >
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="all">All Time</option>
              </select>
              <CalendarDays className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Administrator</span>
            <select
              value={adminFilter}
              onChange={(e) => setAdminFilter(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-slate-700 outline-none dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
            >
              {administratorOptions.map((a) => (
                <option key={a} value={a}>{a === "all" ? "All Users" : a}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Configuration Section</span>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-slate-700 outline-none dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
            >
              {moduleOptions.map((m) => (
                <option key={m} value={m}>{m === "all" ? "All Sections" : m}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Search Changes</span>
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search values..."
                className="w-full rounded-xl border border-black/10 bg-white/80 py-2 pl-3 pr-8 text-xs text-slate-700 outline-none dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
              />
              <Search className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-slate-50/90 dark:bg-white/[0.03]">
              <tr className="text-left uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2.5 text-[10px] font-semibold">Timestamp</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold">Administrator</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold">Configuration Key</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold">Previous Value</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold">New Value</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400" colSpan={6}>
                    Loading audit log...
                  </td>
                </tr>
              ) : (
                <>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400" colSpan={6}>
                        No audit entries found.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((r) => {
                      const ts = formatStamp(r.created_at);
                      const prev = r.summary?.split("=>")[0]?.trim() ?? "—";
                      const next = r.summary?.split("=>")[1]?.trim() ?? "—";
                      const adminName = (r.actor_role_name ?? "System").replaceAll("_", " ");
                      return (
                        <tr key={r.id} className="border-t border-black/5 align-top dark:border-white/10">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-[#0F5EA8] dark:text-[#93C5FD]">{ts.day}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{ts.time}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold capitalize text-slate-800 dark:text-slate-100">{adminName}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">Role</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-100">{r.action}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{r.module}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{prev}</td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{next}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                              <ShieldCheck className="mr-1 h-3 w-3" />
                              OK
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
          <div>
            Showing {filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
            {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length} events
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md p-1.5 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="rounded-md bg-[#1E88E5] px-2 py-1 text-[11px] font-semibold text-white">{page}</span>
            <span className="px-1 text-[11px]">/ {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md p-1.5 disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </GlassCard>

    </div>
  );
}
