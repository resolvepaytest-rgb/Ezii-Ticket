import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";

function canListSystemTickets(req: Request): boolean {
  const rn = String(req.user?.role_name ?? "").toLowerCase();
  if (rn === "system_admin") return true;
  return isEziiSystemAdmin(req);
}

function nextDeadlineExpr(alias = "t") {
  return `CASE
    WHEN ${alias}.first_response_due_at IS NULL AND ${alias}.resolution_due_at IS NULL THEN NULL
    ELSE LEAST(
      COALESCE(${alias}.first_response_due_at, 'infinity'::timestamptz),
      COALESCE(${alias}.resolution_due_at, 'infinity'::timestamptz)
    )
  END`;
}

const ACTIVE_STATUSES_SQL = `('new','open','pending','escalated','reopened')`;

function slaStatusWhere(nd: string, sla: string | null): string | null {
  if (!sla || sla === "all") return null;
  const active = `t.status in ${ACTIVE_STATUSES_SQL}`;
  switch (sla) {
    case "breached":
      return `(${active} and (${nd}) is not null and (${nd}) < now())`;
    case "at_risk":
      return `(${active} and (${nd}) is not null and (${nd}) >= now() and (${nd}) <= now() + interval '4 hours')`;
    case "on_track":
      return `(${active} and (${nd}) is not null and (${nd}) > now() + interval '4 hours')`;
    case "no_deadline":
      return `(${active} and (${nd}) is null)`;
    default:
      return null;
  }
}

function parseCommaInts(q: unknown): number[] {
  if (q == null || q === "") return [];
  const raw = Array.isArray(q) ? q.join(",") : String(q);
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const n = asInt(part.trim());
    if (n !== null) out.push(n);
  }
  return [...new Set(out)];
}

function parsePrioritiesParam(q: unknown): ("P1" | "P2" | "P3" | "P4")[] {
  if (q == null || q === "") return [];
  const raw = Array.isArray(q) ? q.join(",") : String(q);
  const allowed = new Set(["P1", "P2", "P3", "P4"]);
  const out: ("P1" | "P2" | "P3" | "P4")[] = [];
  for (const part of raw.split(",")) {
    const p = part.trim().toUpperCase();
    if (allowed.has(p)) out.push(p as "P1" | "P2" | "P3" | "P4");
  }
  return [...new Set(out)];
}

function parseSlaStatusesParam(q: unknown): string[] {
  if (q == null || q === "") return [];
  const raw = Array.isArray(q) ? q.join(",") : String(q);
  const allowed = new Set(["breached", "at_risk", "on_track", "no_deadline"]);
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim().toLowerCase();
    if (allowed.has(s)) out.push(s);
  }
  return [...new Set(out)];
}

export async function getSystemTicketFilterOptions(req: Request, res: Response) {
  if (!canListSystemTickets(req)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  try {
    const [orgsRes, productsRes] = await Promise.all([
      pool.query<{ id: number; name: string }>(
        `select distinct t.organisation_id as id, o.name
         from tickets t
         inner join organisations o on o.id = t.organisation_id
         order by o.name asc`
      ),
      pool.query<{ id: number; name: string }>(
        `select distinct t.product_id as id, p.name
         from tickets t
         inner join products p on p.id = t.product_id
         order by p.name asc`
      ),
    ]);

    return res.json({
      ok: true,
      data: {
        organisations: orgsRes.rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? ""),
        })),
        products: productsRes.rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? ""),
        })),
      },
    });
  } catch (e) {
    console.error("getSystemTicketFilterOptions", e);
    return res.status(500).json({ ok: false, error: "failed to load filter options" });
  }
}

