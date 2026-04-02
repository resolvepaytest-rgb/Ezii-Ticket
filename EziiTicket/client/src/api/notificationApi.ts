import { http } from "./httpClient";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
  error?: string;
};

export type UserNotification = {
  id: number;
  organisation_id: number;
  user_id: number;
  ticket_id: number | null;
  event_key: string;
  title: string;
  message: string;
  navigate_url: string;
  is_read: boolean;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export function listMyNotifications(status: "unread" | "read" | "all" = "unread", limit = 50) {
  const qp = new URLSearchParams();
  qp.set("status", status);
  qp.set("limit", String(limit));
  qp.set("_ts", String(Date.now()));
  return http<ApiResponse<{ items: UserNotification[]; unread_count: number }>>(`/notifications?${qp.toString()}`).then(
    (r) => r.data
  );
}

export function markNotificationRead(id: number) {
  return http<ApiResponse<{ id: number }>>(`/notifications/${id}/read`, {
    method: "POST",
    body: JSON.stringify({}),
  }).then((r) => r.data);
}

export function markAllNotificationsRead() {
  return http<ApiResponse<unknown>>("/notifications/read-all", {
    method: "POST",
    body: JSON.stringify({}),
  }).then((r) => r.ok);
}

