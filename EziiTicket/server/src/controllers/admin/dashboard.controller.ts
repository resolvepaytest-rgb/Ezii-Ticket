import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";

function currentOrgId(req: Request): number | null {
  return asInt(req.user?.org_id);
}

function currentUserId(req: Request): number | null {
  return asInt(req.user?.user_id);
}

export async function getMyAssignedTickets(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  if (!orgId || !userId) {
    return res.status(400).json({ ok: false, error: "invalid user context" });
  }

  // Ticket domain tables are not yet available in this service.
  return res.json({
    ok: true,
    data: {
      available: false,
      assigned_count: 0,
      warning_count: 0,
      breached_count: 0,
      message: "Ticket assignment metrics will activate once ticket tables/endpoints are integrated.",
    },
  });
}

export async function getMySlaRisk(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  if (!orgId || !userId) {
    return res.status(400).json({ ok: false, error: "invalid user context" });
  }

  // SLA risk depends on live ticket timers, which are not in the current schema.
  return res.json({
    ok: true,
    data: {
      available: false,
      warning_count: 0,
      breached_count: 0,
      next_breach_eta_mins: null,
      message: "SLA risk metrics will activate once ticket timer tracking is integrated.",
    },
  });
}

export async function getTeamQueueLoad(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  if (!orgId) {
    return res.status(400).json({ ok: false, error: "invalid user context" });
  }

  const queueCountResult = await pool.query(
    `select count(*)::int as total_queues
     from queues
     where organisation_id = $1`,
    [orgId]
  );

  const byProductResult = await pool.query(
    `select coalesce(p.name, 'Unmapped') as product_name, count(*)::int as queue_count
     from queues q
     left join products p on p.id = q.product_id
     where q.organisation_id = $1
     group by coalesce(p.name, 'Unmapped')
     order by queue_count desc, product_name asc`,
    [orgId]
  );

  return res.json({
    ok: true,
    data: {
      available: true,
      total_queues: queueCountResult.rows[0]?.total_queues ?? 0,
      by_product: byProductResult.rows,
    },
  });
}

