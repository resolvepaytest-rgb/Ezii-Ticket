import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { InstantTooltip } from "@components/common/InstantTooltip";
import {
  addTicketMessage,
  downloadTicketAttachmentBlob,
  escalateTicket,
  getTicket,
  listMyTickets,
  listTickets,
  listTicketFormProducts,
  reopenTicket,
  requestTicketEscalation,
  uploadTicketAttachment,
  updateTicketStatus,
  type TicketDetail,
  type TicketFormProduct,
  type TicketRow,
} from "@api/ticketApi";
import { listCannedResponses, type CannedResponse } from "@api/adminApi";
import { getAuthMePermissions } from "@api/authApi";
import { toast } from "sonner";
import { useAuthStore } from "@store/useAuthStore";
import { cn } from "@/lib/utils";
import type { ScreenAccessMap } from "@/config/permissionKeys";
import {
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  Star,
} from "lucide-react";

type MyTicketsPageProps = {
  title?: string;
  subtitle?: string;
  mode?: "my" | "team_queue";
  focusTicketId?: number | null;
};

const PAGE_SIZE = 8;
const DRAFT_STORAGE_PREFIX = "ezii_ticket_reply_draft_v1";

function hasScreenViewAccess(
  screenAccess: ScreenAccessMap | null | undefined,
  screenKey: keyof ScreenAccessMap
): boolean {
  return Boolean(screenAccess?.[screenKey]?.view || screenAccess?.[screenKey]?.modify);
}

function hasScreenModifyAccess(
  screenAccess: ScreenAccessMap | null | undefined,
  screenKey: keyof ScreenAccessMap
): boolean {
  return Boolean(screenAccess?.[screenKey]?.modify);
}

function normalizeScreenAccess(
  raw: ScreenAccessMap | null | undefined
): ScreenAccessMap | null {
  if (!raw || typeof raw !== "object") return null;
  const normalized: ScreenAccessMap = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[key as keyof ScreenAccessMap] = {
      view: Boolean(value?.view || value?.modify),
      modify: Boolean(value?.modify),
    };
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "escalated") {
    return "bg-red-100 text-red-800 ring-1 ring-red-200/80 dark:bg-red-950/45 dark:text-red-200 dark:ring-red-800/50";
  }
  if (s === "open" || s === "new" || s === "reopened") {
    return "bg-sky-100 text-sky-800 ring-1 ring-sky-200/80 dark:bg-sky-950/45 dark:text-sky-200 dark:ring-sky-800/50";
  }
  if (s === "pending") {
    return "bg-amber-100 text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/45 dark:text-amber-100 dark:ring-amber-800/50";
  }
  if (s === "resolved" || s === "closed") {
    return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80 dark:bg-emerald-950/45 dark:text-emerald-200 dark:ring-emerald-800/50";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600/50";
}

function formatStatusLabel(status: string) {
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    new: "NEW",
    open: "OPEN",
    pending: "PENDING",
    escalated: "ESCALATED",
    resolved: "RESOLVED",
    closed: "CLOSED",
    cancelled: "CANCELLED",
    reopened: "OPEN",
  };
  return map[s] ?? status.replace(/_/g, " ").toUpperCase();
}

function formatMetadataLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetadataValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return "Updated";
  return String(value);
}

function activityMetadataEntries(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return [];
  return Object.entries(metadata)
    .map(([key, raw]) => {
      const value = formatMetadataValue(raw);
      return {
        key,
        label: formatMetadataLabel(key),
        value,
      };
    })
    .filter((entry) => entry.value.trim().length > 0);
}

function initialsFromSubject(subject: string) {
  const parts = subject.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase().slice(0, 2);
  }
  return subject.slice(0, 2).toUpperCase() || "—";
}

