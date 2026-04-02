import { GlassCard } from "@components/common/GlassCard";
import {
  getExternalOrganizations,
  getDashboardMySlaRisk,
  getDashboardTeamQueueLoad,
  getSystemOrganisationTicketMetrics,
  listOrganisations,
  listSystemTickets,
  type DashboardMySlaRisk,
  type DashboardTeamQueueLoad,
  type ExternalOrganization,
  type Organisation,
  type OrganisationTicketMetricsPayload,
  type SystemTicketRow,
  type SystemTicketsPayload,
} from "@api/adminApi";
import { EZII_BRAND } from "@/lib/eziiBrand";
import { resolveOrganisationDisplayName } from "@/lib/organisationDisplay";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, Loader2, Network, Star, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PRIMARY = EZII_BRAND.primary;
const SECONDARY = EZII_BRAND.secondary;
const TERTIARY = EZII_BRAND.tertiary;
const GREEN = "#28A745";
const RED = "#DC3545";

const THIRTY_D_MS = 30 * 24 * 60 * 60 * 1000;

type Props = {
  orgId: string;
  refreshSeconds: number;
  onRefreshSecondsChange?: (seconds: number) => void;
  onNavigateToOrganizations?: () => void;
};

function formatInt(n: number) {
  return n.toLocaleString("en-IN");
}

function formatRelativeTime(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Last 30 days, 12 buckets; two series = top two product names by activity in window. */
function buildVolumeBarPairs(rows: SystemTicketRow[]): {
  pairs: [number, number][];
  labelA: string;
  labelB: string;
} {
  const now = Date.now();
  const windowStart = now - THIRTY_D_MS;
  const inWindow = rows.filter((r) => {
    const t = new Date(r.updated_at).getTime();
    return Number.isFinite(t) && t >= windowStart && t <= now;
  });

  const productCounts = new Map<string, number>();
  for (const r of inWindow) {
    const name = (r.product_name || "Other").trim() || "Other";
    productCounts.set(name, (productCounts.get(name) ?? 0) + 1);
  }
  const sorted = [...productCounts.entries()].sort((a, b) => b[1] - a[1]);
  const labelA = sorted[0]?.[0] ?? "Series A";
  const labelB = sorted[1]?.[0] ?? "Series B";

  const bucketMs = THIRTY_D_MS / 12;
  const buckets: [number, number][] = Array.from({ length: 12 }, () => [0, 0]);

  for (const r of inWindow) {
    const t = new Date(r.updated_at).getTime();
    const idx = Math.min(11, Math.max(0, Math.floor((t - windowStart) / bucketMs)));
    const a = r.product_name === labelA ? 1 : 0;
    const b = r.product_name === labelB ? 1 : 0;
    if (a) buckets[idx]![0] += 1;
    else if (b) buckets[idx]![1] += 1;
    else buckets[idx]![0] += 0.5;
  }

  let max = 1;
  for (const [x, y] of buckets) {
    max = Math.max(max, x, y);
  }
  const pairs: [number, number][] = buckets.map(([x, y]) => [
    Math.round((x / max) * 100),
    Math.round((y / max) * 100),
  ]);
  return { pairs, labelA, labelB };
}

function mergeOrgTableRows(
  orgs: Organisation[],
  metrics: OrganisationTicketMetricsPayload | null,
  externalNameById: Map<string, string>
) {
  if (!metrics) return [];
  const rows = orgs.map((o) => {
    const m = metrics.by_org[String(o.id)];
    const open = m?.open_tickets ?? 0;
    const sla = m?.sla_attainment_pct;
    const slaPct = sla != null ? Math.round(sla * 10) / 10 : null;
    const resolvedName = resolveOrganisationDisplayName(o, externalNameById).trim() || `Organization ${o.id}`;
    return {
      initials:
        resolvedName
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "OR",
      name: resolvedName,
      sub: o.portal_subdomain ? `${o.portal_subdomain} • ${o.timezone}` : o.timezone,
      tickets: open,
      slaPct,
      slaBarWidth: slaPct ?? 0,
      slaTone: slaPct != null && slaPct >= 95 ? ("good" as const) : ("mid" as const),
      p1: null as number | null,
      status:
        slaPct != null && slaPct >= 95 ? ("HEALTHY" as const) : open === 0 ? ("HEALTHY" as const) : ("WARNING" as const),
    };
  });
  rows.sort((a, b) => b.tickets - a.tickets);
  return rows.slice(0, 5);
}

function TrendPill({ text, good }: { text: string; good: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        good ? "bg-[#28A745]/15 text-[#28A745]" : "bg-[#DC3545]/15 text-[#DC3545]"
      )}
    >
      {text}
    </span>
  );
}

