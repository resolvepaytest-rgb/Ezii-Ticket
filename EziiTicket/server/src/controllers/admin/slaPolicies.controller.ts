import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";
import { appendAdminAudit } from "./adminAudit.js";
import { resolveTier1Bound, type PriorityKey } from "./slaTier1Bounds.js";

function normTier(t: unknown): string {
  return String(t ?? "tier1").toLowerCase() === "tier2" ? "tier2" : "tier1";
}

function isEziiOrg(organisationId: number): boolean {
  return organisationId === 1;
}
const GLOBAL_SLA_ORG_ID = 1;

/** Internal Ezii (Tier 2): Tier 1 targets must not be faster than L2 acknowledgement / L3 resolution floor. */
const TIER2_BASELINE_BY_PRIORITY: Record<PriorityKey, { firstResponseMins: number; resolutionMins: number }> = {
  P1: { firstResponseMins: 15, resolutionMins: 240 },
  P2: { firstResponseMins: 60, resolutionMins: 480 },
  P3: { firstResponseMins: 240, resolutionMins: 1440 },
  P4: { firstResponseMins: 480, resolutionMins: 3360 },
};

function normPriority(p: unknown): PriorityKey {
  const v = String(p ?? "P3").toUpperCase();
  if (v === "P1" || v === "P2" || v === "P3" || v === "P4") return v;
  return "P3";
}

async function validateTier1Bounds(
  organisationId: number,
  priority: PriorityKey,
  firstResponseMins: number,
  resolutionMins: number
): Promise<string | null> {
  const b = await resolveTier1Bound(organisationId, priority);
  const t2 = TIER2_BASELINE_BY_PRIORITY[priority];
  const effectiveMinFirstResponse = Math.max(b.minFirstResponseMins, t2.firstResponseMins);
  const effectiveMinResolution = Math.max(b.minResolutionMins, t2.resolutionMins);

  if (firstResponseMins < effectiveMinFirstResponse || firstResponseMins > b.maxFirstResponseMins) {
    return `Tier 1 first_response_mins for ${priority} must be between ${effectiveMinFirstResponse} and ${b.maxFirstResponseMins}.`;
  }
  if (resolutionMins < effectiveMinResolution || resolutionMins > b.maxResolutionMins) {
    return `Tier 1 resolution_mins for ${priority} must be between ${effectiveMinResolution} and ${b.maxResolutionMins}.`;
  }
  return null;
}

export async function listSlaPolicies(req: Request, res: Response) {
  const requestedOrgId = req.query.organisation_id ? asInt(req.query.organisation_id) : null;
  const includeTier2 = isEziiSystemAdmin(req);
  const result = await pool.query(
    `select id, organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json, created_at, updated_at
     from sla_policies
     where ($1::bigint is null or organisation_id = $1::bigint)
       and ($2::boolean = true or lower(tier) <> 'tier2')
     order by organisation_id asc, tier asc, priority asc, id asc`,
    [requestedOrgId, includeTier2]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function createSlaPolicy(req: Request, res: Response) {
  const {
    organisation_id,
    name,
    tier,
    priority,
    first_response_mins,
    resolution_mins,
    warning_percent,
    is_active,
    metadata_json,
  } = req.body ?? {};

  if (!isEziiSystemAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: "Only Ezii System Admin can create SLA policies.",
    });
  }
  const orgIdRaw = asInt(organisation_id);
  const orgId = orgIdRaw ?? GLOBAL_SLA_ORG_ID;
  if (!name || typeof name !== "string") return res.status(400).json({ ok: false, error: "name is required" });
  if (typeof first_response_mins !== "number" || !Number.isFinite(first_response_mins)) {
    return res.status(400).json({ ok: false, error: "first_response_mins is required" });
  }
  if (typeof resolution_mins !== "number" || !Number.isFinite(resolution_mins)) {
    return res.status(400).json({ ok: false, error: "resolution_mins is required" });
  }

  const requestedTier = normTier(tier);
  const requestedPriority = normPriority(priority);
  if (requestedTier === "tier2" && !isEziiOrg(orgId)) {
    return res.status(400).json({
      ok: false,
      error: "Tier 2 SLA policies are global-only (organisation_id=1).",
    });
  }
  if (requestedTier === "tier1") {
    const rangeError = await validateTier1Bounds(orgId, requestedPriority, first_response_mins, resolution_mins);
    if (rangeError) {
      return res.status(400).json({
        ok: false,
        error: `${rangeError} Tier 1 cannot be more aggressive than Tier 2 for the same priority.`,
      });
    }
  }
  const meta =
    metadata_json === null || metadata_json === undefined
      ? null
      : typeof metadata_json === "string"
        ? metadata_json
        : JSON.stringify(metadata_json);

  const result = await pool.query(
    `insert into sla_policies (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
     values ($1,$2,coalesce($3,'tier1'),coalesce($4,'P3'),$5,$6,coalesce($7,75),coalesce($8,true),$9)
     returning id, organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json, created_at, updated_at`,
    [
      orgId,
      name,
      tier ?? null,
      requestedPriority,
      first_response_mins,
      resolution_mins,
      typeof warning_percent === "number" ? warning_percent : null,
      typeof is_active === "boolean" ? is_active : null,
      meta,
    ]
  );
  const row = result.rows[0];
  await appendAdminAudit(req, orgId, "SLA Policies", "create", `Created SLA "${row.name}" (${row.tier})`);
  return res.status(201).json({ ok: true, data: row });
}