/** Same HH:MM:SS shape as SystemTicketsPage (hours can exceed 99). */
function formatSlaRemainingLabel(remainingMs: number) {
  const totalSec = Math.floor(Math.max(0, remainingMs) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** For breached SLA: show duration past deadline (with day prefix when ≥ 24h). */
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

/** Earliest upcoming SLA milestone (aligned with system “next deadline” behavior). */
function pickNextSlaDeadline(row: TicketRow): string | null {
  const a = row.first_response_due_at ?? null;
  const b = row.resolution_due_at ?? null;
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
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
    return {
      label: "--:--:--" as const,
      level: "none" as const,
      isOverdue: false,
    };
  }

  const remainingMs = new Date(deadlineIso).getTime() - now;
  if (remainingMs <= 0) {
    return {
      label: formatSlaOverdueLabel(Math.abs(remainingMs)),
      level: "critical" as const,
      isOverdue: true,
    };
  }

  const label = formatSlaRemainingLabel(remainingMs);
  let level: "critical" | "warning" | "normal" = "normal";
  if (remainingMs < 15 * 60 * 1000) level = "critical";
  else if (remainingMs < 60 * 60 * 1000) level = "warning";

  return { label, level, isOverdue: false };
}

function SlaCountdownCell({ row }: { row: TicketRow }) {
  const st = row.status.toLowerCase();
  const pending = st === "pending";
  const terminal = ["resolved", "closed", "cancelled"].includes(st);
  const deadlineIso = pickNextSlaDeadline(row);
  const { label, level, isOverdue } = useSlaCountdown(deadlineIso, row.status);

  if (pending) {
    return (
      <span className="text-[11px] font-medium text-muted-foreground">Paused</span>
    );
  }
  if (terminal) {
    return (
      <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Met
      </div>
    );
  }
  if (!deadlineIso) {
    return <span className="text-[11px] font-medium text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-1.5">
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
    </div>
  );
}

const STATUS_PROGRESS_STEPS = [
  { key: "new", label: "New" },
  { key: "active", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

function attachmentSourceLabel(
  uploaderUserId: number,
  currentUserId: number,
  assigneeUserId: number | null | undefined
) {
  if (uploaderUserId === currentUserId) return "You";
  if (assigneeUserId != null && uploaderUserId === assigneeUserId) return "Assigned agent";
  return "Support";
}

/** New → Open → Resolved → Closed visual progress (customer detail). */
function CustomerStatusTimeline({ status }: { status: string }) {
  const s = status.toLowerCase();
  let activeIndex = 0;
  if (s === "new") activeIndex = 0;
  else if (["open", "pending", "escalated", "reopened"].includes(s)) activeIndex = 1;
  else if (s === "resolved") activeIndex = 2;
  else if (s === "closed") activeIndex = 3;
  else if (s === "cancelled") activeIndex = -1;

  if (activeIndex < 0) {
    return (
      <div className="rounded-xl border border-black/10 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="text-[11px] font-semibold text-muted-foreground">This ticket was cancelled.</div>
      </div>
    );
  }

  const pct = (activeIndex / 3) * 100;

  return (
    <div className="rounded-xl border border-black/10 bg-slate-50/80 px-3 py-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="mb-2 text-[11px] font-semibold text-[#1A202C] dark:text-foreground">Status progress</div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-600 to-emerald-600 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2.5 flex justify-between gap-1">
        {STATUS_PROGRESS_STEPS.map((step, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex;
          return (
            <div key={step.key} className="min-w-0 flex-1 text-center">
              <span
                className={cn(
                  "text-[9px] font-bold uppercase leading-tight tracking-wide",
                  done ? "text-emerald-700 dark:text-emerald-400" : current ? "text-sky-700 dark:text-sky-400" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type FilterState = {
  productId: number | "all";
  status: "all" | "open" | "pending" | "escalated" | "resolved" | "closed";
  priority: "all" | "P1" | "P2" | "P3" | "P4";
};

const DEFAULT_SUBTITLE = "Manage and monitor support requests across your entire workforce.";

export function MyTicketsPage({
  title = "My Tickets",
  subtitle = DEFAULT_SUBTITLE,
  mode = "my",
  focusTicketId = null,
}: MyTicketsPageProps) {
  const authUser = useAuthStore((s) => s.user);
  const currentUserId = Number(authUser?.user_id ?? 0);
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [productMap, setProductMap] = useState<Map<number, string>>(new Map());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [internalReply, setInternalReply] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusActionBusy, setStatusActionBusy] = useState(false);
  const [requestEscalationBusy, setRequestEscalationBusy] = useState(false);
  const [conversationExpanded, setConversationExpanded] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    productId: "all",
    status: "all",
    priority: "all",
  });
  const [page, setPage] = useState(0);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [cannedSearch, setCannedSearch] = useState("");
  const [screenAccess, setScreenAccess] = useState<ScreenAccessMap | null>(null);
  const detailSectionRef = useRef<HTMLDivElement | null>(null);
  const canCustomerModifyTickets =
    hasScreenModifyAccess(screenAccess, "my_tickets") || hasScreenModifyAccess(screenAccess, "raise_a_ticket");
  const canAgentModifyTickets =
    hasScreenModifyAccess(screenAccess, "tickets") ||
    hasScreenModifyAccess(screenAccess, "agent_my_tickets") ||
    hasScreenModifyAccess(screenAccess, "agent_team_queue") ||
    hasScreenModifyAccess(screenAccess, "agent_history");
  const canSupportViewTickets =
    hasScreenViewAccess(screenAccess, "tickets") ||
    hasScreenViewAccess(screenAccess, "agent_my_tickets") ||
    hasScreenViewAccess(screenAccess, "agent_team_queue") ||
    hasScreenViewAccess(screenAccess, "agent_history");
  const canReply = canCustomerModifyTickets || canAgentModifyTickets;
  const canStatusChange = canAgentModifyTickets;
  const canEscalate = canAgentModifyTickets;
  const canReopen = canCustomerModifyTickets || canAgentModifyTickets;
  const canRequestEscalation = canCustomerModifyTickets;
  const canWriteInternal = canSupportViewTickets;
  const isSupportExperience = canWriteInternal;
  const modifyAccessMessage = "You don't have modify access";

  const loadRows = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      try {
        const data =
          mode === "team_queue"
            ? await listTickets({ status: "open", unassigned_only: true, limit: 100 })
            : await listMyTickets();
        setRows(data);
        setSelectedId((prev) => {
          if (prev && data.some((r) => r.id === prev)) return prev;
          return null;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load tickets");
        setRows([]);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [mode]
  );

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    let cancelled = false;
    void listTicketFormProducts()
      .then((list: TicketFormProduct[]) => {
        if (cancelled) return;
        setProductMap(new Map(list.map((p) => [p.id, p.name])));
      })
      .catch(() => {
        if (!cancelled) setProductMap(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAuthMePermissions()
      .then((data) => {
        if (cancelled) return;
        setScreenAccess(normalizeScreenAccess(data.permissions_json?.screen_access as ScreenAccessMap | undefined));
      })
      .catch(() => {
        if (!cancelled) setScreenAccess(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const orgId = Number(authUser?.org_id ?? 0);
    if (!Number.isFinite(orgId) || orgId <= 0 || !canReply) return;
    void listCannedResponses(orgId)
      .then((rows) => setCannedResponses(rows.filter((r) => r.is_active)))
      .catch(() => setCannedResponses([]));
  }, [authUser?.org_id, canReply]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    void getTicket(selectedId)
      .then((d) => setDetail(d))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load ticket detail");
        setDetail(null);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !canReply) return;
    const key = `${DRAFT_STORAGE_PREFIX}:${selectedId}:${currentUserId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { body?: string; internal?: boolean };
      if (typeof parsed.body === "string") setMessage(parsed.body);
      if (typeof parsed.internal === "boolean") setInternalReply(parsed.internal);
    } catch {
      // Ignore stale draft payloads.
    }
  }, [selectedId, canReply, currentUserId]);

  useEffect(() => {
    if (!selectedId || !canReply) return;
    const key = `${DRAFT_STORAGE_PREFIX}:${selectedId}:${currentUserId}`;
    const timer = window.setInterval(() => {
      const body = message.trim();
      if (!body) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(
        key,
        JSON.stringify({
          body: message,
          internal: internalReply,
          saved_at: new Date().toISOString(),
        })
      );
    }, 30000);
    return () => window.clearInterval(timer);
  }, [selectedId, canReply, currentUserId, message, internalReply]);

  useEffect(() => {
    if (!focusTicketId) return;
    setSelectedId(focusTicketId);
  }, [focusTicketId]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setInterval(() => {
      void getTicket(selectedId).then(setDetail).catch(() => null);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    // Wait a tick so the detail card is in DOM before scrolling.
    const id = window.setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
   
    }, 0);
    return () => window.clearTimeout(id);
  }, [selectedId]);

  useEffect(() => {
    if (menuOpenId == null) return;
    const close = () => setMenuOpenId(null);
    const t = window.setTimeout(() => {
      window.addEventListener("click", close);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", close);
    };
  }, [menuOpenId]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filters.productId !== "all" && r.product_id !== filters.productId) return false;
      if (filters.status !== "all" && r.status.toLowerCase() !== filters.status.toLowerCase()) return false;
      if (filters.priority !== "all" && r.priority !== filters.priority) return false;
      return true;
    });
  }, [rows, filters]);

  useEffect(() => {
    setPage(0);
  }, [filters, rows.length]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedRows = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const kpiEscalations = useMemo(
    () => rows.filter((r) => r.status.toLowerCase() === "escalated").length,
    [rows]
  );

  const kpiAvgResolutionHours = useMemo(() => {
    const resolved = rows.filter((r) => ["resolved", "closed"].includes(r.status.toLowerCase()));
    if (resolved.length === 0) return null;
    let sum = 0;
    for (const r of resolved) {
      sum += (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 3600000;
    }
    return sum / resolved.length;
  }, [rows]);

  const yesterday = useMemo(() => Date.now() - 86400000, []);
  const escalationsSinceYesterday = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status.toLowerCase() === "escalated" && new Date(r.updated_at).getTime() >= yesterday
      ).length,
    [rows, yesterday]
  );

  const cannedVisible = useMemo(() => {
    if (!detail) return [];
    const search = cannedSearch.trim().toLowerCase();
    return cannedResponses.filter((r) => {
      if (r.product_id != null && Number(r.product_id) !== Number(detail.product_id)) return false;
      if (!search) return true;
      return r.title.toLowerCase().includes(search) || r.body.toLowerCase().includes(search);
    });
  }, [cannedResponses, cannedSearch, detail]);

  const reporterPreviousCount = useMemo(() => {
    if (!detail) return 0;
    return rows.filter((r) => Number(r.reporter_user_id) === Number(detail.reporter_user_id)).length;
  }, [rows, detail]);

  const sendMessage = async () => {
    if (!selectedId) return;
    if (!canReply) {
      toast.error("You do not have permission to reply on this ticket.");
      return;
    }
    const body = message.trim();
    if (!body) return;
    setSending(true);
    try {
      await addTicketMessage(selectedId, body, {
        is_internal: canWriteInternal && internalReply,
      });
      if (canReply) {
        const key = `${DRAFT_STORAGE_PREFIX}:${selectedId}:${currentUserId}`;
        window.localStorage.removeItem(key);
      }
      setMessage("");
      setInternalReply(false);
      const d = await getTicket(selectedId);
      setDetail(d);
      await loadRows(false);
      toast.success("Message sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const sendMessageAndSetStatus = async (nextStatus: "pending" | "resolved") => {
    if (!selectedId) return;
    if (!canReply || !canStatusChange) {
      toast.error("You do not have permission for this action.");
      return;
    }
    const body = message.trim();
    if (!body) {
      toast.error("Write a reply first");
      return;
    }
    setSending(true);
    setStatusActionBusy(true);
    try {
      await addTicketMessage(selectedId, body, {
        is_internal: canWriteInternal && internalReply,
      });
      await updateTicketStatus(selectedId, {
        status: nextStatus,
        reason: "reply_and_set_status_from_ui",
        ...(nextStatus === "resolved"
          ? {
              resolution_note:
                "Marked resolved immediately after a reply from the ticket detail workflow.",
            }
          : {}),
      });
      const key = `${DRAFT_STORAGE_PREFIX}:${selectedId}:${currentUserId}`;
      window.localStorage.removeItem(key);
      setMessage("");
      setInternalReply(false);
      await refreshAll();
      toast.success(`Reply sent and ticket moved to ${nextStatus}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reply and update status");
    } finally {
      setSending(false);
      setStatusActionBusy(false);
    }
  };

  const refreshAll = async () => {
    if (!selectedId) {
      await loadRows(false);
      return;
    }
    const [d] = await Promise.all([getTicket(selectedId), loadRows(false)]);
    setDetail(d);
  };

  const downloadAttachment = async (attachmentId: number, fileName: string) => {
    if (!selectedId) return;
    try {
      const blob = await downloadTicketAttachmentBlob(selectedId, attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  const onPickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    setUploadBusy(true);
    try {
      await uploadTicketAttachment(selectedId, file);
      await refreshAll();
      toast.success("File uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  };

  const setPending = async () => {
    if (!selectedId) return;
    if (!canStatusChange) {
      toast.error("You do not have permission to change ticket status.");
      return;
    }
    setStatusActionBusy(true);
    try {
      await updateTicketStatus(selectedId, { status: "pending", reason: "set_from_ui" });
      await refreshAll();
      toast.success("Status changed to pending");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set pending");
    } finally {
      setStatusActionBusy(false);
    }
  };

  const setResolved = async () => {
    if (!selectedId) return;
    if (!canStatusChange) {
      toast.error("You do not have permission to change ticket status.");
      return;
    }
    setStatusActionBusy(true);
    try {
      await updateTicketStatus(selectedId, {
        status: "resolved",
        reason: "resolved_from_ui",
        resolution_note:
          "Resolved after validating root cause, applying corrective updates, and confirming behavior through end-to-end retesting.",
      });
      await refreshAll();
      toast.success("Status changed to resolved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resolve ticket");
    } finally {
      setStatusActionBusy(false);
    }
  };

  const escalate = async () => {
    if (!selectedId || !detail) return;
    if (!canEscalate) {
      toast.error("You do not have permission to escalate this ticket.");
      return;
    }
    setStatusActionBusy(true);
    try {
      await escalateTicket(selectedId, {
        target_team_id: detail.team_id ?? undefined,
        target_queue_id: detail.queue_id ?? undefined,
        handoff_note: "Escalated from UI after additional review.",
        reason: "ui_escalation",
      });
      await refreshAll();
      toast.success("Ticket escalated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to escalate");
    } finally {
      setStatusActionBusy(false);
    }
  };

  const reopen = async () => {
    if (!selectedId) return;
    if (!canReopen) {
      toast.error("You do not have permission to reopen this ticket.");
      return;
    }
    setStatusActionBusy(true);
    try {
      await reopenTicket(selectedId, "Issue persists after attempted resolution");
      await refreshAll();
      toast.success("Ticket reopened");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reopen");
    } finally {
      setStatusActionBusy(false);
    }
  };

  const requestCustomerEscalationAction = async () => {
    if (!selectedId) return;
    if (!canRequestEscalation) {
      toast.error("You do not have permission to request escalation.");
      return;
    }
    setRequestEscalationBusy(true);
    try {
      await requestTicketEscalation(selectedId, {
        reason: "Customer requested escalation after 24 hours with no agent reply.",
      });
      await refreshAll();
      toast.success("Escalation requested — support has been notified.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not request escalation");
    } finally {
      setRequestEscalationBusy(false);
    }
  };

  const exportCsv = () => {
    const headers = ["ticket_code", "reporter", "subject", "status", "priority", "product", "updated_at"];
    const lines = [
      headers.join(","),
      ...filteredRows.map((r) =>
        [
          r.ticket_code,
          JSON.stringify(r.reporter_name?.trim() || `User #${r.reporter_user_id}`),
          JSON.stringify(r.subject),
          r.status,
          r.priority,
          productMap.get(r.product_id) ?? r.product_id,
          r.updated_at,
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export started");
  };

  const resetFilters = () => {
    setFilters({ productId: "all", status: "all", priority: "all" });
  };

  const reporterLabel = (row: TicketRow) => {
    if (row.reporter_user_id === currentUserId) return "You";
    const name = row.reporter_name?.trim();
    if (name) return name;
    return `User #${row.reporter_user_id}`;
  };

  const from = filteredRows.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filteredRows.length, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="max-w-7xl min-h-full pb-8 text-[13px]">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#1A202C] dark:text-foreground">{title}</h1>
        <p className="mt-0.5 max-w-2xl text-xs text-slate-600 dark:text-muted-foreground">{subtitle}</p>
      </header>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
            Active escalations
          </div>
          <div className="mt-1.5 text-3xl font-semibold tabular-nums text-red-600 dark:text-red-400">{kpiEscalations}</div>
          {escalationsSinceYesterday > 0 ? (
            <div className="mt-1 text-[11px] font-medium text-red-600/90 dark:text-red-400/90">
              +{escalationsSinceYesterday} since yesterday
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-slate-500 dark:text-muted-foreground">No recent escalations</div>
          )}
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
            Avg. response time
          </div>
          <div className="mt-1.5 text-3xl font-semibold tabular-nums text-[#1A202C] dark:text-foreground">
            {kpiAvgResolutionHours != null ? `${kpiAvgResolutionHours.toFixed(1)}h` : "—"}
          </div>
          <div className="mt-1 text-[11px] text-sky-700/90 dark:text-sky-300/90">Target: 2.0h</div>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
            CSAT score
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5 text-3xl font-semibold tabular-nums text-[#1A202C] dark:text-foreground">
            4.8
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden />
          </div>
        </div>
       
      </div>

      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-black/5 bg-slate-100/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
            Filter by
          </span>
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.productId === "all" ? "all" : String(filters.productId)}
              onChange={(e) => {
                const v = e.target.value;
                setFilters((f) => ({
                  ...f,
                  productId: v === "all" ? "all" : Number(v),
                }));
              }}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-[#1A202C] shadow-sm dark:border-white/15 dark:bg-zinc-900 dark:text-foreground"
            >
              <option value="all">Product: All</option>
              {[...productMap.entries()].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value as FilterState["status"] }))
              }
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-[#1A202C] shadow-sm dark:border-white/15 dark:bg-zinc-900 dark:text-foreground"
            >
              <option value="all">Status: All</option>
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="escalated">Escalated</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={filters.priority}
              onChange={(e) =>
                setFilters((f) => ({ ...f, priority: e.target.value as FilterState["priority"] }))
              }
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-[#1A202C] shadow-sm dark:border-white/15 dark:bg-zinc-900 dark:text-foreground"
            >
              <option value="all">Priority: All</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => exportCsv()}
            className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/15 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => resetFilters()}
            className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/15 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => void loadRows()}
            className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/15 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </div>

      <GlassCard className="overflow-hidden border-black/5 bg-white/90 p-0 dark:border-white/10 dark:bg-white/[0.06]">
        {loading ? (
          <div className="p-8">
            <Loader label="Loading tickets..." />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-6 text-xs text-muted-foreground">No tickets match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 bg-slate-50/90 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-muted-foreground">
                  <th className="whitespace-nowrap px-3 py-2">Ticket ID</th>
                  <th className="min-w-[220px] px-3 py-2">Employee / Subject</th>
                  <th className="whitespace-nowrap px-3 py-2">Product</th>
                  <th className="whitespace-nowrap px-3 py-2">Status</th>
                  <th className="whitespace-nowrap px-3 py-2">SLA countdown</th>
                  <th className="w-12 px-2 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-black/5 transition-colors last:border-0 dark:border-white/5",
                      row.id === selectedId
                        ? "bg-sky-50/80 dark:bg-sky-950/25"
                        : "hover:bg-slate-50/80 dark:hover:bg-white/[0.04]"
                    )}
                  >
                    <td className="px-3 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className="text-[11px] font-semibold text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
                      >
                        #{row.ticket_code}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex items-start gap-2">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                          aria-hidden
                        >
                          {initialsFromSubject(row.subject)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-[#1A202C] dark:text-foreground">{reporterLabel(row)}</div>
                          <div className="line-clamp-2 text-[10px] text-slate-500 dark:text-muted-foreground">{row.subject}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {productMap.get(row.product_id) ?? `Product ${row.product_id}`}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                          statusBadgeClass(row.status)
                        )}
                      >
                        {formatStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <SlaCountdownCell row={row} />
                    </td>
                    <td className="relative px-2 py-2 text-right align-middle">
                      <button
                        type="button"
                        className="inline-flex rounded-md p-1.5 text-slate-500 hover:bg-black/5 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
                        aria-label="Row actions"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId((id) => (id === row.id ? null : row.id));
                        }}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                      {menuOpenId === row.id ? (
                        <div
                          className="absolute right-8 top-9 z-20 w-40 rounded-lg border border-black/10 bg-white py-0.5 text-left text-[11px] shadow-lg dark:border-white/15 dark:bg-zinc-900"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="block w-full px-2.5 py-1.5 text-left text-[11px] hover:bg-slate-50 dark:hover:bg-white/10"
                            onClick={() => {
                              setSelectedId(row.id);
                              setMenuOpenId(null);
                            }}
                          >
                            View details
                          </button>
                          <button
                            type="button"
                            className="block w-full px-2.5 py-1.5 text-left text-[11px] hover:bg-slate-50 dark:hover:bg-white/10"
                            onClick={() => {
                              void navigator.clipboard.writeText(row.ticket_code);
                              toast.success("Copied ticket code");
                              setMenuOpenId(null);
                            }}
                          >
                            Copy ticket code
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredRows.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-black/10 bg-slate-50/50 px-3 py-2 text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {from}-{to} of {filteredRows.length} tickets
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 bg-white text-slate-700 shadow-sm disabled:opacity-40 dark:border-white/15 dark:bg-zinc-900 dark:text-slate-200"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 bg-white text-slate-700 shadow-sm disabled:opacity-40 dark:border-white/15 dark:bg-zinc-900 dark:text-slate-200"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </GlassCard>

      {selectedId ? (
        <div ref={detailSectionRef}>
          <GlassCard className="mt-5 border-black/5 bg-white/90 p-4 dark:border-white/10 dark:bg-white/[0.06]">
            {detailLoading ? (
              <Loader label="Loading ticket detail..." />
            ) : !detail ? (
              <div className="text-xs text-muted-foreground">Ticket detail unavailable.</div>
            ) : (
              <div className="space-y-3">
              <div className="border-b border-black/10 pb-2 dark:border-white/10">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">{detail.ticket_code}</div>
                    <h3 className="mt-0.5 text-base font-semibold text-[#1A202C] dark:text-foreground">{detail.subject}</h3>
                  </div>
                  {canStatusChange || canEscalate ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <InstantTooltip disabled={!canStatusChange} message={modifyAccessMessage}>
                        <button
                          type="button"
                          disabled={!canStatusChange || statusActionBusy || detail.status.toLowerCase() === "pending"}
                          onClick={() => void setPending()}
                          className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium shadow-sm dark:border-white/15 dark:bg-zinc-900 disabled:opacity-60"
                        >
                          Set Pending
                        </button>
                      </InstantTooltip>
                      <InstantTooltip disabled={!canStatusChange} message={modifyAccessMessage}>
                        <button
                          type="button"
                          disabled={!canStatusChange || statusActionBusy || detail.status.toLowerCase() === "resolved"}
                          onClick={() => void setResolved()}
                          className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium shadow-sm dark:border-white/15 dark:bg-zinc-900 disabled:opacity-60"
                        >
                          Set Resolved
                        </button>
                      </InstantTooltip>
                      <InstantTooltip disabled={!canEscalate} message={modifyAccessMessage}>
                        <button
                          type="button"
                          disabled={!canEscalate || statusActionBusy}
                          onClick={() => void escalate()}
                          className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium shadow-sm dark:border-white/15 dark:bg-zinc-900 disabled:opacity-60"
                        >
                          Escalate
                        </button>
                      </InstantTooltip>
                    </div>
                  ) : null}
                </div>
                {!canWriteInternal && detail.description ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {detail.description}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      statusBadgeClass(detail.status)
                    )}
                  >
                    {formatStatusLabel(detail.status)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">Priority: {detail.priority}</span>
                  {canWriteInternal ? (
                    <span className="text-[11px] text-muted-foreground">Queue: {detail.queue_id ?? "-"}</span>
                  ) : null}
                </div>
              </div>

              {canWriteInternal ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-black/10 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-1.5 text-xs font-semibold text-[#1A202C] dark:text-foreground">
                      Customer context
                    </div>
                    <div className="grid gap-2 text-[11px] text-slate-700 dark:text-slate-200 sm:grid-cols-2">
                      <div>
                        <span className="font-semibold">Reporter:</span> {detail.reporter_name ?? detail.reporter_user_id}
                      </div>
                      <div>
                        <span className="font-semibold">Organisation:</span>{" "}
                        {detail.organisation_name?.trim() || `Org #${detail.organisation_id}`}
                      </div>
                      <div>
                        <span className="font-semibold">Product:</span> {productMap.get(detail.product_id) ?? detail.product_id}
                      </div>
                      <div>
                        <span className="font-semibold">Subscription:</span> Active
                      </div>
                      <div className="sm:col-span-2">
                        <span className="font-semibold">Previous tickets:</span> {Math.max(0, reporterPreviousCount - 1)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-black/10 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <button
                      type="button"
                      onClick={() => setConversationExpanded((v) => !v)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <div className="text-xs font-semibold text-[#1A202C] dark:text-foreground">Conversation</div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        {conversationExpanded ? "Collapse" : "Expand"}
                        {conversationExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                    {conversationExpanded ? (
                      <div className="mt-2 max-h-[100px] space-y-3 overflow-y-auto pr-1">
                        {detail.messages.map((m) => {
                          const isMine = Number(m.author_user_id ?? 0) === currentUserId;
                          const senderLabel =
                            m.author_name?.trim() ||
                            (isMine
                              ? "You"
                              : m.author_type === "agent"
                                ? "Support Agent"
                                : m.author_type === "customer"
                                  ? "Customer"
                                  : "System");
                          return (
                            <div key={m.id} className={cn("flex w-full", isMine ? "justify-end" : "justify-start")}>
                              <div
                                className={cn(
                                  "max-w-[min(100%,420px)] rounded-2xl px-3 py-2 text-xs shadow-sm",
                                  isMine
                                    ? "bg-sky-600 text-white"
                                    : m.is_internal
                                      ? "border border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                                      : "border border-black/10 bg-white text-[#1A202C] dark:border-white/10 dark:bg-zinc-900/90 dark:text-foreground"
                                )}
                              >
                                <div className={cn("mb-1 text-[10px] font-semibold", isMine ? "text-sky-100" : "text-muted-foreground")}>
                                  {senderLabel} · {new Date(m.created_at).toLocaleString()}
                                  {m.is_internal ? (
                                    <span className="ml-1 rounded bg-amber-600/20 px-1 py-0.5 text-[9px] font-semibold text-amber-900 dark:text-amber-100">
                                      Internal
                                    </span>
                                  ) : null}
                                </div>
                                <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!canWriteInternal ? <CustomerStatusTimeline status={detail.status} /> : null}

              <div className="flex flex-wrap items-center gap-1.5">
                {!canWriteInternal && detail.can_request_escalation && canRequestEscalation ? (
                  <InstantTooltip disabled={!canRequestEscalation} message={modifyAccessMessage}>
                    <button
                      type="button"
                      disabled={!canRequestEscalation || requestEscalationBusy || statusActionBusy}
                      onClick={() => void requestCustomerEscalationAction()}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
                    >
                      <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden />
                      {requestEscalationBusy ? "Requesting…" : "Request escalation"}
                    </button>
                  </InstantTooltip>
                ) : null}
                {!canWriteInternal &&
                !detail.can_request_escalation &&
                ["new", "open", "pending", "reopened"].includes(detail.status.toLowerCase()) ? (
                  <span className="text-[10px] text-muted-foreground">
                    Escalation can be requested after 24 hours with no agent reply.
                  </span>
                ) : null}
                {!canWriteInternal && detail.status.toLowerCase() === "resolved" ? (
                  <InstantTooltip disabled={!canReopen} message={modifyAccessMessage}>
                    <button
                      type="button"
                      disabled={!canReopen || statusActionBusy}
                      onClick={() => void reopen()}
                      className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium shadow-sm dark:border-white/15 dark:bg-zinc-900 disabled:opacity-60"
                    >
                      Reopen
                    </button>
                  </InstantTooltip>
                ) : null}
              </div>

              {!canWriteInternal ? (
                <div className="rounded-xl border border-black/10 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => setConversationExpanded((v) => !v)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div className="text-xs font-semibold text-[#1A202C] dark:text-foreground">Conversation</div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {conversationExpanded ? "Collapse" : "Expand"}
                      {conversationExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                  {conversationExpanded ? (
                    <div className="mt-2 max-h-[100px] space-y-3 overflow-y-auto pr-1">
                      {detail.messages.map((m) => {
                        const isMine = Number(m.author_user_id ?? 0) === currentUserId;
                        const senderLabel =
                          m.author_name?.trim() ||
                          (isMine
                            ? "You"
                            : m.author_type === "agent"
                              ? "Support Agent"
                              : m.author_type === "customer"
                                ? "Customer"
                                : "System");
                        return (
                          <div key={m.id} className={cn("flex w-full", isMine ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[min(100%,420px)] rounded-2xl px-3 py-2 text-xs shadow-sm",
                                isMine
                                  ? "bg-sky-600 text-white"
                                  : m.is_internal
                                    ? "border border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                                    : "border border-black/10 bg-white text-[#1A202C] dark:border-white/10 dark:bg-zinc-900/90 dark:text-foreground"
                              )}
                            >
                              <div className={cn("mb-1 text-[10px] font-semibold", isMine ? "text-sky-100" : "text-muted-foreground")}>
                                {senderLabel} · {new Date(m.created_at).toLocaleString()}
                                {m.is_internal ? (
                                  <span className="ml-1 rounded bg-amber-600/20 px-1 py-0.5 text-[9px] font-semibold text-amber-900 dark:text-amber-100">
                                    Internal
                                  </span>
                                ) : null}
                              </div>
                              <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-black/10 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-[#1A202C] dark:text-foreground">Attachments</div>
                    <label
                      className={cn(
                        "text-[11px] font-semibold text-sky-600 dark:text-sky-400",
                        uploadBusy || ["closed", "cancelled"].includes(detail.status.toLowerCase())
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer"
                      )}
                    >
                      <input
                        type="file"
                        className="sr-only"
                        disabled={uploadBusy || ["closed", "cancelled"].includes(detail.status.toLowerCase())}
                        onChange={(e) => void onPickUpload(e)}
                      />
                      {uploadBusy ? "Uploading…" : "+ Upload file"}
                    </label>
                  </div>
                  <p className="mb-2 text-[10px] text-muted-foreground">
                    {canWriteInternal
                      ? "Download any file attached to this ticket."
                      : "Your uploads and files shared by support are listed below."}
                  </p>
                  {(detail.attachments ?? []).length === 0 ? (
                    <div className="text-[11px] text-muted-foreground">No attachments yet.</div>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {(detail.attachments ?? []).map((a) => (
                        <li key={a.id} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                          <div className="min-w-0">
                            <span className="block truncate font-medium">{a.file_name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              From{" "}
                              {attachmentSourceLabel(a.uploader_user_id, currentUserId, detail.assignee_user_id ?? null)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 text-[11px] font-semibold text-sky-600 underline dark:text-sky-400"
                            onClick={() => void downloadAttachment(a.id, a.file_name)}
                          >
                            Download
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-black/10 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-1.5 text-xs font-semibold text-[#1A202C] dark:text-foreground">Activity</div>
                  <div className="max-h-[200px] space-y-2 overflow-y-auto">
                    {detail.events.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">No activity yet.</div>
                    ) : (
                      detail.events
                        .slice()
                        .reverse()
                        .slice(0, canWriteInternal ? 20 : 15)
                        .map((ev) => (
                          <div
                            key={ev.id}
                            className={cn(
                              "rounded-lg border border-black/10 p-1.5 text-[11px] dark:border-white/10",
                              canWriteInternal ? "bg-white dark:bg-zinc-900/40" : "bg-white/80 dark:bg-zinc-900/30"
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold capitalize">
                                {ev.event_type.replace(/_/g, " ")}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(ev.created_at).toLocaleString()}
                              </span>
                            </div>
                            {activityMetadataEntries(ev.metadata_json).length > 0 ? (
                              <div className="mt-1.5 rounded-md border border-black/10 bg-white/70 p-1.5 dark:border-white/10 dark:bg-zinc-900/40">
                                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                                  {activityMetadataEntries(ev.metadata_json).map((entry) => (
                                    <div key={entry.key} className="min-w-0 rounded bg-black/[0.03] px-1.5 py-1 dark:bg-white/[0.04]">
                                      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        {entry.label}
                                      </div>
                                      <div className="break-words text-[10px] font-medium text-slate-800 dark:text-slate-200">
                                        {entry.value}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#1A202C] dark:text-foreground">
                  {canWriteInternal ? "Add reply" : "Add an update"}
                </div>
                {canWriteInternal ? (
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={internalReply}
                        onChange={(e) => setInternalReply(e.target.checked)}
                        className="rounded border-black/20 dark:border-white/30"
                      />
                      Internal note (not visible to customer)
                    </label>
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                      <div className="space-y-1">
                        <input
                          value={cannedSearch}
                          onChange={(e) => setCannedSearch(e.target.value)}
                          className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] dark:border-white/15 dark:bg-zinc-900"
                          placeholder="Search canned responses..."
                        />
                        <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-black/10 bg-white p-1.5 dark:border-white/10 dark:bg-zinc-900/60">
                          {cannedVisible.length === 0 ? (
                            <div className="text-[10px] text-muted-foreground">No canned responses for this product.</div>
                          ) : (
                            cannedVisible.slice(0, 8).map((tpl) => (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={() => setMessage((prev) => `${prev}${prev.trim() ? "\n\n" : ""}${tpl.body}`)}
                                className="block w-full rounded px-1.5 py-1 text-left text-[11px] hover:bg-slate-100 dark:hover:bg-white/10"
                              >
                                <div className="font-semibold">{tpl.title}</div>
                                <div className="line-clamp-1 text-[10px] text-muted-foreground">{tpl.body}</div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={7}
                        className="w-full rounded-xl border border-black/10 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-zinc-900"
                        placeholder="Add a follow-up message..."
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    Post a follow-up or attach a file above while the ticket is open. Closed tickets cannot receive new
                    files or messages until you reopen a resolved ticket.
                  </p>
                )}
                {!canWriteInternal ? (
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-black/10 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-zinc-900"
                    placeholder="Write a message to support..."
                  />
                ) : null}
                <div className="flex justify-end">
                  <div className="flex flex-wrap items-center gap-2">
                    {canStatusChange ? (
                      <>
                        <InstantTooltip disabled={!canStatusChange || !canReply} message={modifyAccessMessage}>
                          <button
                            type="button"
                            onClick={() => void sendMessageAndSetStatus("pending")}
                            disabled={!canReply || !canStatusChange || sending || statusActionBusy}
                            className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#1A202C] shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-white/15 dark:bg-zinc-900 dark:text-foreground dark:hover:bg-zinc-800"
                          >
                            Reply + Pending
                          </button>
                        </InstantTooltip>
                        <InstantTooltip disabled={!canStatusChange || !canReply} message={modifyAccessMessage}>
                          <button
                            type="button"
                            onClick={() => void sendMessageAndSetStatus("resolved")}
                            disabled={!canReply || !canStatusChange || sending || statusActionBusy}
                            className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100 dark:hover:bg-emerald-900/45"
                          >
                            Reply + Resolved
                          </button>
                        </InstantTooltip>
                      </>
                    ) : null}
                    <InstantTooltip disabled={!canReply} message={modifyAccessMessage}>
                      <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={
                          !canReply ||
                          sending ||
                          (!isSupportExperience && detail.reporter_user_id !== currentUserId) ||
                          (!isSupportExperience && ["closed", "cancelled"].includes(detail.status.toLowerCase()))
                        }
                        className="rounded-xl bg-[#0F5EA8] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0d5290] disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
                      >
                        {sending ? "Sending..." : "Send message"}
                      </button>
                    </InstantTooltip>
                  </div>
                </div>
              </div>
              </div>
            )}
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