function SlaDonut({
  onTrack,
  warning,
  breached,
  displayAvg,
}: {
  onTrack: number;
  warning: number;
  breached: number;
  displayAvg: number | null;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const segs = [
    { pct: onTrack, color: GREEN },
    { pct: warning, color: TERTIARY },
    { pct: breached, color: RED },
  ];
  let offset = 0;
  const circles = segs.map((s, i) => {
    const len = (s.pct / 100) * c;
    const dash = `${len} ${c - len}`;
    const circle = (
      <circle
        key={i}
        r={r}
        cx={64}
        cy={64}
        fill="none"
        stroke={s.color}
        strokeWidth={14}
        strokeDasharray={dash}
        strokeDashoffset={-offset}
        transform="rotate(-90 64 64)"
        className="transition-all"
      />
    );
    offset += len;
    return circle;
  });
  const center =
    displayAvg != null && Number.isFinite(displayAvg) ? `${displayAvg.toFixed(1)}%` : "—";

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 128 128" className="h-full w-full">
          <circle r={r} cx={64} cy={64} fill="none" stroke="hsl(var(--muted))" strokeWidth={14} opacity={0.25} />
          {circles}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-2xl font-bold tracking-tight" style={{ color: PRIMARY }}>
            {center}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">SLA attainment</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />
          On-track <span className="font-semibold text-foreground">{onTrack.toFixed(0)}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: TERTIARY }} />
          At risk <span className="font-semibold text-foreground">{warning.toFixed(0)}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: RED }} />
          Breached <span className="font-semibold text-foreground">{breached.toFixed(0)}%</span>
        </span>
      </div>
    </div>
  );
}

