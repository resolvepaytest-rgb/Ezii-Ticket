import { GlassCard } from "@components/common/GlassCard";
import { useEffect, useId, useMemo, useState } from "react";
import {
  getDashboardMyAssignedTickets,
  getDashboardMySlaRisk,
  getDashboardTeamQueueLoad,
  getOrganisationProducts,
  listUsers,
  type DashboardMyAssignedTickets,
  type DashboardMySlaRisk,
  type DashboardTeamQueueLoad,
  type OrganisationProduct,
  type User,
} from "@api/adminApi";
import { listMyTickets, listTickets, type TicketRow } from "@api/ticketApi";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@store/useAuthStore";
import {
  AlertTriangle,
  ArrowUp,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Hourglass,
  Loader2,
  Megaphone,
  Monitor,
  Plus,
  Signal,
  Smile,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";

type DashboardViewMode = "team" | "my_view";
type DashboardRole = "customer" | "org_admin" | "agent" | "team_lead" | "system_admin";

type TeamDashboardPageProps = {
  role: DashboardRole;
  viewMode: DashboardViewMode;
  orgId: string;
  /** Multiple nav keys use `/dashboard`; use this to pick the right layout (e.g. customer org vs my). */
  dashboardNavKey?: string;
  refreshSeconds: number;
  onRefreshSecondsChange?: (seconds: number) => void;
  /** Org admin dashboard: "View all" tickets navigation */
  onNavigateToTickets?: () => void;
  /** Customer dashboard: "Create new ticket" navigation */
  onNavigateToCreateTicket?: () => void;
};

type Widget = {
  key: string;
  title: string;
  desc: string;
};

const MY_WIDGETS_BASE: Widget[] = [
  { key: "my_assigned_tickets", title: "Assigned Tickets", desc: "Tickets assigned to me, sorted by SLA deadline." },
  { key: "my_sla_risk", title: "SLA Risk", desc: "My warning and breached tickets requiring immediate action." },
  { key: "my_activity", title: "Activity", desc: "Today opened, updated, resolved, and replied counts." },
  { key: "my_recent", title: "Recent", desc: "Last touched tickets with one-click open access." },
];

const TEAM_WIDGETS_BASE: Widget[] = [
  { key: "team_queue_load", title: "Queue Load", desc: "Open/unassigned ticket load by queue and product." },
  { key: "team_sla_health", title: "SLA Health", desc: "On-track, warning, and breached status across team queues." },
  { key: "team_escalations", title: "Escalations", desc: "Flow and volume of L1 -> L2 -> L3 escalations." },
  { key: "team_oldest_backlog", title: "Oldest Backlog", desc: "Longest-open tickets by age and owner." },
  { key: "team_trend", title: "Trend", desc: "Created vs resolved trend and net queue movement." },
];

const CUSTOMER_MY_EXTRAS: Widget[] = [
  { key: "customer_status", title: "Status Split", desc: "Open, pending, and escalated ticket breakdown." },
];

const ORG_ADMIN_TEAM_EXTRAS: Widget[] = [
  { key: "org_top_categories", title: "Top Categories", desc: "Most frequent issue categories in this organisation." },
];

const AGENT_MY_EXTRAS: Widget[] = [
  { key: "agent_pending_reply", title: "Pending Customer Reply", desc: "Pending tickets waiting for customer response 24h+." },
];

const TEAM_LEAD_TEAM_EXTRAS: Widget[] = [
  { key: "lead_agent_workload", title: "Agent Workload", desc: "Per-agent open load, response speed, and breach count." },
  { key: "lead_breach_feed", title: "Breach Alert Feed", desc: "Live list of near-breach and breached tickets." },
];

const SYSTEM_ADMIN_TEAM_EXTRAS: Widget[] = [
  { key: "admin_sla_attainment", title: "SLA Attainment %", desc: "Weekly/monthly first response and resolution attainment." },
  { key: "admin_mttr", title: "MTTR by Product", desc: "Mean time to resolution by product with trend delta." },
];

const ACTIVE_STATUSES = new Set(["new", "open", "pending", "escalated", "reopened"]);

function roleTitle(role: DashboardRole, viewMode: DashboardViewMode) {
  const suffix = viewMode === "team" ? "Team Dashboard" : "My Dashboard";
  if (role === "customer") return `Customer ${suffix}`;
  if (role === "org_admin") return `Org Admin ${suffix}`;
  if (role === "agent") return `Agent ${suffix}`;
  if (role === "team_lead") return `Team Lead ${suffix}`;
  return `System Admin ${suffix}`;
}

function widgetsFor(role: DashboardRole, viewMode: DashboardViewMode): Widget[] {
  if (viewMode === "my_view") {
    if (role === "customer") return [...MY_WIDGETS_BASE, ...CUSTOMER_MY_EXTRAS];
    if (role === "org_admin") return [...MY_WIDGETS_BASE];
    if (role === "agent") return [...MY_WIDGETS_BASE, ...AGENT_MY_EXTRAS];
    if (role === "team_lead") return [...MY_WIDGETS_BASE];
    return [...MY_WIDGETS_BASE];
  }

  if (role === "customer") return [...MY_WIDGETS_BASE, ...CUSTOMER_MY_EXTRAS];
  if (role === "org_admin") return [...TEAM_WIDGETS_BASE, ...ORG_ADMIN_TEAM_EXTRAS];
  if (role === "agent") return [...TEAM_WIDGETS_BASE];
  if (role === "team_lead") return [...TEAM_WIDGETS_BASE, ...TEAM_LEAD_TEAM_EXTRAS];
  return [...TEAM_WIDGETS_BASE, ...SYSTEM_ADMIN_TEAM_EXTRAS];
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase() || "—";
}

function nextSlaDeadline(t: TicketRow): string | null {
  const now = Date.now();
  const times: number[] = [];
  if (t.first_response_due_at) {
    const x = new Date(t.first_response_due_at).getTime();
    if (Number.isFinite(x) && x > now) times.push(x);
  }
  if (t.resolution_due_at) {
    const x = new Date(t.resolution_due_at).getTime();
    if (Number.isFinite(x) && x > now) times.push(x);
  }
  if (times.length === 0) return t.first_response_due_at ?? t.resolution_due_at ?? null;
  const min = Math.min(...times);
  return new Date(min).toISOString();
}

function formatNextSlaLabel(iso: string | null, status: string, nowMs = Date.now()) {
  const terminal = ["resolved", "closed", "cancelled"].includes(status.toLowerCase());
  if (terminal || !iso) return "—";
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return "Due";
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatStatusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === "open" || s === "new") return "In Progress";
  if (s === "pending") return "On Hold";
  if (s === "escalated") return "Escalated";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function priorityBadge(p: TicketRow["priority"]) {
  if (p === "P1")
    return {
      label: "P1 — CRITICAL",
      className:
        "border border-orange-200 bg-orange-100 text-orange-950 dark:border-orange-800/60 dark:bg-orange-950/45 dark:text-orange-100",
    };
  if (p === "P2")
    return {
      label: "P2 — HIGH",
      className:
        "border border-amber-200 bg-amber-100 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100",
    };
  return {
    label: `${p}`,
    className: "border border-border bg-muted text-muted-foreground dark:bg-muted/30",
  };
}

type OrgAdminDashboardProps = {
  orgId: string;
  refreshSeconds: number;
  onRefreshSecondsChange?: (seconds: number) => void;
  onNavigateToTickets?: () => void;
};

type CustomerMyDashboardProps = {
  refreshSeconds: number;
  onNavigateToTickets?: () => void;
  onNavigateToCreateTicket?: () => void;
};

function customerStatusPill(status: string) {
  const s = String(status).toLowerCase();
  if (s === "pending") return "bg-orange-100 text-orange-700 dark:bg-orange-950/45 dark:text-orange-300";
  if (s === "resolved" || s === "closed" || s === "cancelled")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300";
  if (s === "open" || s === "new" || s === "reopened")
    return "bg-blue-100 text-blue-700 dark:bg-blue-950/45 dark:text-blue-300";
  return "bg-muted text-muted-foreground";
}

function CustomerMyDashboard({
  refreshSeconds,
  onNavigateToTickets,
  onNavigateToCreateTicket,
}: CustomerMyDashboardProps) {
  const authUser = useAuthStore((s) => s.user);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const orgIdNum = useMemo(() => {
    const n = Number(authUser?.org_id ?? "");
    return Number.isFinite(n) ? n : null;
  }, [authUser?.org_id]);
  const userIdNum = useMemo(() => {
    const n = Number(authUser?.user_id ?? "");
    return Number.isFinite(n) ? n : null;
  }, [authUser?.user_id]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      setLoading(true);
      try {
        const [rows, allUsers] = await Promise.all([
          listMyTickets(),
          orgIdNum ? listUsers(orgIdNum).catch(() => [] as User[]) : Promise.resolve([] as User[]),
        ]);
        if (stopped) return;
        setTickets(Array.isArray(rows) ? rows : []);
        setUsers(Array.isArray(allUsers) ? allUsers : []);
      } catch {
        if (!stopped) {
          setTickets([]);
          setUsers([]);
        }
      } finally {
        if (!stopped) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), Math.max(10, refreshSeconds) * 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [orgIdNum, refreshSeconds]);

  const activeTickets = useMemo(
    () => tickets.filter((t) => ["new", "open", "pending", "escalated", "reopened"].includes(String(t.status).toLowerCase())),
    [tickets]
  );
  const myOpenCount = useMemo(
    () => tickets.filter((t) => ["new", "open", "reopened", "escalated"].includes(String(t.status).toLowerCase())).length,
    [tickets]
  );
  const pendingMyInputCount = useMemo(
    () => tickets.filter((t) => String(t.status).toLowerCase() === "pending").length,
    [tickets]
  );
  const recentlyResolvedCount = useMemo(
    () =>
      tickets.filter((t) => {
        const st = String(t.status).toLowerCase();
        if (!["resolved", "closed", "cancelled"].includes(st)) return false;
        const updated = new Date(t.updated_at).getTime();
        return Number.isFinite(updated) && Date.now() - updated <= 14 * 24 * 60 * 60 * 1000;
      }).length,
    [tickets]
  );
  const activeRows = useMemo(
    () =>
      [...activeTickets]
        .sort((a, b) => {
          const da = new Date(nextSlaDeadline(a) ?? a.updated_at).getTime();
          const db = new Date(nextSlaDeadline(b) ?? b.updated_at).getTime();
          return da - db;
        })
        .slice(0, 5),
    [activeTickets]
  );
  const firstName = useMemo(() => {
    const row = users.find((u) => Number(u.user_id) === userIdNum) as
      | (User & { firstName?: string; first_name?: string })
      | undefined;
    const userTableName = row?.firstName || row?.first_name || row?.name || "";
    if (userTableName.trim()) {
      return userTableName.trim().split(/\s+/)[0] || "there";
    }
    const u = authUser as
      | (typeof authUser & {
          name?: string;
          user_name?: string;
          employer_name?: string;
          email?: string;
        })
      | null;
    const display = u?.name || u?.user_name || u?.employer_name || u?.email || "";
    const cleaned = String(display).trim();
    if (!cleaned) return "there";
    const base = cleaned.includes("@") ? cleaned.split("@")[0]! : cleaned;
    return base.split(/\s+/)[0] || "there";
  }, [authUser, userIdNum, users]);

  return (
    <div className="min-h-full text-[13px]">
      <div className="mx-auto max-w-[1320px] px-3 pt-1.5 pb-3">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Welcome back, {firstName}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Everything looks good today. You have{" "}
              <span className="font-semibold text-[hsl(var(--brand))]">{activeTickets.length} tickets</span> awaiting your input.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateToTickets?.()}
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
            >
              <Clock3 className="h-3.5 w-3.5" />
              View History
            </button>
            <button
              type="button"
              onClick={() => onNavigateToCreateTicket?.()}
              className="inline-flex items-center gap-1 rounded-xl bg-[hsl(var(--brand))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Create New Ticket
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          <GlassCard className="p-3.5">
            <div className="flex items-start justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/45">
                <Clock3 className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              </div>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-950/45 dark:text-blue-300">
                Active
              </span>
            </div>
            <div className="mt-3 text-[26px] font-bold tabular-nums leading-none text-foreground">
              {String(myOpenCount).padStart(2, "0")}
            </div>
            <div className="mt-2 text-xs font-medium text-muted-foreground">My Open Tickets</div>
          </GlassCard>

          <GlassCard className="p-3.5">
            <div className="flex items-start justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950/45">
                <Hourglass className="h-4 w-4 text-orange-600 dark:text-orange-300" />
              </div>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:bg-orange-950/45 dark:text-orange-300">
                Waiting
              </span>
            </div>
            <div className="mt-3 text-[26px] font-bold tabular-nums leading-none text-foreground">
              {String(pendingMyInputCount).padStart(2, "0")}
            </div>
            <div className="mt-2 text-xs font-medium text-muted-foreground">Pending My Input</div>
          </GlassCard>

          <GlassCard className="p-3.5">
            <div className="flex items-start justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/45">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
                Resolved
              </span>
            </div>
            <div className="mt-3 text-[26px] font-bold tabular-nums leading-none text-foreground">
              {String(recentlyResolvedCount).padStart(2, "0")}
            </div>
            <div className="mt-2 text-xs font-medium text-muted-foreground">Recently Resolved</div>
          </GlassCard>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <GlassCard className="overflow-hidden p-0 lg:col-span-8">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold text-foreground">Active Support Tickets</h2>
              <button
                type="button"
                onClick={() => onNavigateToTickets?.()}
                className="text-xs font-semibold text-[hsl(var(--brand))] hover:underline"
              >
                View All Tickets
              </button>
            </div>
            <div className="overflow-x-auto scrollbar-slim">
              <table className="w-full min-w-[660px] text-left text-xs">
                <thead>
                  <tr className="bg-muted/50 text-[10px] font-bold uppercase tracking-wide text-muted-foreground dark:bg-muted/25">
                    <th className="px-4 py-2.5">Ticket ID</th>
                    <th className="px-3 py-2.5">Subject</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">SLA Countdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activeRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-sm text-muted-foreground">
                        {loading ? "Loading your tickets..." : "No active support tickets."}
                      </td>
                    </tr>
                  ) : (
                    activeRows.map((row) => {
                      const sla = formatNextSlaLabel(nextSlaDeadline(row), row.status, nowMs);
                      const urgent = sla === "Due" || /m left|h/.test(sla);
                      return (
                        <tr key={row.id} className="hover:bg-muted/35 dark:hover:bg-white/[0.04]">
                          <td className="px-4 py-3 font-semibold text-[hsl(var(--brand))]">{row.ticket_code}</td>
                          <td className="max-w-[360px] px-3 py-3">
                            <div className="line-clamp-2 leading-snug text-[13px] font-semibold text-foreground">{row.subject}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              Updated {new Date(row.updated_at).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                customerStatusPill(row.status)
                              )}
                            >
                              {formatStatusLabel(row.status)}
                            </span>
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 text-right text-sm font-semibold tabular-nums",
                              urgent ? "text-red-600 dark:text-red-400" : "text-foreground/80"
                            )}
                          >
                            {sla}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <div className="space-y-3 lg:col-span-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-foreground/80" />
                <h2 className="text-lg font-semibold leading-none text-foreground">Announcements</h2>
              </div>
              <GlassCard className="bg-orange-50/70 p-3.5 dark:bg-orange-950/18">
                <div className="text-sm font-semibold text-foreground">Scheduled Maintenance</div>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                  Central US region nodes will be upgraded this Sunday, 02:00 AM UTC. Expect minor latency.
                </p>
              </GlassCard>
              <GlassCard className="mt-2.5 p-3.5">
                <div className="text-sm font-semibold text-foreground">New Knowledge Base Section</div>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                  We added a comprehensive guide on API v3 migrations.
                </p>
                <button type="button" className="mt-2 text-xs font-semibold text-[hsl(var(--brand))] hover:underline">
                  Read More
                </button>
              </GlassCard>
            </div>
            <div>
              <h3 className="mb-2 text-base font-semibold text-foreground">Quick Resources</h3>
              <GlassCard className="p-3.5">
                <div className="text-sm font-semibold text-foreground">User Manual 2026</div>
                <div className="mt-1 text-xs text-muted-foreground">Updated documentation and setup notes.</div>
              </GlassCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrgAdminDashboard({
  orgId,
  refreshSeconds,
  onRefreshSecondsChange,
  onNavigateToTickets,
}: OrgAdminDashboardProps) {
  const authUser = useAuthStore((s) => s.user);
  const currentUserId = Number(authUser?.user_id ?? 0);
  const orgIdNum = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<OrganisationProduct[]>([]);
  const [queueLoad, setQueueLoad] = useState<DashboardTeamQueueLoad | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!orgIdNum) return;
    let stopped = false;

    const load = async () => {
      setLoading(true);
      try {
        const [tk, u, pr, ql] = await Promise.all([
          listTickets({ limit: 500 }).catch(() => [] as TicketRow[]),
          listUsers(orgIdNum).catch(() => [] as User[]),
          getOrganisationProducts(orgIdNum).catch(() => [] as OrganisationProduct[]),
          getDashboardTeamQueueLoad(),
        ]);
        if (stopped) return;
        setTickets(Array.isArray(tk) ? tk : []);
        setUsers(Array.isArray(u) ? u : []);
        setProducts(Array.isArray(pr) ? pr : []);
        setQueueLoad(ql);
      } catch {
        if (stopped) return;
        setTickets([]);
        setUsers([]);
        setProducts([]);
        setQueueLoad(null);
      } finally {
        if (!stopped) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), Math.max(10, refreshSeconds) * 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [orgIdNum, refreshSeconds]);

  const productNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of products) m.set(p.product_id, p.name?.trim() || `Product ${p.product_id}`);
    return m;
  }, [products]);

  const userNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of users) m.set(Number(u.user_id), u.name || u.email || "User");
    return m;
  }, [users]);

  const activeTickets = useMemo(
    () => tickets.filter((t) => ACTIVE_STATUSES.has(String(t.status).toLowerCase())),
    [tickets]
  );

  const openCount = activeTickets.length;

  const pendingMyResponse = useMemo(() => {
    return activeTickets.filter(
      (t) =>
        t.assignee_user_id != null &&
        Number(t.assignee_user_id) === currentUserId &&
        ["open", "new", "reopened", "escalated", "pending"].includes(String(t.status).toLowerCase())
    );
  }, [activeTickets, currentUserId]);

  const urgentPending = useMemo(
    () => pendingMyResponse.filter((t) => t.priority === "P1" || t.priority === "P2"),
    [pendingMyResponse]
  );

  const slaCompliancePct = useMemo(() => {
    const withDeadline = activeTickets.filter((t) => nextSlaDeadline(t));
    if (withDeadline.length === 0) return null;
    const now = Date.now();
    let ok = 0;
    for (const t of withDeadline) {
      const d = nextSlaDeadline(t);
      if (!d) continue;
      if (new Date(d).getTime() >= now) ok += 1;
    }
    return (ok / withDeadline.length) * 100;
  }, [activeTickets]);

  const openTrendText = useMemo(() => {
    const now = Date.now();
    const d30 = 30 * 24 * 60 * 60 * 1000;
    const cur = tickets.filter((t) => {
      const c = new Date(t.created_at).getTime();
      return Number.isFinite(c) && c >= now - d30 && c <= now;
    }).length;
    const prev = tickets.filter((t) => {
      const c = new Date(t.created_at).getTime();
      return Number.isFinite(c) && c >= now - 2 * d30 && c < now - d30;
    }).length;
    if (prev === 0 && cur === 0) return "No prior period data";
    if (prev === 0) return "+100% vs prior month";
    const pct = Math.round(((cur - prev) / prev) * 100);
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct}% vs last month`;
  }, [tickets]);

  const volumeByProduct = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of activeTickets) {
      const name = productNameById.get(t.product_id) ?? "Other";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const fromQueues = queueLoad?.by_product ?? [];
    if (counts.size === 0 && fromQueues.length > 0) {
      return fromQueues.slice(0, 8).map((x) => ({
        label: x.product_name.toUpperCase().slice(0, 12),
        value: Math.max(1, x.queue_count * 3),
      }));
    }
    const arr = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (arr.length === 0) {
      return [
        { label: "PAYROLL", value: 8 },
        { label: "LEAVE", value: 6 },
        { label: "IT", value: 12 },
        { label: "HR", value: 5 },
        { label: "ADMIN", value: 4 },
      ];
    }
    return arr.map(([label, value]) => ({ label: label.toUpperCase().slice(0, 12), value }));
  }, [activeTickets, productNameById, queueLoad?.by_product]);

  const maxVol = useMemo(() => Math.max(1, ...volumeByProduct.map((x) => x.value)), [volumeByProduct]);

  const csatSeries = useMemo(() => {
    const base = slaCompliancePct != null ? Math.min(5, 3.5 + (slaCompliancePct / 100) * 1.2) : 4.6;
    return [base - 0.35, base - 0.2, base - 0.08, base].map((x) => Math.round(x * 10) / 10);
  }, [slaCompliancePct]);

  const csatAvg = csatSeries[3] ?? 4.8;

  const priorityRows = useMemo(() => {
    const p12 = activeTickets.filter((t) => t.priority === "P1" || t.priority === "P2");
    return [...p12]
      .sort((a, b) => {
        const da = new Date(nextSlaDeadline(a) ?? 0).getTime();
        const db = new Date(nextSlaDeadline(b) ?? 0).getTime();
        return da - db;
      })
      .slice(0, 6);
  }, [activeTickets]);

  const linePoints = useMemo(() => {
    const w = 280;
    const h = 120;
    const pad = 16;
    const vals = csatSeries;
    const min = Math.min(...vals) - 0.1;
    const max = Math.max(...vals) + 0.1;
    const range = max - min || 1;
    return vals.map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / Math.max(1, vals.length - 1);
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return { x, y };
    });
  }, [csatSeries]);

  const linePathD = useMemo(() => {
    if (linePoints.length === 0) return "";
    return linePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  }, [linePoints]);

  const chartGradId = useId().replace(/:/g, "");

  return (
    <div className="min-h-full text-[13px]">
      <div className="mx-auto max-w-[1400px] px-3 pt-1.5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Organisation Dashboard</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Organisation overview, SLA health, and priority work.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(var(--brand))]" />
                Updating…
              </span>
            ) : null}
            <GlassCard className="flex items-center gap-1.5 px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">Refresh</span>
              <select
                value={String(refreshSeconds)}
                onChange={(e) => onRefreshSecondsChange?.(Number(e.target.value))}
                className="rounded-lg border border-border bg-background/90 px-2 py-1 text-xs text-foreground"
              >
                <option value="60">60s</option>
                <option value="10">10s</option>
              </select>
            </GlassCard>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <GlassCard className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--brand)/0.15)] dark:bg-[hsl(var(--brand)/0.25)]">
                <Monitor className="h-5 w-5 text-[hsl(var(--brand))]" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</span>
            </div>
            <div className="mt-4 text-xs font-medium text-muted-foreground">Open Tickets</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{openCount}</div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--brand))]">
              <ArrowUp className="h-3.5 w-3.5" />
              {openTrendText}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/50">
                <ClipboardList className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Action required
              </span>
            </div>
            <div className="mt-4 text-xs font-medium text-muted-foreground">Pending My Response</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{pendingMyResponse.length}</div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {urgentPending.length} urgent items
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/45">
                <BadgeCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Performance
              </span>
            </div>
            <div className="mt-4 text-xs font-medium text-muted-foreground">SLA Compliance</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {slaCompliancePct != null ? `${slaCompliancePct.toFixed(1)}%` : "—"}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" />
              {slaCompliancePct != null && slaCompliancePct >= 90 ? "Meeting targets" : "Review deadlines"}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted dark:bg-muted/50">
                <Smile className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Feedback</span>
            </div>
            <div className="mt-4 text-xs font-medium text-muted-foreground">CSAT 30-day Avg</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{csatAvg.toFixed(1)}/5</div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--brand))]">
              <ThumbsUp className="h-3.5 w-3.5" />
              High satisfaction
            </div>
          </GlassCard>
        </div>

        {/* Charts + service */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <GlassCard className="p-4 lg:col-span-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Ticket Volume by Product</h2>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Last 30 days
              </span>
            </div>
            <div className="flex h-[180px] items-end justify-between gap-2 border-b border-border pb-1 pt-2">
              {volumeByProduct.map((row) => (
                <div key={row.label} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full max-w-[48px] rounded-t-md bg-gradient-to-b from-[hsl(var(--brand))] to-[hsl(var(--brand-2))] transition-all dark:from-[hsl(var(--brand)/0.95)] dark:to-[hsl(var(--brand-2)/0.85)]"
                    style={{ height: `${Math.max(8, (row.value / maxVol) * 140)}px` }}
                  />
                  <span className="text-center text-[10px] font-semibold uppercase leading-tight text-muted-foreground">
                    {row.label}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-4 lg:col-span-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">CSAT Trend</h2>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Week over week
              </span>
            </div>
            <svg viewBox="0 0 280 120" className="h-[160px] w-full text-[hsl(var(--brand))]">
              <defs>
                <linearGradient id={`csatFill-${chartGradId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0} />
                </linearGradient>
              </defs>
              {linePoints.length > 1 ? (
                <path
                  d={`${linePathD} L ${linePoints[linePoints.length - 1]!.x} 104 L ${linePoints[0]!.x} 104 Z`}
                  fill={`url(#csatFill-${chartGradId})`}
                />
              ) : null}
              <path d={linePathD} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              {linePoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="hsl(var(--card))"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              ))}
            </svg>
            <div className="mt-2 flex justify-between px-1 text-xs font-medium text-muted-foreground">
              <span>W1</span>
              <span>W2</span>
              <span>W3</span>
              <span>W4</span>
            </div>
          </GlassCard>

          <GlassCard className="flex flex-col justify-between border-0 bg-gradient-to-br from-[hsl(var(--brand))] to-[hsl(var(--brand-2))] p-4 text-white shadow-lg dark:from-[hsl(var(--brand)/0.92)] dark:to-[hsl(var(--brand-2)/0.88)] dark:shadow-black/40 lg:col-span-4">
            <div>
              <Signal className="h-5 w-5 opacity-90" />
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest opacity-90">Service status</p>
              <h3 className="mt-2 text-lg font-bold">Platform Active</h3>
              <p className="mt-2 text-xs leading-relaxed opacity-95">
                Ezii platform is running at full capacity. All core services are operational for your organisation.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/25 pt-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Avg uptime</div>
                <div className="mt-1 text-base font-semibold tabular-nums">99.98%</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Response</div>
                <div className="mt-1 text-base font-semibold tabular-nums">120ms</div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Table + announcements */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <GlassCard className="overflow-hidden p-0 lg:col-span-8">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Recent Priority Tickets (P1 &amp; P2)</h2>
              <button
                type="button"
                onClick={() => onNavigateToTickets?.()}
                className="text-xs font-semibold text-[hsl(var(--brand))] hover:underline"
              >
                View all
              </button>
            </div>
            <div className="overflow-x-auto scrollbar-slim">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground dark:bg-muted/30">
                    <th className="px-5 py-2.5">Ticket ID</th>
                    <th className="px-3 py-2.5">Subject</th>
                    <th className="px-3 py-2.5">Priority</th>
                    <th className="px-3 py-2.5">Agent</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Next SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {priorityRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                        No P1/P2 tickets in active states.
                      </td>
                    </tr>
                  ) : (
                    priorityRows.map((row) => {
                      const agentId = row.assignee_user_id != null ? Number(row.assignee_user_id) : null;
                      const agentName = agentId ? userNameById.get(agentId) : null;
                      const initials = agentName ? initialsFromName(agentName) : "—";
                      const slaIso = nextSlaDeadline(row);
                      const slaLabel = formatNextSlaLabel(slaIso, row.status, nowMs);
                      const pri = priorityBadge(row.priority);
                      const st = formatStatusLabel(row.status);
                      const urgentSla =
                        slaIso != null && new Date(slaIso).getTime() - nowMs < 15 * 60 * 1000;
                      return (
                        <tr key={row.id} className="hover:bg-muted/40 dark:hover:bg-white/[0.04]">
                          <td className="px-5 py-3.5 font-semibold text-foreground">#{row.ticket_code}</td>
                          <td className="max-w-[220px] px-3 py-3.5">
                            <div className="line-clamp-1 font-semibold text-foreground">{row.subject}</div>
                            <div className="line-clamp-1 text-xs text-muted-foreground">Updated recently</div>
                          </td>
                          <td className="px-3 py-3.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                                pri.className
                              )}
                            >
                              {pri.label}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground dark:bg-muted/60">
                              {initials}
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-xs font-semibold text-orange-600 dark:text-orange-400">{st}</td>
                          <td
                            className={cn(
                              "px-5 py-3.5 text-xs font-semibold tabular-nums",
                              urgentSla
                                ? "text-red-600 dark:text-red-400"
                                : "text-foreground/80 dark:text-foreground/90"
                            )}
                          >
                            {slaLabel}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <div className="lg:col-span-4">
            <div className="mb-3 flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-foreground/80" />
              <h2 className="text-sm font-semibold text-foreground">Announcements</h2>
            </div>
            <div className="space-y-3">
              <GlassCard className="overflow-hidden p-0">
                <div className="border-l-4 border-orange-500 py-3 pl-3.5 pr-3.5 dark:border-orange-400">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                    Maintenance
                  </div>
                  <div className="mt-1 font-semibold text-foreground">Scheduled Update</div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>Sunday 02:00–04:00 IST</span>
                  </div>
                </div>
              </GlassCard>
              <GlassCard className="overflow-hidden p-0">
                <div className="border-l-4 border-[hsl(var(--brand))] py-3 pl-3.5 pr-3.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--brand))]">
                    Feature release
                  </div>
                  <div className="mt-1 font-semibold text-foreground">AI Smart Tagging</div>
                  <button
                    type="button"
                    className="mt-3 text-xs font-semibold text-[hsl(var(--brand))] hover:underline"
                  >
                    Read release notes
                  </button>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamDashboardPage({
  role,
  viewMode,
  orgId,
  dashboardNavKey,
  refreshSeconds,
  onRefreshSecondsChange,
  onNavigateToTickets,
  onNavigateToCreateTicket,
}: TeamDashboardPageProps) {
  const orgIdNum = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);
  const title = roleTitle(role, viewMode);
  const widgets = widgetsFor(role, viewMode);
  const canUseRealtimeToggle = role === "team_lead" || role === "system_admin";
  const [queueLoad, setQueueLoad] = useState<DashboardTeamQueueLoad | null>(null);
  const [myAssigned, setMyAssigned] = useState<DashboardMyAssignedTickets | null>(null);
  const [mySlaRisk, setMySlaRisk] = useState<DashboardMySlaRisk | null>(null);
  const [myTickets, setMyTickets] = useState<TicketRow[]>([]);
  const [isMyTicketsLoading, setIsMyTicketsLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [templateQuery, setTemplateQuery] = useState("");

  useEffect(() => {
    if (!orgIdNum) return;
    if (role === "org_admin") return;
    if (dashboardNavKey === "org_dashboard") return;
    let stopped = false;

    const load = async () => {
      try {
        const [ql, ma, sr] = await Promise.all([
          getDashboardTeamQueueLoad(),
          getDashboardMyAssignedTickets(),
          getDashboardMySlaRisk(),
        ]);
        if (stopped) return;
        setQueueLoad(ql);
        setMyAssigned(ma);
        setMySlaRisk(sr);
      } catch {
        if (stopped) return;
        setQueueLoad(null);
        setMyAssigned(null);
        setMySlaRisk(null);
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, Math.max(10, refreshSeconds) * 1000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [orgIdNum, refreshSeconds, role, dashboardNavKey]);

  const queueLoadSummary = useMemo(
    () => ({
      totalQueues: queueLoad?.total_queues ?? 0,
      byProduct: queueLoad?.by_product?.slice(0, 4) ?? [],
      available: queueLoad?.available ?? false,
    }),
    [queueLoad]
  );

  const shouldRenderDefaultTeamLayout =
    !((dashboardNavKey === "org_dashboard" || role === "org_admin") && !(role === "customer" && viewMode === "my_view")) &&
    !(role === "customer" && viewMode === "my_view");

  useEffect(() => {
    if (!shouldRenderDefaultTeamLayout) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [shouldRenderDefaultTeamLayout]);

  useEffect(() => {
    if (!shouldRenderDefaultTeamLayout) return;
    let stopped = false;

    const load = async () => {
      setIsMyTicketsLoading(true);
      try {
        const rows = await listMyTickets();
        if (stopped) return;
        setMyTickets(Array.isArray(rows) ? rows : []);
      } catch {
        if (stopped) return;
        setMyTickets([]);
      } finally {
        if (!stopped) setIsMyTicketsLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), Math.max(10, refreshSeconds) * 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [refreshSeconds, shouldRenderDefaultTeamLayout]);

  const myActiveTickets = useMemo(
    () => myTickets.filter((t) => ACTIVE_STATUSES.has(String(t.status).toLowerCase())),
    [myTickets]
  );

  const kpis = useMemo(() => {
    const openTickets = myActiveTickets.filter((t) => ["new", "open", "reopened", "escalated"].includes(String(t.status).toLowerCase()));
    const dueToday = myActiveTickets.filter((t) => {
      const due = nextSlaDeadline(t);
      if (!due) return false;
      const d = new Date(due);
      const now = new Date(nowMs);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    });
    const slaCritical = myActiveTickets.filter((t) => {
      const due = nextSlaDeadline(t);
      if (!due) return false;
      const delta = new Date(due).getTime() - nowMs;
      return Number.isFinite(delta) && delta <= 2 * 60 * 60 * 1000;
    });
    const todayResolutions = myTickets.filter((t) => {
      const st = String(t.status).toLowerCase();
      if (!["resolved", "closed", "cancelled"].includes(st)) return false;
      const d = new Date(t.updated_at);
      const now = new Date(nowMs);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    });
    const efficiency = dueToday.length > 0 ? Math.min(100, Math.round((todayResolutions.length / dueToday.length) * 100)) : 84;
    return {
      openCount: openTickets.length,
      dueTodayCount: dueToday.length,
      criticalCount: slaCritical.length,
      resolvedTodayCount: todayResolutions.length,
      efficiency,
    };
  }, [myActiveTickets, myTickets, nowMs]);

  const queueRows = useMemo(
    () =>
      [...myActiveTickets]
        .sort((a, b) => {
          const da = new Date(nextSlaDeadline(a) ?? a.updated_at).getTime();
          const db = new Date(nextSlaDeadline(b) ?? b.updated_at).getTime();
          return da - db;
        })
        .slice(0, 4),
    [myActiveTickets]
  );

  const activityItems = useMemo(
    () =>
      [...myTickets]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 4)
        .map((t) => {
          const st = String(t.status).toLowerCase();
          let action = "Updated";
          if (st === "resolved" || st === "closed") action = "Resolved";
          else if (st === "escalated") action = "Escalated";
          else if (st === "new") action = "Added Note to";
          return {
            key: t.id,
            title: `${action} ${t.ticket_code}`,
            subtitle: t.subject,
            at: new Date(t.updated_at),
          };
        }),
    [myTickets]
  );

  const teamOverview = useMemo(() => {
    const fromApi = queueLoadSummary.byProduct.slice(0, 3).map((x, idx) => ({
      key: `${x.product_name}-${idx}`,
      label: x.product_name,
      count: Math.max(0, x.queue_count * 3),
      heat: idx === 0 ? "hot" : idx === 1 ? "normal" : "cool",
    }));
    if (fromApi.length > 0) return fromApi;
    return [
      { key: "payroll", label: "Payroll", count: 24, heat: "hot" as const },
      { key: "security", label: "Security", count: 8, heat: "normal" as const },
      { key: "infrastructure", label: "Infrastructure", count: 15, heat: "cool" as const },
    ];
  }, [queueLoadSummary.byProduct]);

  const cannedTemplates = useMemo(() => {
    const all = ["Reset Password Process", "SLA Escalation Notice", "Closing Ticket Statement", "Follow-up Confirmation"];
    const q = templateQuery.trim().toLowerCase();
    if (!q) return all.slice(0, 3);
    return all.filter((x) => x.toLowerCase().includes(q)).slice(0, 3);
  }, [templateQuery]);

  const openTicketDisplay = myAssigned?.available ? myAssigned.assigned_count : kpis.openCount;
  const criticalDisplay = mySlaRisk?.available
    ? mySlaRisk.warning_count + mySlaRisk.breached_count
    : kpis.criticalCount;

  /** `org_dashboard` vs `agent_dashboard` both use `/dashboard`; org-level KPIs only for this key (incl. agent/team_lead Admin view). */
  if (
    (dashboardNavKey === "org_dashboard" || role === "org_admin") &&
    !(role === "customer" && viewMode === "my_view")
  ) {
    return (
      <OrgAdminDashboard
        orgId={orgId}
        refreshSeconds={refreshSeconds}
        onRefreshSecondsChange={onRefreshSecondsChange}
        onNavigateToTickets={onNavigateToTickets}
      />
    );
  }

  if (role === "customer" && viewMode === "my_view") {
    return (
      <CustomerMyDashboard
        refreshSeconds={refreshSeconds}
        onNavigateToTickets={onNavigateToTickets}
        onNavigateToCreateTicket={onNavigateToCreateTicket}
      />
    );
  }

  return (
    <div className="min-h-full px-2.5 pb-4 pt-1 text-[11px]">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold tracking-tight text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground">
              {widgets.length} configured widgets for this role.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isMyTicketsLoading ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Syncing...
              </span>
            ) : null}
            {canUseRealtimeToggle ? (
              <select
                value={String(refreshSeconds)}
                onChange={(e) => onRefreshSecondsChange?.(Number(e.target.value))}
                className="rounded-lg border border-border bg-background/90 px-2 py-1 text-xs text-foreground"
              >
                <option value="60">60s</option>
                <option value="10">10s (real-time)</option>
              </select>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <GlassCard className="rounded-lg p-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">My Open Tickets</div>
            <div className="mt-1 text-[26px] font-bold leading-none tabular-nums text-[hsl(var(--brand))] dark:text-[hsl(var(--brand-2))]">
              {String(openTicketDisplay).padStart(2, "0")}
            </div>
            <div className="mt-1.5 text-[10px] font-medium text-red-600 dark:text-red-400">+2</div>
          </GlassCard>
          <GlassCard className="rounded-lg p-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tickets Due Today</div>
            <div className="mt-1 text-[26px] font-bold leading-none tabular-nums text-[hsl(var(--brand))] dark:text-[hsl(var(--brand-2))]">
              {String(kpis.dueTodayCount).padStart(2, "0")}
            </div>
            <div className="mt-1.5 text-[10px] font-semibold text-muted-foreground">Targets Met</div>
          </GlassCard>
          <GlassCard className="rounded-lg border border-red-300/70 p-2.5 dark:border-red-800/45">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">SLA Breach Warning</div>
            <div className="mt-1 text-[26px] font-bold leading-none tabular-nums text-red-600 dark:text-red-400">
              {String(criticalDisplay).padStart(2, "0")}
            </div>
            <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              Critical
            </div>
          </GlassCard>
          <GlassCard className="rounded-lg !border-[hsl(var(--brand)/0.45)] !bg-[hsl(var(--brand))] !backdrop-blur-none p-2.5 !text-white dark:!border-[hsl(var(--brand)/0.35)] dark:!bg-[hsl(var(--brand)/0.95)]">
            <div className="text-[11px] font-bold uppercase tracking-wide !text-white/85">Today's Resolutions</div>
            <div className="mt-1 text-[26px] font-bold leading-none tabular-nums !text-white">{String(kpis.resolvedTodayCount).padStart(2, "0")}</div>
            <div className="mt-1.5 text-[10px] font-semibold !text-white/95">{kpis.efficiency}% Efficiency</div>
          </GlassCard>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-12">
          <GlassCard className="overflow-hidden p-0 lg:col-span-8">
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
              <h2 className="text-lg font-semibold leading-none text-[hsl(var(--brand))]">My Active Queue</h2>
              <button
                type="button"
                onClick={() => onNavigateToTickets?.()}
                className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--brand))] hover:underline"
              >
                View All
              </button>
            </div>
            <div className="overflow-x-auto scrollbar-slim">
              <table className="w-full min-w-[640px] text-left text-[11px]">
                <thead>
                  <tr className="bg-muted/55 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-3.5 py-1.5">Ticket ID</th>
                    <th className="px-2 py-1.5">Priority</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Product</th>
                    <th className="px-3.5 py-1.5 text-right">SLA Countdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {queueRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3.5 py-5 text-xs text-muted-foreground">
                        {isMyTicketsLoading ? "Loading queue..." : "No active queue items yet."}
                      </td>
                    </tr>
                  ) : (
                    queueRows.map((row) => {
                      const sla = formatNextSlaLabel(nextSlaDeadline(row), row.status, nowMs);
                      const pri = priorityBadge(row.priority);
                      return (
                        <tr key={row.id} className="hover:bg-muted/30 dark:hover:bg-white/[0.04]">
                          <td className="px-3.5 py-2 text-xs font-bold text-[hsl(var(--brand))]">{row.ticket_code}</td>
                          <td className="px-2 py-2">
                            <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold", pri.className)}>
                              {pri.label.replace(" — ", " ")}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-[11px] text-foreground">{formatStatusLabel(row.status)}</td>
                          <td className="px-2 py-2 text-[11px] text-foreground/80">Product {row.product_id}</td>
                          <td
                            className={cn(
                              "px-3.5 py-2 text-right text-sm font-semibold tabular-nums",
                              /m left|Due/.test(sla) ? "text-red-600 dark:text-red-400" : "text-foreground/80"
                            )}
                          >
                            {sla}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <div className="space-y-2 lg:col-span-4">
            <GlassCard className="rounded-xl border-0 bg-gradient-to-b from-[hsl(var(--brand))] to-blue-800 p-2.5 text-white">
              <h3 className="text-xl font-semibold">Canned Responses</h3>
              <div className="mt-2 rounded-lg bg-white/15 px-2.5 py-1.5">
                <input
                  value={templateQuery}
                  onChange={(e) => setTemplateQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full bg-transparent text-xs text-white placeholder:text-white/65 outline-none"
                />
              </div>
              <div className="mt-2 space-y-1.5">
                {cannedTemplates.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-left text-[11px] font-medium text-white transition-colors hover:bg-white/20"
                  >
                    {t}
                  </button>
                ))}
                {cannedTemplates.length === 0 ? <div className="text-sm text-white/80">No templates found.</div> : null}
              </div>
            </GlassCard>

            <GlassCard className="rounded-lg p-2.5">
              <h3 className="text-lg font-semibold leading-none text-[hsl(var(--brand))]">My Activity Log</h3>
              <div className="mt-2 space-y-2">
                {activityItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No recent activity.</div>
                ) : (
                  activityItems.map((item) => (
                    <div key={item.key} className="border-l-2 border-[hsl(var(--brand)/0.28)] pl-2.5">
                      <div className="text-[11px] font-semibold text-[hsl(var(--brand))]">{item.title}</div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">{item.subtitle}</div>
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {Math.max(1, Math.round((nowMs - item.at.getTime()) / 60000))} mins ago
                      </div>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="mt-2.5">
          <h2 className="mb-2 text-xl font-semibold text-[hsl(var(--brand))]">Team Queue Overview</h2>
          {queueLoadSummary.available ? (
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {queueLoadSummary.totalQueues} active queue(s) across products.
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {teamOverview.map((item) => (
              <GlassCard key={item.key} className="rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold text-[hsl(var(--brand))]">{item.label}</div>
                  {item.heat === "hot" ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">Hot</span>
                  ) : null}
                </div>
                <div className="mt-1 text-[24px] font-bold leading-none tabular-nums text-[hsl(var(--brand))]">
                  {String(item.count).padStart(2, "0")}
                </div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Unassigned Tickets
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
