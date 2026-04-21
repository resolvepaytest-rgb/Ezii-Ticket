import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { ensureStorageDirs } from "./storage/ensureStorageDirs.js";
import { scheduleAttendanceOooMidnightSync } from "./services/automation/attendanceOooSync.js";
import { runAutoCloseTick, runSlaTick } from "./services/automation/ticketLifecycle.js";

async function logDbConnectionOnce() {
  if (!env.databaseUrl) {
    return;
  }

  try {
    await pool.query("select 1 as ok");
    // eslint-disable-next-line no-console
    console.log("[db] connected successfully");
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { errors?: unknown[] };
    const detail = [
      e?.message,
      e?.code,
      e?.cause instanceof Error ? e.cause.message : undefined,
      Array.isArray(e.errors) ? e.errors.map((x) => (x instanceof Error ? x.message : String(x))).join("; ") : undefined,
    ]
      .filter(Boolean)
      .join(" | ");
    // eslint-disable-next-line no-console
    console.warn("[db] connection failed:", detail || String(err));
  }
}

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${env.port}`);
  void ensureStorageDirs().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[storage] ensureStorageDirs failed:", (err as Error).message);
  });
  void logDbConnectionOnce();

  if (env.enableTicketAutomation) {
    const slaMs = Math.max(15, env.slaTickSeconds) * 1000;
    const autoCloseMs = Math.max(30, env.autoCloseTickSeconds) * 1000;

    setInterval(() => {
      void runSlaTick().catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[automation] runSlaTick failed:", (err as Error).message);
      });
    }, slaMs);

    setInterval(() => {
      void runAutoCloseTick().catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[automation] runAutoCloseTick failed:", (err as Error).message);
      });
    }, autoCloseMs);
  }

  if (env.leaveBaseUrl && env.attendanceOooSyncEnabled) {
    scheduleAttendanceOooMidnightSync();
    // eslint-disable-next-line no-console
    console.log(
      `[attendance-ooo] midnight sync enabled (orgId=${env.attendanceOooSyncOrgId}, base=${env.leaveBaseUrl})`
    );
  }
});

