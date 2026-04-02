import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";
import { appendAdminAudit } from "./adminAudit.js";

export type PriorityKey = "P1" | "P2" | "P3" | "P4";

const PRIORITIES: PriorityKey[] = ["P1", "P2", "P3", "P4"];

function normPriority(p: unknown): PriorityKey {
  const v = String(p ?? "P3").toUpperCase();
  if (v === "P1" || v === "P2" || v === "P3" || v === "P4") return v;
  return "P3";
}

/** Defaults when no row exists for an org (same as seeded org 1 template). */
export const DEFAULT_TIER1_BOUNDS_FALLBACK: Record<
  PriorityKey,
  { minFirstResponseMins: number; maxFirstResponseMins: number; minResolutionMins: number; maxResolutionMins: number }
> = {
  P1: { minFirstResponseMins: 15, maxFirstResponseMins: 120, minResolutionMins: 120, maxResolutionMins: 480 },
  P2: { minFirstResponseMins: 60, maxFirstResponseMins: 360, minResolutionMins: 240, maxResolutionMins: 960 },
  P3: { minFirstResponseMins: 120, maxFirstResponseMins: 720, minResolutionMins: 960, maxResolutionMins: 2880 },
  P4: { minFirstResponseMins: 240, maxFirstResponseMins: 1440, minResolutionMins: 2400, maxResolutionMins: 10080 },
};

export type ResolvedTier1Bound = (typeof DEFAULT_TIER1_BOUNDS_FALLBACK)[PriorityKey];

export async function resolveTier1Bound(orgId: number, priority: PriorityKey): Promise<ResolvedTier1Bound> {
  const r = await pool.query(
    `select min_first_response_mins, max_first_response_mins, min_resolution_mins, max_resolution_mins
     from sla_tier1_bounds
     where organisation_id = $1::bigint and priority = $2`,
    [orgId, priority]
  );
  const row = r.rows[0];
  if (!row) return DEFAULT_TIER1_BOUNDS_FALLBACK[priority];
  return {
    minFirstResponseMins: Number(row.min_first_response_mins),
    maxFirstResponseMins: Number(row.max_first_response_mins),
    minResolutionMins: Number(row.min_resolution_mins),
    maxResolutionMins: Number(row.max_resolution_mins),
  };
}

export async function ensureDefaultTier1BoundsForOrg(organisationId: bigint): Promise<void> {
  const src = await pool.query(
    `select priority, min_first_response_mins, max_first_response_mins, min_resolution_mins, max_resolution_mins
     from sla_tier1_bounds
     where organisation_id = 1`
  );
  const templates =
    src.rows.length > 0
      ? src.rows.map((row) => ({
          priority: normPriority(row.priority),
          minFr: Number(row.min_first_response_mins),
          maxFr: Number(row.max_first_response_mins),
          minRes: Number(row.min_resolution_mins),
          maxRes: Number(row.max_resolution_mins),
        }))
      : PRIORITIES.map((p) => ({
          priority: p,
          minFr: DEFAULT_TIER1_BOUNDS_FALLBACK[p].minFirstResponseMins,
          maxFr: DEFAULT_TIER1_BOUNDS_FALLBACK[p].maxFirstResponseMins,
          minRes: DEFAULT_TIER1_BOUNDS_FALLBACK[p].minResolutionMins,
          maxRes: DEFAULT_TIER1_BOUNDS_FALLBACK[p].maxResolutionMins,
        }));

  for (const t of templates) {
    await pool.query(
      `insert into sla_tier1_bounds (
         organisation_id, priority, min_first_response_mins, max_first_response_mins, min_resolution_mins, max_resolution_mins
       ) values ($1::bigint, $2, $3, $4, $5, $6)
       on conflict (organisation_id, priority) do nothing`,
      [organisationId, t.priority, t.minFr, t.maxFr, t.minRes, t.maxRes]
    );
  }
}

type BoundsRow = {
  priority: string;
  min_first_response_mins: number;
  max_first_response_mins: number;
  min_resolution_mins: number;
  max_resolution_mins: number;
};

export async function listSlaTier1Bounds(req: Request, res: Response) {
  const orgId = asInt(req.params.id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid organisation id" });

  const result = await pool.query(
    `select priority, min_first_response_mins, max_first_response_mins, min_resolution_mins, max_resolution_mins
     from sla_tier1_bounds
     where organisation_id = $1::bigint`,
    [orgId]
  );
  const byP = new Map<string, BoundsRow>();
  for (const row of result.rows as BoundsRow[]) {
    byP.set(row.priority, row);
  }
  const data = PRIORITIES.map((p) => {
    const row = byP.get(p);
    const fb = DEFAULT_TIER1_BOUNDS_FALLBACK[p];
    return {
      priority: p,
      min_first_response_mins: row ? Number(row.min_first_response_mins) : fb.minFirstResponseMins,
      max_first_response_mins: row ? Number(row.max_first_response_mins) : fb.maxFirstResponseMins,
      min_resolution_mins: row ? Number(row.min_resolution_mins) : fb.minResolutionMins,
      max_resolution_mins: row ? Number(row.max_resolution_mins) : fb.maxResolutionMins,
      _isDefault: !row,
    };
  });
  return res.json({ ok: true, data });
}

export async function putSlaTier1Bounds(req: Request, res: Response) {
  if (!isEziiSystemAdmin(req)) {
    return res.status(403).json({ ok: false, error: "Only Ezii System Admin can update SLA Tier 1 bounds." });
  }
  const orgId = asInt(req.params.id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid organisation id" });

  // External org IDs often exist only in the partner API until provisioned here; FK requires `organisations` row.
  const { ensureTenantAndDefaultsByOrgId } = await import("../../services/provisioning/ensureTenantAndDefaults.js");
  await ensureTenantAndDefaultsByOrgId(orgId);

  const bounds = req.body?.bounds;
  if (!Array.isArray(bounds)) {
    return res.status(400).json({ ok: false, error: "bounds must be an array" });
  }

  for (const raw of bounds) {
    const p = normPriority(raw?.priority);
    const minFr = Number(raw?.min_first_response_mins);
    const maxFr = Number(raw?.max_first_response_mins);
    const minRes = Number(raw?.min_resolution_mins);
    const maxRes = Number(raw?.max_resolution_mins);
    if (![minFr, maxFr, minRes, maxRes].every((n) => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({ ok: false, error: `Invalid bound numbers for ${p}` });
    }
    if (minFr > maxFr) {
      return res.status(400).json({ ok: false, error: `${p}: min first response must be <= max` });
    }
    if (minRes > maxRes) {
      return res.status(400).json({ ok: false, error: `${p}: min resolution must be <= max` });
    }

    await pool.query(
      `insert into sla_tier1_bounds (
         organisation_id, priority, min_first_response_mins, max_first_response_mins, min_resolution_mins, max_resolution_mins
       ) values ($1::bigint, $2, $3, $4, $5, $6)
       on conflict (organisation_id, priority) do update set
         min_first_response_mins = excluded.min_first_response_mins,
         max_first_response_mins = excluded.max_first_response_mins,
         min_resolution_mins = excluded.min_resolution_mins,
         max_resolution_mins = excluded.max_resolution_mins,
         updated_at = now()`,
      [orgId, p, minFr, maxFr, minRes, maxRes]
    );
  }

  await appendAdminAudit(req, orgId, "SLA Policies", "update", `Updated Tier 1 SLA bounds for org ${orgId}`);
  return res.json({ ok: true, data: { organisation_id: orgId } });
}
