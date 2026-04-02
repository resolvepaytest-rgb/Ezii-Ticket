import { asInt } from "./admin/adminUtils.js";

export type TicketPriority = "P1" | "P2" | "P3" | "P4";
export type TicketChannel = "widget" | "portal" | "email";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };

export type CreateTicketDto = {
  productId: number;
  categoryId: number | null;
  subcategoryId: number | null;
  subject: string;
  description: string;
  channel: TicketChannel;
  priority: TicketPriority;
  affectedUsers: number | null;
  metadata: Record<string, unknown>;
};

export type AddTicketMessageDto = {
  body: string;
  /** Only agents may set true; customers always stored as false. */
  isInternal: boolean;
};

export type TicketStatusChangeDto = {
  status: "open" | "pending" | "escalated" | "resolved" | "closed" | "cancelled" | "reopened";
  resolutionNote: string | null;
  reason: string | null;
};

export type EscalateTicketDto = {
  targetTeamId: number | null;
  targetQueueId: number | null;
  handoffNote: string | null;
  reason: string | null;
};

export type AssignTicketDto = {
  assigneeUserId: number | null;
  teamId: number | null;
  queueId: number | null;
};

export type ReopenTicketDto = {
  reason: string;
};

export type TicketListFilterDto = {
  status: string | null;
  assigneeUserId: number | null;
  queueId: number | null;
  teamId: number | null;
  productId: number | null;
  priority: TicketPriority | null;
  unassignedOnly: boolean;
  search: string | null;
  limit: number;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePriority(raw: unknown): TicketPriority {
  const p = String(raw ?? "P3").toUpperCase();
  if (p === "P1" || p === "P2" || p === "P3" || p === "P4") return p;
  return "P3";
}

function normalizeChannel(raw: unknown): TicketChannel {
  const c = String(raw ?? "widget").toLowerCase();
  if (c === "portal" || c === "email") return c;
  return "widget";
}

export function parseCreateTicketBody(raw: unknown): Ok<CreateTicketDto> | Err {
  const body = asObject(raw);
  if (!body) return { ok: false, error: "invalid body" };

  const productId = asInt(body.product_id);
  if (!productId) return { ok: false, error: "product_id is required" };

  const subject = asNonEmptyString(body.subject);
  if (!subject) return { ok: false, error: "subject is required" };

  const description = asNonEmptyString(body.description);
  if (!description || description.length < 20) {
    return { ok: false, error: "description must be at least 20 characters" };
  }

  const metadata = asObject(body.metadata_json) ?? {};
  const affectedUsers = asInt(body.affected_users);

  return {
    ok: true,
    data: {
      productId,
      categoryId: asInt(body.category_id),
      subcategoryId: asInt(body.subcategory_id),
      subject,
      description,
      channel: normalizeChannel(body.channel),
      priority: normalizePriority(body.priority),
      affectedUsers: affectedUsers && affectedUsers > 0 ? affectedUsers : null,
      metadata,
    },
  };
}

export function parseAddTicketMessageBody(raw: unknown): Ok<AddTicketMessageDto> | Err {
  const body = asObject(raw);
  const message = asNonEmptyString(body?.body);
  if (!message) return { ok: false, error: "body is required" };
  const rawInternal = body?.is_internal;
  const isInternal =
    rawInternal === true || String(rawInternal ?? "").toLowerCase() === "true" || rawInternal === 1;
  return { ok: true, data: { body: message, isInternal } };
}

export function parseTicketIdParam(rawId: unknown): Ok<number> | Err {
  const ticketId = asInt(rawId);
  if (!ticketId) return { ok: false, error: "invalid ticket id" };
  return { ok: true, data: ticketId };
}

export function parseStatusChangeBody(raw: unknown): Ok<TicketStatusChangeDto> | Err {
  const body = asObject(raw);
  if (!body) return { ok: false, error: "invalid body" };
  const status = asNonEmptyString(body.status)?.toLowerCase();
  if (!status) return { ok: false, error: "status is required" };
  const allowed = ["open", "pending", "escalated", "resolved", "closed", "cancelled", "reopened"];
  if (!allowed.includes(status)) return { ok: false, error: "invalid status" };
  return {
    ok: true,
    data: {
      status: status as TicketStatusChangeDto["status"],
      resolutionNote: asNonEmptyString(body.resolution_note),
      reason: asNonEmptyString(body.reason),
    },
  };
}

export function parseEscalateBody(raw: unknown): Ok<EscalateTicketDto> | Err {
  const body = asObject(raw);
  if (!body) return { ok: false, error: "invalid body" };
  return {
    ok: true,
    data: {
      targetTeamId: asInt(body.target_team_id),
      targetQueueId: asInt(body.target_queue_id),
      handoffNote: asNonEmptyString(body.handoff_note),
      reason: asNonEmptyString(body.reason),
    },
  };
}

export function parseCustomerEscalationBody(raw: unknown): Ok<{ reason: string | null }> | Err {
  if (raw === undefined || raw === null) return { ok: true, data: { reason: null } };
  const body = asObject(raw);
  if (!body) return { ok: false, error: "invalid body" };
  return { ok: true, data: { reason: asNonEmptyString(body.reason) } };
}

export function parseAssignBody(raw: unknown): Ok<AssignTicketDto> | Err {
  const body = asObject(raw);
  if (!body) return { ok: false, error: "invalid body" };
  return {
    ok: true,
    data: {
      assigneeUserId: asInt(body.assignee_user_id),
      teamId: asInt(body.team_id),
      queueId: asInt(body.queue_id),
    },
  };
}

export function parseReopenBody(raw: unknown): Ok<ReopenTicketDto> | Err {
  const body = asObject(raw);
  if (!body) return { ok: false, error: "invalid body" };
  const reason = asNonEmptyString(body.reason);
  if (!reason) return { ok: false, error: "reason is required" };
  return { ok: true, data: { reason } };
}

export function parseTicketListFilterQuery(raw: unknown): Ok<TicketListFilterDto> {
  const query = asObject(raw) ?? {};

  const status = asNonEmptyString(query.status)?.toLowerCase() ?? null;
  const priorityRaw = asNonEmptyString(query.priority)?.toUpperCase() ?? null;
  const priority =
    priorityRaw === "P1" || priorityRaw === "P2" || priorityRaw === "P3" || priorityRaw === "P4"
      ? (priorityRaw as TicketPriority)
      : null;

  const limitRaw = asInt(query.limit);
  const limit = !limitRaw ? 100 : Math.max(1, Math.min(limitRaw, 200));

  const unassignedRaw = String(query.unassigned_only ?? "").toLowerCase();
  const unassignedOnly = unassignedRaw === "1" || unassignedRaw === "true" || unassignedRaw === "yes";

  return {
    ok: true,
    data: {
      status,
      assigneeUserId: asInt(query.assignee_user_id),
      queueId: asInt(query.queue_id),
      teamId: asInt(query.team_id),
      productId: asInt(query.product_id),
      priority,
      unassignedOnly,
      search: asNonEmptyString(query.q),
      limit,
    },
  };
}

