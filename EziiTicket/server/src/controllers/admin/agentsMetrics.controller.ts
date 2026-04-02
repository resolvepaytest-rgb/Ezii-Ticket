import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";

const OPEN_STATUSES = ["new", "open", "pending", "escalated", "reopened"] as const;

function canReadOrganisation(req: Request, organisationId: number): boolean {
  if (isEziiSystemAdmin(req)) return true;
  const authOrg = asInt(req.user?.org_id);
  return authOrg === organisationId;
}

/**
 * Open ticket counts per assignee (same status set as auto-assignment).
 * CSAT: average of `metadata_json->>'csat_score'` on resolved/closed tickets (1–5 scale), when present.
 */
export async function getAgentsTicketMetrics(req: Request, res: Response) {
  const organisationId = req.query.organisation_id ? asInt(req.query.organisation_id) : null;
  if (!organisationId) {
    return res.status(400).json({ ok: false, error: "organisation_id is required" });
  }
  if (!canReadOrganisation(req, organisationId)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const openRows = await pool.query<{ user_id: string; open_count: number }>(
    `select assignee_user_id::text as user_id, count(*)::int as open_count
     from tickets
     where organisation_id = $1
       and assignee_user_id is not null
       and status = any($2::text[])
     group by assignee_user_id`,
    [organisationId, [...OPEN_STATUSES]]
  );
  const openByProductRows = await pool.query<{
    user_id: string;
    product_name: string | null;
    open_count: number;
  }>(
    `select t.assignee_user_id::text as user_id,
            p.name as product_name,
            count(*)::int as open_count
     from tickets t
     left join products p on p.id = t.product_id
     where t.organisation_id = $1
       and t.assignee_user_id is not null
       and t.status = any($2::text[])
     group by t.assignee_user_id, p.name`,
    [organisationId, [...OPEN_STATUSES]]
  );

  const csatRows = await pool.query<{ user_id: string; csat_avg: string | null; rated_count: number }>(
    `select assignee_user_id::text as user_id,
            avg((metadata_json->>'csat_score')::numeric) as csat_avg,
            count(*)::int as rated_count
     from tickets
     where organisation_id = $1
       and assignee_user_id is not null
       and status in ('resolved', 'closed')
       and metadata_json ? 'csat_score'
       and (metadata_json->>'csat_score') ~ '^[0-9]+(\\.[0-9]*)?$'
       and (metadata_json->>'csat_score')::numeric between 1 and 5
     group by assignee_user_id`,
    [organisationId]
  );

  const openByUser = new Map<number, number>();
  for (const r of openRows.rows) {
    const uid = Number(r.user_id);
    if (!Number.isFinite(uid)) continue;
    openByUser.set(uid, Number(r.open_count) || 0);
  }

  const csatByUser = new Map<number, { csat_avg: number; rated_count: number }>();
  for (const r of csatRows.rows) {
    const uid = Number(r.user_id);
    if (!Number.isFinite(uid)) continue;
    const avg = r.csat_avg != null ? Number(r.csat_avg) : NaN;
    if (!Number.isFinite(avg)) continue;
    csatByUser.set(uid, {
      csat_avg: Math.round(avg * 10) / 10,
      rated_count: Number(r.rated_count) || 0,
    });
  }
  const openByProductUser = new Map<number, Array<{ product_name: string; open_count: number }>>();
  for (const r of openByProductRows.rows) {
    const uid = Number(r.user_id);
    if (!Number.isFinite(uid)) continue;
    const productName = String(r.product_name ?? "").trim() || "Unmapped";
    if (!openByProductUser.has(uid)) openByProductUser.set(uid, []);
    openByProductUser.get(uid)!.push({
      product_name: productName,
      open_count: Number(r.open_count) || 0,
    });
  }

  const userIds = new Set<number>([...openByUser.keys(), ...csatByUser.keys(), ...openByProductUser.keys()]);
  const data = [...userIds].sort((a, b) => a - b).map((user_id) => ({
    user_id,
    open_count: openByUser.get(user_id) ?? 0,
    csat_avg: csatByUser.get(user_id)?.csat_avg ?? null,
    csat_rated_count: csatByUser.get(user_id)?.rated_count ?? 0,
    open_by_product: openByProductUser.get(user_id) ?? [],
  }));

  return res.json({ ok: true, data });
}