export async function updateSlaPolicy(req: Request, res: Response) {
  if (!isEziiSystemAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: "Only Ezii System Admin can update SLA policies.",
    });
  }
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const existing = await pool.query(
    "select tier, priority, first_response_mins, resolution_mins, organisation_id, metadata_json from sla_policies where id=$1",
    [id]
  );
  const existingTier = existing.rows[0]?.tier;
  const existingPriority = existing.rows[0]?.priority;
  const existingFirstResponse = existing.rows[0]?.first_response_mins;
  const existingResolution = existing.rows[0]?.resolution_mins;
  const existingOrgId = existing.rows[0]?.organisation_id ? Number(existing.rows[0].organisation_id) : null;
  if (!existing.rows[0]) return res.status(404).json({ ok: false, error: "not found" });

  const {
    name,
    tier,
    priority,
    first_response_mins,
    resolution_mins,
    warning_percent,
    is_active,
    metadata_json,
  } = req.body ?? {};

  const requestedTier = tier != null ? normTier(tier) : null;
  const effectiveTier = requestedTier ?? normTier(existingTier);
  const effectivePriority = priority != null ? normPriority(priority) : normPriority(existingPriority);
  const effectiveFirstResponse =
    typeof first_response_mins === "number" ? first_response_mins : Number(existingFirstResponse);
  const effectiveResolution =
    typeof resolution_mins === "number" ? resolution_mins : Number(existingResolution);

  if (effectiveTier === "tier2" && existingOrgId != null && isEziiOrg(existingOrgId)) {
    const frChanged =
      typeof first_response_mins === "number" && first_response_mins !== Number(existingFirstResponse);
    const resChanged =
      typeof resolution_mins === "number" && resolution_mins !== Number(existingResolution);
    const timingChange = frChanged || resChanged;
    const existingMetaStr =
      existing.rows[0]?.metadata_json == null ? null : String(existing.rows[0].metadata_json);
    let metaChange = false;
    if (metadata_json !== undefined) {
      const nextMetaStr =
        metadata_json === null ? null : typeof metadata_json === "string" ? metadata_json : JSON.stringify(metadata_json);
      metaChange = nextMetaStr !== existingMetaStr;
    }
    const tierChange = tier != null;
    const priChange = priority != null;
    if (timingChange || metaChange || tierChange || priChange) {
      return res.status(403).json({
        ok: false,
        error: "Tier 2 internal SLA targets are fixed by Ezii and cannot be edited.",
      });
    }
  }

  if (effectiveTier === "tier1") {
    const orgForBounds = existingOrgId ?? GLOBAL_SLA_ORG_ID;
    const rangeError = await validateTier1Bounds(orgForBounds, effectivePriority, effectiveFirstResponse, effectiveResolution);
    if (rangeError) {
      return res.status(400).json({
        ok: false,
        error: `${rangeError} Tier 1 cannot be more aggressive than Tier 2 for the same priority.`,
      });
    }
  }

  if (effectiveTier === "tier2" && existingOrgId != null && !isEziiOrg(existingOrgId)) {
    return res.status(403).json({
      ok: false,
      error: "Tier 2 SLA policies are global-only (org_id=1).",
    });
  }

  const metaUpdate =
    metadata_json === undefined
      ? null
      : metadata_json === null
        ? null
        : typeof metadata_json === "string"
          ? metadata_json
          : JSON.stringify(metadata_json);

  const result = await pool.query(
    `update sla_policies
     set name = coalesce($2, name),
         tier = coalesce($3, tier),
         priority = coalesce($4, priority),
         first_response_mins = coalesce($5, first_response_mins),
         resolution_mins = coalesce($6, resolution_mins),
         warning_percent = coalesce($7, warning_percent),
         is_active = coalesce($8, is_active),
         metadata_json = coalesce($9, metadata_json),
         updated_at = now()
     where id=$1
     returning id, organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json, created_at, updated_at`,
    [
      id,
      name ?? null,
      tier ?? null,
      priority ?? null,
      typeof first_response_mins === "number" ? first_response_mins : null,
      typeof resolution_mins === "number" ? resolution_mins : null,
      typeof warning_percent === "number" ? warning_percent : null,
      typeof is_active === "boolean" ? is_active : null,
      metaUpdate,
    ]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "SLA Policies",
    "update",
    `Updated SLA "${row.name}" (${row.tier})`
  );
  return res.json({ ok: true, data: row });
}

export async function deleteSlaPolicy(req: Request, res: Response) {
  if (!isEziiSystemAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: "Only Ezii System Admin can delete SLA policies.",
    });
  }
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const existing = await pool.query("select tier, organisation_id, name from sla_policies where id=$1", [id]);
  if (!existing.rows[0]) return res.status(404).json({ ok: false, error: "not found" });
  const existingOrgId = existing.rows[0].organisation_id ? Number(existing.rows[0].organisation_id) : null;
  const existingTierNorm = normTier(existing.rows[0].tier);
  if (existingTierNorm === "tier2" && existingOrgId != null && !isEziiOrg(existingOrgId)) {
    return res.status(403).json({
      ok: false,
      error: "Tier 2 SLA policies are global-only (org_id=1).",
    });
  }

  const result = await pool.query("delete from sla_policies where id=$1 returning id", [id]);
  if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(
    req,
    Number(existing.rows[0].organisation_id),
    "SLA Policies",
    "delete",
    `Deleted SLA "${existing.rows[0].name}" (${existing.rows[0].tier})`
  );
  return res.json({ ok: true, data: { id } });
}
