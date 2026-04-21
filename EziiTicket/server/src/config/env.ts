import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  /** Trimmed so Windows `.env` CRLF / stray spaces do not break the URL parser or TLS/SNI. */
  databaseUrl: (process.env.DATABASE_URL ?? "").trim(),
  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtIssuer: process.env.JWT_ISSUER ?? "",
  jwtAudience: process.env.JWT_AUDIENCE ?? "",
  /**
   * Background SLA + auto-close jobs (`runSlaTick`, `runAutoCloseTick` in `index.ts`).
   * - Set `TICKET_AUTOMATION_ENABLED=0` to disable both intervals (e.g. tests, or manual SLA handling).
   * - Any other value or unset → automation runs when the server starts.
   * - When enabled: SLA tick interval is `max(15, slaTickSeconds)` seconds; auto-close interval is
   *   `max(30, autoCloseTickSeconds)` seconds (floors avoid overly aggressive timers if misconfigured).
   */
  enableTicketAutomation: (process.env.TICKET_AUTOMATION_ENABLED ?? "1") !== "0",
  /** Interval between `runSlaTick` runs (resolution 75% warn, resolution breach → escalated). Seconds; floored to ≥15 when automation is on. */
  slaTickSeconds: Number(process.env.SLA_TICK_SECONDS ?? 60),
  /** Interval between `runAutoCloseTick` runs (resolved → closed after 7 days). Seconds; floored to ≥30 when automation is on. */
  autoCloseTickSeconds: Number(process.env.AUTO_CLOSE_TICK_SECONDS ?? 300),
  /** When false, outbound notification emails are skipped (in-app + DB events still run). */
  notificationEmailEnabled: (process.env.NOTIFICATION_EMAIL_ENABLED ?? "1") !== "0",
  /** Base URL for links in emails (no trailing slash expected). */
  ticketPortalBaseUrl: (process.env.TICKET_PORTAL_BASE_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: (process.env.SMTP_SECURE ?? "0") === "1",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@localhost",
  /**
   * When the external org email-status API marks a product as inactive (`is_* === false`),
   * outbound mail for that product is sent here instead of the user’s address.
   * Override with NOTIFICATION_SANDBOX_EMAIL.
   */
  notificationSandboxEmail:
    (process.env.NOTIFICATION_SANDBOX_EMAIL ?? "resolvepaytest@gmail.com").trim() || "resolvepaytest@gmail.com",
  /**
   * Permission strict mode:
   * - 0 (default): allow legacy fallback for some actions not yet backfilled in role JSON.
   * - 1: deny when action key is missing from `permissions_json.actions` (except system_admin).
   */
  permissionStrictActions: (process.env.PERMISSION_STRICT_ACTIONS ?? "0") === "1",

  /**
   * Leave / attendance platform (no trailing slash). When set with `ATTENDANCE_OOO_SYNC_ENABLED`,
   * the server calls `GET {LEAVE_BASE_URL}/api/attendance-sync?orgId=…&startDate=…&endDate=…` daily at local midnight.
   */
  leaveBaseUrl: (process.env.LEAVE_BASE_URL ?? "").trim() || null,
  /** Optional Bearer token for attendance-sync requests. */
  leaveApiBearer: (process.env.LEAVE_API_BEARER ?? "").trim() || null,
  /** When 0, midnight attendance → OOO sync is not scheduled. */
  attendanceOooSyncEnabled: (process.env.ATTENDANCE_OOO_SYNC_ENABLED ?? "1") !== "0",
  /** Organisation id passed as `orgId` and used to scope `users.organisation_id` updates (default 1). */
  attendanceOooSyncOrgId: (() => {
    const n = Number(process.env.ATTENDANCE_OOO_SYNC_ORG_ID ?? 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
  })(),
} as const;

