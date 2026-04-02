import { getApiBaseUrl, http, httpForm } from "./httpClient";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
  error?: string;
};

export type TicketRow = {
  id: number;
  ticket_code: string;
  product_id: number;
  category_id: number | null;
  subcategory_id: number | null;
  subject: string;
  status: string;
  priority: "P1" | "P2" | "P3" | "P4";
  reporter_user_id: number;
  /** Display name: `users.user_name` (if set), else `users.name`, when the reporter row exists for this org. */
  reporter_name?: string | null;
  assignee_user_id: number | null;
  queue_id?: number | null;
  team_id?: number | null;
  first_response_due_at?: string | null;
  resolution_due_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketMessage = {
  id: number;
  ticket_id: number;
  author_user_id: number | null;
  author_type: "customer" | "agent" | "system";
  body: string;
  /** Internal notes are hidden from customers in API responses. */
  is_internal: boolean;
  attachments_json: unknown[];
  created_at: string;
};

export type TicketEvent = {
  id: number;
  event_type: string;
  actor_user_id: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export type TicketAttachmentRow = {
  id: number;
  ticket_id: number;
  message_id: number | null;
  uploader_user_id: number;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  size_bytes: number | string | null;
  created_at: string;
};

export type TicketDetail = TicketRow & {
  organisation_id: number;
  description: string;
  channel: "widget" | "portal" | "email";
  messages: TicketMessage[];
  events: TicketEvent[];
  attachments: TicketAttachmentRow[];
  /** Present for the reporter (customer): server-computed, 24h rule + status. */
  can_request_escalation?: boolean;
};

export function createTicket(body: {
  product_id: number;
  category_id?: number | null;
  subcategory_id?: number | null;
  subject: string;
  description: string;
  channel?: "widget" | "portal" | "email";
  priority?: "P1" | "P2" | "P3" | "P4";
  affected_users?: number;
  metadata_json?: Record<string, unknown>;
}) {
  return http<ApiResponse<TicketRow>>("/tickets", {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.data);
}

export function listMyTickets() {
  return http<ApiResponse<TicketRow[]>>("/tickets/my").then((r) => r.data);
}

export function listTickets(filters?: {
  status?: string;
  priority?: "P1" | "P2" | "P3" | "P4";
  assignee_user_id?: number;
  queue_id?: number;
  team_id?: number;
  product_id?: number;
  unassigned_only?: boolean;
  q?: string;
  limit?: number;
}) {
  const qp = new URLSearchParams();
  if (filters?.status) qp.set("status", filters.status);
  if (filters?.priority) qp.set("priority", filters.priority);
  if (filters?.assignee_user_id) qp.set("assignee_user_id", String(filters.assignee_user_id));
  if (filters?.queue_id) qp.set("queue_id", String(filters.queue_id));
  if (filters?.team_id) qp.set("team_id", String(filters.team_id));
  if (filters?.product_id) qp.set("product_id", String(filters.product_id));
  if (filters?.unassigned_only) qp.set("unassigned_only", "true");
  if (filters?.q) qp.set("q", filters.q);
  if (filters?.limit) qp.set("limit", String(filters.limit));
  const url = qp.toString() ? `/tickets?${qp.toString()}` : "/tickets";
  return http<ApiResponse<TicketRow[]>>(url).then((r) => r.data);
}

export function getTicket(id: number) {
  return http<ApiResponse<TicketDetail>>(`/tickets/${id}`).then((r) => r.data);
}

export function uploadTicketAttachment(ticketId: number, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return httpForm<ApiResponse<TicketAttachmentRow>>(`/tickets/${ticketId}/attachments`, fd).then((r) => r.data);
}

export async function downloadTicketAttachmentBlob(ticketId: number, attachmentId: number): Promise<Blob> {
  const url = `${getApiBaseUrl()}/tickets/${ticketId}/attachments/${attachmentId}/download`;
  const token =
    typeof localStorage !== "undefined" ? localStorage.getItem("jwt_token") : null;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Download failed (${res.status})`);
  }
  return res.blob();
}

export function addTicketMessage(
  id: number,
  body: string,
  options?: { is_internal?: boolean }
) {
  return http<ApiResponse<TicketMessage>>(`/tickets/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      body,
      ...(options?.is_internal === true ? { is_internal: true } : {}),
    }),
  }).then((r) => r.data);
}

export type TicketFormProduct = {
  id: number;
  code: string;
  name: string;
  default_ticket_prefix: string;
};

export type TicketFormCategory = {
  id: number;
  name: string;
  sort_order: number | null;
  subcategories: { id: number; name: string; sort_order: number | null }[];
};

export function listTicketFormProducts() {
  return http<ApiResponse<TicketFormProduct[]>>("/tickets/form/products").then((r) => r.data);
}

export function listTicketFormCategories(productId: number) {
  return http<ApiResponse<TicketFormCategory[]>>(`/tickets/form/products/${productId}/categories`).then((r) => r.data);
}

export function updateTicketStatus(
  id: number,
  body: {
    status: "open" | "pending" | "escalated" | "resolved" | "closed" | "cancelled" | "reopened";
    reason?: string;
    resolution_note?: string;
  }
) {
  return http<ApiResponse<TicketRow>>(`/tickets/${id}/status`, {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.data);
}

export function escalateTicket(
  id: number,
  body: {
    target_team_id?: number;
    target_queue_id?: number;
    handoff_note?: string;
    reason?: string;
  }
) {
  return http<ApiResponse<TicketRow>>(`/tickets/${id}/escalate`, {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.data);
}

/** Customer-only: after 24h with no public agent reply, eligible statuses. */
export function requestTicketEscalation(id: number, body?: { reason?: string }) {
  return http<ApiResponse<TicketRow>>(`/tickets/${id}/request-escalation`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.data);
}

export function reopenTicket(id: number, reason: string) {
  return http<ApiResponse<TicketRow>>(`/tickets/${id}/reopen`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }).then((r) => r.data);
}

export function assignTicket(
  id: number,
  body: {
    assignee_user_id?: number | null;
    team_id?: number | null;
    queue_id?: number | null;
  }
) {
  return http<ApiResponse<TicketRow>>(`/tickets/${id}/assign`, {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.data);
}