export function SystemOverviewDashboardPage({
  orgId,
  refreshSeconds,
  onRefreshSecondsChange,
  onNavigateToOrganizations,
}: Props) {
  void orgId;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [metrics, setMetrics] = useState<OrganisationTicketMetricsPayload | null>(null);
  const [queueLoad, setQueueLoad] = useState<DashboardTeamQueueLoad | null>(null);
  const [slaRisk, setSlaRisk] = useState<DashboardMySlaRisk | null>(null);

  const [kpiPayload, setKpiPayload] = useState<SystemTicketsPayload | null>(null);
  const [breachPayload, setBreachPayload] = useState<SystemTicketsPayload | null>(null);
  const [slaBreachedN, setSlaBreachedN] = useState(0);
  const [slaAtRiskN, setSlaAtRiskN] = useState(0);
  const [slaOnTrackN, setSlaOnTrackN] = useState(0);
  const [slaNoDeadlineN, setSlaNoDeadlineN] = useState(0);
  const [volumeRows, setVolumeRows] = useState<SystemTicketRow[]>([]);

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [
          o,
          ext,
          m,
          kp,
          br,
          nBreach,
          nRisk,
          nOn,
          nNd,
          vol,
          ql,
          sr,
        ] = await Promise.all([
          listOrganisations().catch(() => [] as Organisation[]),
          getExternalOrganizations().catch(() => [] as ExternalOrganization[]),
          getSystemOrganisationTicketMetrics().catch(() => null),
          listSystemTickets({ limit: 1, offset: 0 }).catch(() => null),
          listSystemTickets({ limit: 8, sla_statuses: ["breached"] }).catch(() => null),
          listSystemTickets({ limit: 1, sla_statuses: ["breached"] }).catch(() => null),
          listSystemTickets({ limit: 1, sla_statuses: ["at_risk"] }).catch(() => null),
          listSystemTickets({ limit: 1, sla_statuses: ["on_track"] }).catch(() => null),
          listSystemTickets({ limit: 1, sla_statuses: ["no_deadline"] }).catch(() => null),
          listSystemTickets({ limit: 500 }).catch(() => null),
          getDashboardTeamQueueLoad().catch(() => null),
          getDashboardMySlaRisk().catch(() => null),
        ]);

        if (stopped) return;
        setOrgs(Array.isArray(o) ? o : []);
        setExternalOrgs(Array.isArray(ext) ? ext : []);
        setMetrics(m);
        setKpiPayload(kp);
        setBreachPayload(br);
        setSlaBreachedN(nBreach?.total ?? 0);
        setSlaAtRiskN(nRisk?.total ?? 0);
        setSlaOnTrackN(nOn?.total ?? 0);
        setSlaNoDeadlineN(nNd?.total ?? 0);
        setVolumeRows(vol?.rows ?? []);
        setQueueLoad(ql);
        setSlaRisk(sr);
      } catch (e) {
        if (stopped) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load dashboard");
        setOrgs([]);
        setExternalOrgs([]);
        setMetrics(null);
        setKpiPayload(null);
        setBreachPayload(null);
        setVolumeRows([]);
        setQueueLoad(null);
        setSlaRisk(null);
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
  }, [refreshSeconds]);

  const { pairs: barPairs, labelA, labelB } = useMemo(
    () => buildVolumeBarPairs(volumeRows),
    [volumeRows]
  );

  const externalNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const x of externalOrgs) {
      const n = x.organization_name?.trim();
      if (n) map.set(String(x.id), n);
    }
    return map;
  }, [externalOrgs]);

  const orgCount = useMemo(() => {
    if (orgs.length > 0) return orgs.length;
    if (metrics?.by_org) return Object.keys(metrics.by_org).length;
    return 0;
  }, [orgs.length, metrics?.by_org]);

  const openTickets = metrics?.global.open_tickets ?? kpiPayload?.kpis.total_active ?? 0;

  const activeBreaches = slaBreachedN;

  const globalSlaAttainment = metrics?.global.sla_attainment_pct ?? null;

  const slaSum = slaBreachedN + slaAtRiskN + slaOnTrackN + slaNoDeadlineN;
  const donut = useMemo(() => {
    if (slaSum <= 0) {
      return {
        onTrack: 100,
        warning: 0,
        breached: 0,
      };
    }
    return {
      onTrack: ((slaOnTrackN + slaNoDeadlineN) / slaSum) * 100,
      warning: (slaAtRiskN / slaSum) * 100,
      breached: (slaBreachedN / slaSum) * 100,
    };
  }, [slaSum, slaOnTrackN, slaNoDeadlineN, slaAtRiskN, slaBreachedN]);

  const tableRows = mergeOrgTableRows(orgs, metrics, externalNameById);

  const breachRows = breachPayload?.rows ?? [];

  const queueHint =
    queueLoad?.available && queueLoad.total_queues != null
      ? `${queueLoad.total_queues} queue(s) in current tenant context`
      : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: SECONDARY }}>
          System Overview
        </h1>
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating…
            </span>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Refresh</span>
            <select
              value={String(refreshSeconds)}
              onChange={(e) => onRefreshSecondsChange?.(Number(e.target.value))}
              className="rounded-lg border border-black/10 bg-white/80 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/10"
            >
              <option value="60">60s</option>
              <option value="10">10s</option>
            </select>
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {loadError}
        </div>
      ) : null}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="border-black/5 bg-white/95 p-5 shadow-md dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Total Organizations</div>
              <div className="mt-2 text-3xl font-bold tabular-nums" style={{ color: PRIMARY }}>
                {formatInt(orgCount)}
              </div>
              <TrendPill text="Live" good />
              <p className="mt-2 text-xs text-muted-foreground">Provisioned tenants in directory.</p>
            </div>
            <div className="rounded-xl bg-[#1E88E5]/10 p-3 dark:bg-[#1E88E5]/20">
              <Network className="h-6 w-6" style={{ color: PRIMARY }} />
            </div>
          </div>
        </GlassCard>
        <GlassCard className="border-black/5 bg-white/95 p-5 shadow-md dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Open Tickets</div>
              <div className="mt-2 text-3xl font-bold tabular-nums" style={{ color: PRIMARY }}>
                {formatInt(openTickets)}
              </div>
              <TrendPill text={kpiPayload ? "Live" : "—"} good={false} />
              <p className="mt-2 text-xs text-muted-foreground">Active statuses across all organisations.</p>
            </div>
            <div className="rounded-xl bg-[#1E88E5]/10 p-3 dark:bg-[#1E88E5]/20">
              <Ticket className="h-6 w-6" style={{ color: PRIMARY }} />
            </div>
          </div>
        </GlassCard>
        <GlassCard className="border-black/5 bg-white/95 p-5 shadow-md dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground">SLA Breached (active)</div>
              <div className="mt-2 text-3xl font-bold tabular-nums" style={{ color: PRIMARY }}>
                {activeBreaches}
              </div>
              <TrendPill text="Live" good={activeBreaches === 0} />
              <p className="mt-2 text-xs text-muted-foreground">Tickets past the next SLA deadline.</p>
            </div>
            <div className="rounded-xl bg-[#DC3545]/10 p-3">
              <AlertTriangle className="h-6 w-6 text-[#DC3545]" />
            </div>
          </div>
        </GlassCard>
        <GlassCard className="border-black/5 bg-white/95 p-5 shadow-md dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Resolution SLA (global)</div>
              <div className="mt-2 text-3xl font-bold tabular-nums" style={{ color: PRIMARY }}>
                {globalSlaAttainment != null ? `${globalSlaAttainment.toFixed(1)}%` : "—"}
              </div>
              <TrendPill text={globalSlaAttainment != null ? "Live" : "—"} good={globalSlaAttainment != null && globalSlaAttainment >= 95} />
              <p className="mt-2 text-xs text-muted-foreground">
                Resolved/closed tickets meeting resolution due date (where SLA was set).
              </p>
            </div>
            <div className="rounded-xl bg-[#CC6C00]/12 p-3">
              <Star className="h-6 w-6 fill-[#CC6C00] text-[#CC6C00]" />
            </div>
          </div>
        </GlassCard>
      </div>

      {queueHint ? (
        <p className="text-xs text-muted-foreground">{queueHint}</p>
      ) : null}
      {slaRisk?.message ? (
        <p className="text-xs text-muted-foreground">Agent SLA widget: {slaRisk.message}</p>
      ) : null}

      {/* Charts + breach feed */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <GlassCard className="border-black/5 bg-white/95 p-5 shadow-md dark:border-white/10 dark:bg-white/5 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold" style={{ color: SECONDARY }}>
              Ticket activity by product
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white/80 px-2 py-1 text-xs dark:border-white/10 dark:bg-white/10"
            >
              Last 30 Days
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </div>
          <div className="flex h-52 items-end justify-between gap-1 border-b border-black/10 pb-1 pt-4 dark:border-white/10">
            {barPairs.map(([a, b], i) => (
              <div key={i} className="flex flex-1 gap-0.5">
                <div
                  className="flex-1 rounded-t bg-[#1E88E5]"
                  style={{ height: `${Math.max(4, a)}%` }}
                  title={labelA}
                />
                <div
                  className="flex-1 rounded-t bg-[#42A5F5]/90"
                  style={{ height: `${Math.max(4, b)}%` }}
                  title={labelB}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-6 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#1E88E5]" />
              <span className="truncate uppercase">{labelA}</span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#42A5F5]/90" />
              <span className="truncate uppercase">{labelB}</span>
            </span>
          </div>
        </GlassCard>

        <GlassCard className="border-black/5 bg-white/95 p-5 shadow-md dark:border-white/10 dark:bg-white/5 lg:col-span-4">
          <div className="mb-2 text-center text-sm font-semibold" style={{ color: SECONDARY }}>
            SLA deadline mix (active tickets)
          </div>
          <SlaDonut
            onTrack={donut.onTrack}
            warning={donut.warning}
            breached={donut.breached}
            displayAvg={globalSlaAttainment ?? null}
          />
        </GlassCard>

        <GlassCard className="border-black/5 bg-white/95 p-5 shadow-md dark:border-white/10 dark:bg-white/5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: SECONDARY }}>
              Breach Alert Feed
            </span>
            <span className="rounded bg-[#DC3545]/15 px-2 py-0.5 text-[10px] font-bold text-[#DC3545]">
              LIVE
            </span>
          </div>
          <div className="scrollbar-slim flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
            {breachRows.length === 0 ? (
              <div className="rounded-xl border border-black/10 bg-white/60 p-3 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/5">
                No breached SLA tickets right now.
              </div>
            ) : (
              breachRows.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold leading-snug">{item.subject}</div>
                      <div className="mt-1 text-[10px] font-bold text-[#DC3545]">SLA BREACHED</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {formatRelativeTime(item.updated_at)}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">{item.organisation_name}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{item.product_name}</span>
                        <span
                          className={cn(
                            "ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold",
                            item.priority === "P1"
                              ? "bg-[#DC3545]/15 text-[#DC3545]"
                              : "bg-[#CC6C00]/15 text-[#CC6C00] dark:text-amber-200"
                          )}
                        >
                          {item.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-[#1E88E5]/35 py-2 text-xs font-semibold text-[#1E88E5] hover:bg-[#1E88E5]/8"
          >
            VIEW HISTORICAL BREACHES
          </button>
        </GlassCard>
      </div>

      {/* Table */}
      <GlassCard className="border-black/5 bg-white/95 p-5 shadow-md dark:border-white/10 dark:bg-white/5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-lg font-semibold" style={{ color: SECONDARY }}>
            Top Customer Organizations
          </div>
          <button
            type="button"
            onClick={onNavigateToOrganizations}
            className="rounded-lg border border-[#1E88E5]/40 px-4 py-2 text-xs font-semibold text-[#1E88E5] hover:bg-[#1E88E5]/8"
          >
            View Full Directory
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:border-white/10">
                <th className="pb-3 pr-4">Organization Name</th>
                <th className="pb-3 pr-4">Active Tickets</th>
                <th className="pb-3 pr-4">SLA Attainment</th>
                <th className="pb-3 pr-4">P1 Incidents</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No organisation data yet.
                  </td>
                </tr>
              ) : (
                tableRows.map((row, i) => (
                  <tr key={i} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: PRIMARY }}
                        >
                          {row.initials}
                        </div>
                        <div>
                          <div className="font-semibold">{row.name}</div>
                          <div className="text-xs text-muted-foreground">{row.sub}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 tabular-nums font-medium">{formatInt(row.tickets)}</td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${row.slaBarWidth}%`,
                              background: row.slaTone === "good" ? GREEN : TERTIARY,
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold tabular-nums">
                          {row.slaPct != null ? `${row.slaPct}%` : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      {row.p1 != null && row.p1 > 0 ? (
                        <span className="inline-flex rounded-md bg-[#DC3545]/12 px-2 py-1 text-xs font-semibold text-[#DC3545]">
                          {row.p1} Critical
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-3 py-1 text-[10px] font-bold tracking-wide",
                          row.status === "HEALTHY"
                            ? "bg-[#28A745]/15 text-[#28A745]"
                            : "bg-[#CC6C00]/15 text-[#CC6C00] dark:text-amber-200"
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
