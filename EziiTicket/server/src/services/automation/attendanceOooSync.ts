import { env } from "../../config/env.js";
import { pool } from "../../db/pool.js";
import { redistributeOpenTicketsForOooUsers } from "../tickets/redistributeOooTickets.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function normKey(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function extractRecordRows(payload: unknown): Record<string, unknown>[] {
  if (payload == null) return [];
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) return [];
  const nestedKeys = ["data", "records", "rows", "result", "attendance", "employees", "items", "list", "body", "payload"];
  for (const key of nestedKeys) {
    if (key in payload) {
      const inner = extractRecordRows(payload[key]);
      if (inner.length > 0) return inner;
    }
  }
  return [];
}

function parseLeaveStatus(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function isApprovedLeaveRow(row: Record<string, unknown>): boolean {
  const status = parseLeaveStatus(row.leave_status ?? row.leaveStatus);
  // The provided API returns leave records for a date; only approved rows should mark OOO.
  return status === "approved";
}

type OrgUserRow = {
  user_id: string;
  email: string | null;
  employee_number: string | null;
  attendance_id: string | null;
};

function buildOrgUserLookup(users: OrgUserRow[]) {
  const byAttendance = new Map<string, number>();
  const byEmail = new Map<string, number>();
  const byEmployee = new Map<string, number>();
  const idSet = new Set<number>();

  for (const u of users) {
    const uid = Number(u.user_id);
    if (!Number.isFinite(uid) || uid <= 0) continue;
    idSet.add(uid);
    const att = u.attendance_id != null ? normKey(u.attendance_id) : "";
    if (att) byAttendance.set(att, uid);
    const em = u.email != null ? normKey(u.email) : "";
    if (em) byEmail.set(em, uid);
    const emp = u.employee_number != null ? normKey(u.employee_number) : "";
    if (emp) byEmployee.set(emp, uid);
  }

  return { byAttendance, byEmail, byEmployee, idSet };
}

function resolveUserId(
  row: Record<string, unknown>,
  maps: ReturnType<typeof buildOrgUserLookup>
): number | null {
  const attRaw =
    row.attendance_id ??
    row.attendanceId ??
    row.AttendanceId ??
    row.attendanceID ??
    row.attendance_code ??
    row.attendanceCode;
  if (attRaw != null) {
    const uid = maps.byAttendance.get(normKey(attRaw));
    if (uid != null) return uid;
  }

  const empRaw = row.employee_number ?? row.employeeNumber ?? row.emp_code ?? row.empCode ?? row.employee_code;
  if (empRaw != null) {
    const uid = maps.byEmployee.get(normKey(empRaw));
    if (uid != null) return uid;
  }

  const emailRaw = row.email ?? row.user_email ?? row.userEmail ?? row.work_email;
  if (emailRaw != null) {
    const uid = maps.byEmail.get(normKey(emailRaw));
    if (uid != null) return uid;
  }

  const uidRaw = row.user_id ?? row.userId ?? row.ticket_user_id ?? row.ticketUserId;
  const n = Number(uidRaw);
  if (Number.isFinite(n) && n > 0 && maps.idSet.has(n)) return n;

  return null;
}

function attendanceUrl(base: string, organisationId: number, startYmd: string, endYmd: string): string {
  const root = base.replace(/\/+$/, "");
  const qs = new URLSearchParams({
    orgId: String(organisationId),
    startDate: startYmd,
    endDate: endYmd,
  });
  return `${root}/api/attendance-sync?${qs.toString()}`;
}

async function fetchAttendancePayload(
  baseUrl: string,
  organisationId: number,
  startYmd: string,
  endYmd: string
): Promise<unknown> {
  const url = attendanceUrl(baseUrl, organisationId, startYmd, endYmd);
  const headers: Record<string, string> = { accept: "application/json" };
  const token = env.leaveApiBearer?.trim();
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`attendance-sync HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(`attendance-sync expected JSON, got: ${ct} ${text.slice(0, 120)}`);
  }
  return (await res.json()) as unknown;
}

function parseIsoYmd(v: unknown): string | null {
  const s = String(v ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Best-effort leave bounds from one API row (single-day or start/end). */
function rowLeaveDateBounds(
  row: Record<string, unknown>,
  fallbackWindow?: { startDate: string; endDate: string }
): { min: string; max: string } | null {
  const single =
    parseIsoYmd(row.leave_date) ??
    parseIsoYmd(row.leaveDate) ??
    parseIsoYmd(row.date) ??
    parseIsoYmd(row.leave_day) ??
    parseIsoYmd(row.attendance_date);
  const start =
    parseIsoYmd(row.start_date) ??
    parseIsoYmd(row.startDate) ??
    parseIsoYmd(row.from_date) ??
    parseIsoYmd(row.leave_start_date) ??
    parseIsoYmd(row.leaveStartDate) ??
    single;
  const end =
    parseIsoYmd(row.end_date) ??
    parseIsoYmd(row.endDate) ??
    parseIsoYmd(row.to_date) ??
    parseIsoYmd(row.leave_end_date) ??
    parseIsoYmd(row.leaveEndDate) ??
    start;
  if (!start || !end) {
    if (fallbackWindow) {
      return {
        min: fallbackWindow.startDate,
        max: fallbackWindow.endDate,
      };
    }
    return null;
  }
  const min = start <= end ? start : end;
  const max = end >= start ? end : start;
  return { min, max };
}

function rangeOverlapsWindow(rowMin: string, rowMax: string, winStart: string, winEnd: string): boolean {
  return rowMax >= winStart && rowMin <= winEnd;
}

function mergeBounds(a: { min: string; max: string }, b: { min: string; max: string }): { min: string; max: string } {
  return {
    min: a.min < b.min ? a.min : b.min,
    max: a.max > b.max ? a.max : b.max,
  };
}

export type AttendanceOooSyncRunSummary = {
  ok: boolean;
  organisationId: number;
  start_date: string;
  end_date: string;
  rowsFromApi: number;
  /** Users who transitioned to out_of_office=true because today falls within synced leave range. */
  updatedTrue: number;
  /** Users cleared to out_of_office=false (not on approved leave in this payload window). */
  updatedFalse: number;
  unresolvedRows: number;
  /** Users with at least one resolved approved leave row overlapping the query window. */
  users_with_leave: number;
  error?: string;
};

/**
 * Pulls `/api/attendance-sync` from `LEAVE_BASE_URL` for [startDate, endDate] and updates `users`:
 * - `ooo_start_date` / `ooo_end_date`: union of approved leave bounds from matching rows
 * - `out_of_office`: true iff server-local **today** lies within that union
 * Users in the org with no matching leave rows: OOO cleared and date range nulled.
 */
export async function runAttendanceOooSync(args: {
  organisationId: number;
  startDate: string;
  endDate: string;
}): Promise<AttendanceOooSyncRunSummary> {
  const startDate = args.startDate.trim();
  const endDate = args.endDate.trim();
  const base = env.leaveBaseUrl?.trim();
  if (!base) {
    return {
      ok: false,
      organisationId: args.organisationId,
      start_date: startDate,
      end_date: endDate,
      rowsFromApi: 0,
      updatedTrue: 0,
      updatedFalse: 0,
      unresolvedRows: 0,
      users_with_leave: 0,
      error: "LEAVE_BASE_URL is not configured",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    return {
      ok: false,
      organisationId: args.organisationId,
      start_date: startDate,
      end_date: endDate,
      rowsFromApi: 0,
      updatedTrue: 0,
      updatedFalse: 0,
      unresolvedRows: 0,
      users_with_leave: 0,
      error: "Invalid startDate / endDate (expected YYYY-MM-DD, start ≤ end)",
    };
  }

  let payload: unknown;
  try {
    payload = await fetchAttendancePayload(base, args.organisationId, startDate, endDate);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return {
      ok: false,
      organisationId: args.organisationId,
      start_date: startDate,
      end_date: endDate,
      rowsFromApi: 0,
      updatedTrue: 0,
      updatedFalse: 0,
      unresolvedRows: 0,
      users_with_leave: 0,
      error: msg,
    };
  }

  const rows = extractRecordRows(payload);
  if (rows.length === 0) {
    return {
      ok: true,
      organisationId: args.organisationId,
      start_date: startDate,
      end_date: endDate,
      rowsFromApi: 0,
      updatedTrue: 0,
      updatedFalse: 0,
      unresolvedRows: 0,
      users_with_leave: 0,
    };
  }

  const usersRes = await pool.query<OrgUserRow>(
    `select user_id::text as user_id,
            nullif(trim(both from email), '') as email,
            nullif(trim(both from employee_number), '') as employee_number,
            nullif(trim(both from attendance_id), '') as attendance_id
     from users
     where organisation_id = $1::bigint`,
    [args.organisationId]
  );
  const maps = buildOrgUserLookup(usersRes.rows);

  const rangeByUser = new Map<number, { min: string; max: string }>();
  let unresolvedRows = 0;

  for (const row of rows) {
    const rowOrgId = Number(row.org_id ?? row.orgId);
    if (Number.isFinite(rowOrgId) && rowOrgId > 0 && rowOrgId !== args.organisationId) {
      continue;
    }
    if (!isApprovedLeaveRow(row)) continue;
    const bounds = rowLeaveDateBounds(row, { startDate, endDate });
    if (!bounds) continue;
    if (!rangeOverlapsWindow(bounds.min, bounds.max, startDate, endDate)) continue;
    const uid = resolveUserId(row, maps);
    if (uid == null) {
      unresolvedRows += 1;
      continue;
    }
    const prev = rangeByUser.get(uid);
    rangeByUser.set(uid, prev ? mergeBounds(prev, bounds) : bounds);
  }

  const today = ymdLocal(new Date());
  const beforeRes = await pool.query<{ user_id: string; out_of_office: boolean }>(
    `select user_id::text, coalesce(out_of_office, false) as out_of_office
     from users where organisation_id = $1::bigint`,
    [args.organisationId]
  );
  const beforeOoo = new Map<number, boolean>();
  for (const r of beforeRes.rows) {
    const uid = Number(r.user_id);
    if (Number.isFinite(uid)) beforeOoo.set(uid, r.out_of_office === true);
  }

  let updatedTrue = 0;
  const newlyOooUserIds: number[] = [];

  for (const [userId, bounds] of rangeByUser) {
    const inLeaveToday = today >= bounds.min && today <= bounds.max;
    await pool.query(
      `update users
       set out_of_office = $3::boolean,
           ooo_start_date = $4::date,
           ooo_end_date = $5::date,
           updated_at = now()
       where user_id = $1::bigint and organisation_id = $2::bigint`,
      [userId, args.organisationId, inLeaveToday, bounds.min, bounds.max]
    );
    if (inLeaveToday && beforeOoo.get(userId) !== true) {
      updatedTrue += 1;
      newlyOooUserIds.push(userId);
    }
  }

  const keepIds = [...rangeByUser.keys()];
  const clear = await pool.query(
    `update users
     set out_of_office = false,
         ooo_start_date = null,
         ooo_end_date = null,
         updated_at = now()
     where organisation_id = $1::bigint
       and not (user_id = any($2::bigint[]))`,
    [args.organisationId, keepIds.length ? keepIds : [-1]]
  );
  const updatedFalse = clear.rowCount ?? 0;

  if (newlyOooUserIds.length > 0) {
    await redistributeOpenTicketsForOooUsers({
      organisationId: args.organisationId,
      sourceUserIds: newlyOooUserIds,
    });
  }

  return {
    ok: true,
    organisationId: args.organisationId,
    start_date: startDate,
    end_date: endDate,
    rowsFromApi: rows.length,
    updatedTrue,
    updatedFalse,
    unresolvedRows,
    users_with_leave: rangeByUser.size,
  };
}

/** Server process local calendar date (set `TZ` if a specific region is required). */
export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function msUntilNextLocalMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const ms = next.getTime() - now.getTime();
  return Math.max(5_000, ms);
}

/**
 * Runs once at the next local midnight, then chains forever. Uses the server process timezone
 * (set `TZ` in the environment if you need a specific region’s midnight).
 */
export function scheduleAttendanceOooMidnightSync(): void {
  const tick = () => {
    const delay = msUntilNextLocalMidnight();
    setTimeout(async () => {
      const ymd = ymdLocal(new Date());
      try {
        const summary = await runAttendanceOooSync({
          organisationId: env.attendanceOooSyncOrgId,
          startDate: ymd,
          endDate: ymd,
        });
        if (!summary.ok) {
          // eslint-disable-next-line no-console
          console.warn("[attendance-ooo] sync failed:", summary.error ?? "unknown");
        } else {
          // eslint-disable-next-line no-console
          console.log(
            `[attendance-ooo] org=${summary.organisationId} range=${summary.start_date}..${summary.end_date} api_rows=${summary.rowsFromApi} -> new_ooo_today=${summary.updatedTrue} cleared=${summary.updatedFalse} leave_users=${summary.users_with_leave} unmatched=${summary.unresolvedRows}`
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[attendance-ooo] sync error:", (err as Error).message);
      }
      tick();
    }, delay);
  };
  tick();
}
