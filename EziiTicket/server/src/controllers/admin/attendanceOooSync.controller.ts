import type { Request, Response } from "express";
import { asInt } from "./adminUtils.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";
import { runAttendanceOooSync, ymdLocal } from "../../services/automation/attendanceOooSync.js";

function canSyncOrganisation(req: Request, organisationId: number): boolean {
  if (isEziiSystemAdmin(req)) return true;
  const authOrg = req.user?.org_id ? asInt(String(req.user.org_id)) : null;
  return authOrg === organisationId;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /admin/organisations/:id/attendance-ooo-sync
 * Pulls leave from `LEAVE_BASE_URL` `/api/attendance-sync?startDate=&endDate=` and updates
 * `users.out_of_office`, `ooo_start_date`, `ooo_end_date`.
 * Org 1: all users in the organisation. Other orgs: only users with an active support level in that org.
 * Query: `startDate`, `endDate` (YYYY-MM-DD). Either may be omitted — defaults to server local today.
 * Legacy: `date=YYYY-MM-DD` sets both start and end when neither is provided.
 */
export async function postAttendanceOooSync(req: Request, res: Response) {
  const organisationId = asInt(String(req.params.id ?? ""));
  if (!organisationId) {
    return res.status(400).json({ ok: false, error: "Invalid organisation id" });
  }
  if (!canSyncOrganisation(req, organisationId)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const rawStart = typeof req.query.startDate === "string" ? req.query.startDate.trim() : "";
  const rawEnd = typeof req.query.endDate === "string" ? req.query.endDate.trim() : "";
  const rawLegacy = typeof req.query.date === "string" ? req.query.date.trim() : "";
  const today = ymdLocal(new Date());

  let startDate = YMD_RE.test(rawStart) ? rawStart : "";
  let endDate = YMD_RE.test(rawEnd) ? rawEnd : "";
  if (!startDate && !endDate && YMD_RE.test(rawLegacy)) {
    startDate = rawLegacy;
    endDate = rawLegacy;
  }
  if (!startDate && !endDate) {
    startDate = today;
    endDate = today;
  } else if (startDate && !endDate) {
    endDate = startDate;
  } else if (!startDate && endDate) {
    startDate = endDate;
  }

  const summary = await runAttendanceOooSync({ organisationId, startDate, endDate });
  if (!summary.ok) {
    const msg = summary.error ?? "Attendance OOO sync failed";
    const status = msg.includes("LEAVE_BASE_URL") || msg.includes("not configured") ? 503 : 502;
    return res.status(status).json({ ok: false, error: msg, data: summary });
  }

  return res.json({ ok: true, data: summary });
}
