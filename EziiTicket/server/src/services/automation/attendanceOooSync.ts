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

function attendanceUrl(base: string, organisationId: number, ymd: string): string {
  const root = base.replace(/\/+$/, "");
  const qs = new URLSearchParams({
    orgId: String(organisationId),
    startDate: ymd,
    endDate: ymd,
  });
  return `${root}/api/attendance-sync?${qs.toString()}`;
}

async function fetchAttendancePayload(baseUrl: string, organisationId: number, ymd: string): Promise<unknown> {
  const url = attendanceUrl(baseUrl, organisationId, ymd);
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

/**
 * Nightly job: pulls `/api/attendance-sync` from `LEAVE_BASE_URL` and updates `users.out_of_office`
 * for the configured organisation (default 1). With the leave API contract:
 * - each item in `data[]` is a leave record for a date
 * - `employee_number` identifies the user
 * - only `leave_status = approved` should become OOO=true
 * Everyone else in the organisation is set to OOO=false for that day.
 */
export async function runAttendanceOooSync(args: { organisationId: number; ymd: string }): Promise<{
  ok: boolean;
  organisationId: number;
  ymd: string;
  rowsFromApi: number;
  updatedTrue: number;
  updatedFalse: number;
  unresolvedRows: number;
  error?: string;
}> {
  const base = env.leaveBaseUrl?.trim();
  if (!base) {
    return {
      ok: false,
      organisationId: args.organisationId,
      ymd: args.ymd,
      rowsFromApi: 0,
      updatedTrue: 0,
      updatedFalse: 0,
      unresolvedRows: 0,
      error: "LEAVE_BASE_URL is not configured",
    };
  }

  let payload: unknown;
  try {
    payload = await fetchAttendancePayload(base, args.organisationId, args.ymd);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return {
      ok: false,
      organisationId: args.organisationId,
      ymd: args.ymd,
      rowsFromApi: 0,
      updatedTrue: 0,
      updatedFalse: 0,
      unresolvedRows: 0,
      error: msg,
    };
  }

  const rows = extractRecordRows(payload);
  if (rows.length === 0) {
    return {
      ok: true,
      organisationId: args.organisationId,
      ymd: args.ymd,
      rowsFromApi: 0,
      updatedTrue: 0,
      updatedFalse: 0,
      unresolvedRows: 0,
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

  const onLeaveIds = new Set<number>();
  let unresolvedRows = 0;

  for (const row of rows) {
    const rowOrgId = Number(row.org_id ?? row.orgId);
    if (Number.isFinite(rowOrgId) && rowOrgId > 0 && rowOrgId !== args.organisationId) {
      continue;
    }
    if (!isApprovedLeaveRow(row)) continue;
    const uid = resolveUserId(row, maps);
    if (uid == null) {
      unresolvedRows += 1;
      continue;
    }
    onLeaveIds.add(uid);
  }

  let updatedTrue = 0;
  let updatedFalse = 0;
  const newlyOooUserIds: number[] = [];

  for (const userId of onLeaveIds) {
    const r = await pool.query(
      `update users
       set out_of_office = true,
           updated_at = now()
       where user_id = $1::bigint
         and organisation_id = $2::bigint
         and coalesce(out_of_office, false) = false
       returning user_id`,
      [userId, args.organisationId]
    );
    if (r.rowCount && r.rowCount > 0) {
      updatedTrue += 1;
      newlyOooUserIds.push(userId);
    }
  }

  const keepIds = [...onLeaveIds];
  const clear = await pool.query(
    `update users
     set out_of_office = false,
         updated_at = now()
     where organisation_id = $1::bigint
       and coalesce(out_of_office, false) = true
       and not (user_id = any($2::bigint[]))`,
    [args.organisationId, keepIds.length ? keepIds : [-1]]
  );
  updatedFalse = clear.rowCount ?? 0;
  if (newlyOooUserIds.length > 0) {
    await redistributeOpenTicketsForOooUsers({
      organisationId: args.organisationId,
      sourceUserIds: newlyOooUserIds,
    });
  }

  return {
    ok: true,
    organisationId: args.organisationId,
    ymd: args.ymd,
    rowsFromApi: rows.length,
    updatedTrue,
    updatedFalse,
    unresolvedRows,
  };
}

function localYmd(d: Date): string {
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
      const ymd = localYmd(new Date());
      try {
        const summary = await runAttendanceOooSync({
          organisationId: env.attendanceOooSyncOrgId,
          ymd,
        });
        if (!summary.ok) {
          // eslint-disable-next-line no-console
          console.warn("[attendance-ooo] sync failed:", summary.error ?? "unknown");
        } else {
          // eslint-disable-next-line no-console
          console.log(
            `[attendance-ooo] org=${summary.organisationId} date=${summary.ymd} api_rows=${summary.rowsFromApi} -> ooo_true=${summary.updatedTrue} cleared=${summary.updatedFalse} unmatched=${summary.unresolvedRows}`
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