export async function listSystemTickets(req: Request, res: Response) {
  if (!canListSystemTickets(req)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const limit = Math.min(100, Math.max(1, asInt(req.query.limit) ?? 15));
  const offset = Math.max(0, asInt(req.query.offset) ?? 0);
  const statusFilter = typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.trim() : null;
  const q =
    typeof req.query.q === "string" && req.query.q.trim() ? `%${req.query.q.trim().replace(/%/g, "\\%")}%` : null;

  let organisationIds = parseCommaInts(req.query.organisation_ids);
  let productIds = parseCommaInts(req.query.product_ids);
  let priorityList = parsePrioritiesParam(req.query.priorities);
  let slaStatuses = parseSlaStatusesParam(req.query.sla);

  const legacyOrg = asInt(req.query.organisation_id);
  if (organisationIds.length === 0 && legacyOrg !== null) organisationIds = [legacyOrg];
  const legacyProduct = asInt(req.query.product_id);
  if (productIds.length === 0 && legacyProduct !== null) productIds = [legacyProduct];
  const legacyPri =
    typeof req.query.priority === "string" && ["P1", "P2", "P3", "P4"].includes(req.query.priority.toUpperCase())
      ? (req.query.priority.toUpperCase() as "P1" | "P2" | "P3" | "P4")
      : null;
  if (priorityList.length === 0 && legacyPri !== null) priorityList = [legacyPri];
  const legacySlaRaw = typeof req.query.sla === "string" ? req.query.sla.trim().toLowerCase() : "";
  if (
    slaStatuses.length === 0 &&
    legacySlaRaw &&
    ["breached", "at_risk", "on_track", "no_deadline"].includes(legacySlaRaw)
  ) {
    slaStatuses = [legacySlaRaw];
  }

  const where: string[] = [];
  const args: unknown[] = [];
  let i = 1;

  const nd = nextDeadlineExpr("t");

  if (statusFilter) {
    where.push(`t.status = $${i++}`);
    args.push(statusFilter);
  }
  if (priorityList.length === 1) {
    where.push(`t.priority = $${i++}`);
    args.push(priorityList[0]);
  } else if (priorityList.length > 1) {
    where.push(`t.priority = ANY($${i++}::text[])`);
    args.push(priorityList);
  }
  if (organisationIds.length === 1) {
    where.push(`t.organisation_id = $${i++}`);
    args.push(organisationIds[0]);
  } else if (organisationIds.length > 1) {
    where.push(`t.organisation_id = ANY($${i++}::bigint[])`);
    args.push(organisationIds);
  }
  if (productIds.length === 1) {
    where.push(`t.product_id = $${i++}`);
    args.push(productIds[0]);
  } else if (productIds.length > 1) {
    where.push(`t.product_id = ANY($${i++}::bigint[])`);
    args.push(productIds);
  }
  if (q) {
    where.push(`(t.subject ilike $${i} escape '\\' or t.ticket_code ilike $${i} escape '\\')`);
    args.push(q);
    i += 1;
  }
  if (slaStatuses.length > 0) {
    const slaParts = slaStatuses.map((s) => slaStatusWhere(nd, s)).filter((x): x is string => Boolean(x));
    if (slaParts.length === 1) {
      where.push(slaParts[0]!);
    } else if (slaParts.length > 1) {
      where.push(`(${slaParts.join(" or ")})`);
    }
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  const countSql = `
    select count(*)::int as c
    from tickets t
    ${whereSql}
  `;

  const kpiSql = `
    with base as (
      select t.*, ${nd} as next_deadline
      from tickets t
      ${whereSql}
    )
    select
      count(*) filter (where status in ('new','open','pending','escalated','reopened'))::int as total_active,
      count(*) filter (
        where priority = 'P1' and status in ('new','open','pending','escalated','reopened')
      )::int as p1_critical,
      count(*) filter (
        where status in ('new','open','pending','escalated','reopened')
          and next_deadline is not null
          and next_deadline <= now() + interval '4 hours'
      )::int as sla_at_risk,
      coalesce(
        avg(extract(epoch from (resolved_at - created_at)) / 3600.0) filter (
          where resolved_at is not null and status in ('resolved', 'closed')
        ),
        0
      )::float8 as avg_resolution_hours
    from base
  `;

  const listSql = `
    select
      t.id,
      t.ticket_code,
      t.organisation_id,
      o.name as organisation_name,
      t.subject,
      t.status,
      t.priority,
      t.product_id,
      p.name as product_name,
      t.first_response_due_at,
      t.resolution_due_at,
      (${nd}) as next_sla_deadline_at,
      t.updated_at
    from tickets t
    inner join organisations o on o.id = t.organisation_id
    inner join products p on p.id = t.product_id
    ${whereSql}
    order by t.updated_at desc
    limit $${i} offset $${i + 1}
  `;

  try {
    const [countRes, kpiRes, listRes] = await Promise.all([
      pool.query(countSql, args),
      pool.query(kpiSql, args),
      pool.query(listSql, [...args, limit, offset]),
    ]);

    const total = Number(countRes.rows[0]?.c ?? 0);
    const kpiRow = kpiRes.rows[0] as {
      total_active: number;
      p1_critical: number;
      sla_at_risk: number;
      avg_resolution_hours: number;
    };

    return res.json({
      ok: true,
      data: {
        total,
        kpis: {
          total_active: kpiRow.total_active,
          p1_critical: kpiRow.p1_critical,
          sla_at_risk: kpiRow.sla_at_risk,
          avg_resolution_hours: Math.round(kpiRow.avg_resolution_hours * 10) / 10,
        },
        rows: listRes.rows,
      },
    });
  } catch (e) {
    console.error("listSystemTickets", e);
    return res.status(500).json({ ok: false, error: "failed to load system tickets" });
  }
}

const ACTIVE_TICKET_STATUSES = `('new','open','pending','escalated','reopened')`;

/** Per-org open ticket counts and resolution SLA attainment (resolved/closed vs resolution_due_at). */
export async function getOrganisationTicketMetrics(req: Request, res: Response) {
  if (!canListSystemTickets(req)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  try {
    const byOrgRes = await pool.query<{
      organisation_id: string;
      open_tickets: number;
      resolved_with_sla: number;
      met_resolution_sla: number;
    }>(
      `select
         o.id::text as organisation_id,
         coalesce(oc.open_count, 0)::int as open_tickets,
         coalesce(sc.resolved_with_sla, 0)::int as resolved_with_sla,
         coalesce(sc.met_resolution_sla, 0)::int as met_resolution_sla
       from organisations o
       left join (
         select organisation_id, count(*)::int as open_count
         from tickets
         where status in ${ACTIVE_TICKET_STATUSES}
         group by organisation_id
       ) oc on oc.organisation_id = o.id
       left join (
         select
           organisation_id,
           count(*) filter (where resolution_due_at is not null)::int as resolved_with_sla,
           count(*) filter (
             where resolution_due_at is not null
               and resolved_at is not null
               and resolved_at <= resolution_due_at
           )::int as met_resolution_sla
         from tickets
         where status in ('resolved', 'closed')
         group by organisation_id
       ) sc on sc.organisation_id = o.id
       order by o.id asc`
    );

    const globalRes = await pool.query<{
      open_tickets: number;
      resolved_with_sla: number;
      met_resolution_sla: number;
    }>(
      `select
         count(*) filter (where status in ${ACTIVE_TICKET_STATUSES})::int as open_tickets,
         count(*) filter (where status in ('resolved', 'closed') and resolution_due_at is not null)::int as resolved_with_sla,
         count(*) filter (
           where status in ('resolved', 'closed')
             and resolution_due_at is not null
             and resolved_at is not null
             and resolved_at <= resolution_due_at
         )::int as met_resolution_sla
       from tickets`
    );

    const g = globalRes.rows[0];
    const globalOpen = Number(g?.open_tickets ?? 0);
    const gResolved = Number(g?.resolved_with_sla ?? 0);
    const gMet = Number(g?.met_resolution_sla ?? 0);
    const globalSlaPct =
      gResolved > 0 ? Math.round((1000 * gMet) / gResolved) / 10 : null;

    const by_org: Record<
      string,
      { open_tickets: number; sla_attainment_pct: number | null }
    > = {};
    for (const r of byOrgRes.rows) {
      const id = String(r.organisation_id);
      const resolved = Number(r.resolved_with_sla) || 0;
      const met = Number(r.met_resolution_sla) || 0;
      by_org[id] = {
        open_tickets: Number(r.open_tickets) || 0,
        sla_attainment_pct:
          resolved > 0 ? Math.round((1000 * met) / resolved) / 10 : null,
      };
    }

    return res.json({
      ok: true,
      data: {
        by_org,
        global: {
          open_tickets: globalOpen,
          sla_attainment_pct: globalSlaPct,
        },
      },
    });
  } catch (e) {
    console.error("getOrganisationTicketMetrics", e);
    return res.status(500).json({ ok: false, error: "failed to load organisation ticket metrics" });
  }
}
