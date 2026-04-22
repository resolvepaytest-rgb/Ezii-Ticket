import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";
import { resolveTier1Bound, type PriorityKey } from "./slaTier1Bounds.js";

function normTier(t: unknown): string {
  return String(t ?? "tier1").toLowerCase() === "tier2" ? "tier2" : "tier1";
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

function safeParseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return (value as Record<string, unknown>) ?? {};
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function numberFromMeta(meta: Record<string, unknown>, key: string, fallback: number): number {
  const v = meta[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

async function resolveTier2GlobalBounds(priority: PriorityKey) {
  const r = await pool.query(
    `select first_response_mins, resolution_mins, metadata_json
     from sla_policies
     where organisation_id = $1::bigint and tier = 'tier2' and priority = $2
     order by id desc
     limit 1`,
    [GLOBAL_SLA_ORG_ID, priority]
  );
  const row = r.rows[0];
  const base = TIER2_BASELINE_BY_PRIORITY[priority];
  const meta = safeParseJsonObject(row?.metadata_json);
  const l2AckBase = row ? Number(row.first_response_mins) : base.firstResponseMins;
  const l3ResBase = row ? Number(row.resolution_mins) : base.resolutionMins;
  const l2PassBase = numberFromMeta(meta, "l2_resolution_pass_mins", l3ResBase);
  const l3AckBase = numberFromMeta(meta, "l3_acknowledgement_mins", l2AckBase);
  return {
    minL2Ack: numberFromMeta(meta, "min_l2_ack_mins", l2AckBase),
    maxL2Ack: numberFromMeta(meta, "max_l2_ack_mins", l2AckBase),
    minL2Pass: numberFromMeta(meta, "min_l2_pass_mins", l2PassBase),
    maxL2Pass: numberFromMeta(meta, "max_l2_pass_mins", l2PassBase),
    minL3Ack: numberFromMeta(meta, "min_l3_ack_mins", l3AckBase),
    maxL3Ack: numberFromMeta(meta, "max_l3_ack_mins", l3AckBase),
    minL3Res: numberFromMeta(meta, "min_l3_res_mins", l3ResBase),
    maxL3Res: numberFromMeta(meta, "max_l3_res_mins", l3ResBase),
  };
}

async function validateTier2Bounds(
  priority: PriorityKey,
  firstResponseMins: number,
  resolutionMins: number,
  metadata: Record<string, unknown>
): Promise<string | null> {
  const b = await resolveTier2GlobalBounds(priority);
  const l2Ack = firstResponseMins;
  const l2Pass = numberFromMeta(metadata, "l2_resolution_pass_mins", TIER2_BASELINE_BY_PRIORITY[priority].resolutionMins);
  const l3Ack = numberFromMeta(metadata, "l3_acknowledgement_mins", TIER2_BASELINE_BY_PRIORITY[priority].firstResponseMins);
  const l3Res = resolutionMins;
  if (l2Ack < b.minL2Ack || l2Ack > b.maxL2Ack) return `Tier 2 l2_acknowledgement_mins for ${priority} must be between ${b.minL2Ack} and ${b.maxL2Ack}.`;
  if (l2Pass < b.minL2Pass || l2Pass > b.maxL2Pass) return `Tier 2 l2_resolution_pass_mins for ${priority} must be between ${b.minL2Pass} and ${b.maxL2Pass}.`;
  if (l3Ack < b.minL3Ack || l3Ack > b.maxL3Ack) return `Tier 2 l3_acknowledgement_mins for ${priority} must be between ${b.minL3Ack} and ${b.maxL3Ack}.`;
  if (l3Res < b.minL3Res || l3Res > b.maxL3Res) return `Tier 2 l3_resolution_mins for ${priority} must be between ${b.minL3Res} and ${b.maxL3Res}.`;
  return null;
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
  const result = await pool.query(
    `select id, organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json, created_at, updated_at
     from sla_policies
     where ($1::bigint is null or organisation_id = $1::bigint)
     order by organisation_id asc, tier asc, priority asc, id asc`,
    [requestedOrgId]
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
  const { ensureTenantAndDefaultsByOrgId } = await import("../../services/provisioning/ensureTenantAndDefaults.js");
  await ensureTenantAndDefaultsByOrgId(orgId);
  if (requestedTier === "tier1") {
    const rangeError = await validateTier1Bounds(orgId, requestedPriority, first_response_mins, resolution_mins);
    if (rangeError) {
      return res.status(400).json({
        ok: false,
        error: `${rangeError} Tier 1 cannot be more aggressive than Tier 2 for the same priority.`,
      });
    }
  }
  if (requestedTier === "tier2") {
    const t2Error = await validateTier2Bounds(
      requestedPriority,
      first_response_mins,
      resolution_mins,
      safeParseJsonObject(metadata_json)
    );
    if (t2Error) return res.status(400).json({ ok: false, error: t2Error });
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

export async function upsertSlaPoliciesBatch(req: Request, res: Response) {
  const organisationId = asInt(req.body?.organisation_id);
  const items = Array.isArray(req.body?.policies) ? (req.body.policies as unknown[]) : null;
  if (!organisationId) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  if (!items) return res.status(400).json({ ok: false, error: "policies must be an array" });

  const { ensureTenantAndDefaultsByOrgId } = await import("../../services/provisioning/ensureTenantAndDefaults.js");
  await ensureTenantAndDefaultsByOrgId(organisationId);

  const existing = await pool.query(
    "select id, tier, priority, first_response_mins, resolution_mins from sla_policies where organisation_id = $1::bigint order by id desc",
    [organisationId]
  );
  const byKey = new Map<string, number>();
  const duplicateIdsByKey = new Map<string, number[]>();
  const existingTier2ByPriority = new Map<PriorityKey, { first_response_mins: number; resolution_mins: number }>();
  for (const row of existing.rows) {
    const tier = normTier(row.tier);
    const priority = normPriority(row.priority);
    const key = `${tier}:${priority}`;
    const id = Number(row.id);
    if (!byKey.has(key)) {
      byKey.set(key, id);
      if (tier === "tier2") {
        existingTier2ByPriority.set(priority, {
          first_response_mins: Number(row.first_response_mins),
          resolution_mins: Number(row.resolution_mins),
        });
      }
      continue;
    }
    const dup = duplicateIdsByKey.get(key) ?? [];
    dup.push(id);
    duplicateIdsByKey.set(key, dup);
  }

  const requestedTier2ByPriority = new Map<PriorityKey, { first_response_mins: number; resolution_mins: number }>();
  for (const raw of items) {
    const data = (raw ?? {}) as Record<string, unknown>;
    if (normTier(data.tier) !== "tier2") continue;
    const priority = normPriority(data.priority);
    const firstResponseMins = Number(data.first_response_mins);
    const resolutionMins = Number(data.resolution_mins);
    if (Number.isFinite(firstResponseMins) && Number.isFinite(resolutionMins)) {
      requestedTier2ByPriority.set(priority, {
        first_response_mins: firstResponseMins,
        resolution_mins: resolutionMins,
      });
    }
  }

  let created = 0;
  let updated = 0;
  for (const raw of items) {
    const data = (raw ?? {}) as Record<string, unknown>;
    const tier = normTier(data.tier);
    const priority = normPriority(data.priority);
    const firstResponseMins = Number(data.first_response_mins);
    const resolutionMins = Number(data.resolution_mins);
    if (!Number.isFinite(firstResponseMins) || !Number.isFinite(resolutionMins)) {
      return res.status(400).json({ ok: false, error: `${tier}/${priority}: invalid minutes` });
    }
    if (tier === "tier1") {
      const rangeError = await validateTier1Bounds(organisationId, priority, firstResponseMins, resolutionMins);
      if (rangeError) {
        return res.status(400).json({
          ok: false,
          error: `${rangeError} Tier 1 cannot be more aggressive than Tier 2 for the same priority.`,
        });
      }
      const tier2ForPriority =
        requestedTier2ByPriority.get(priority) ??
        existingTier2ByPriority.get(priority) ?? {
          first_response_mins: TIER2_BASELINE_BY_PRIORITY[priority].firstResponseMins,
          resolution_mins: TIER2_BASELINE_BY_PRIORITY[priority].resolutionMins,
        };
      if (firstResponseMins < tier2ForPriority.first_response_mins || resolutionMins < tier2ForPriority.resolution_mins) {
        return res.status(400).json({
          ok: false,
          error:
            `Tier 1 for ${priority} cannot be more aggressive than Tier 2. ` +
            `Tier 1 requires first_response_mins >= ${tier2ForPriority.first_response_mins} and resolution_mins >= ${tier2ForPriority.resolution_mins}.`,
        });
      }
    }
    if (tier === "tier2") {
      const t2Error = await validateTier2Bounds(priority, firstResponseMins, resolutionMins, safeParseJsonObject(data.metadata_json));
      if (t2Error) return res.status(400).json({ ok: false, error: t2Error });
    }
    const warningPercent = typeof data.warning_percent === "number" ? data.warning_percent : 75;
    const isActive = typeof data.is_active === "boolean" ? data.is_active : true;
    const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : `Org ${organisationId} ${priority} ${tier === "tier1" ? "Tier1" : "Tier2"}`;
    const metadata_json =
      data.metadata_json === undefined || data.metadata_json === null
        ? null
        : typeof data.metadata_json === "string"
          ? data.metadata_json
          : JSON.stringify(data.metadata_json);

    const key = `${tier}:${priority}`;
    const existingId = byKey.get(key);
    if (existingId) {
      await pool.query(
        `update sla_policies
         set name=$2, first_response_mins=$3, resolution_mins=$4, warning_percent=$5, is_active=$6, metadata_json=$7, updated_at=now()
         where id=$1`,
        [existingId, name, firstResponseMins, resolutionMins, warningPercent, isActive, metadata_json]
      );
      updated += 1;
      const duplicateIds = duplicateIdsByKey.get(key) ?? [];
      if (duplicateIds.length) {
        await pool.query("delete from sla_policies where id = any($1::bigint[])", [duplicateIds]);
      }
    } else {
      const ins = await pool.query(
        `insert into sla_policies
          (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning id`,
        [organisationId, name, tier, priority, firstResponseMins, resolutionMins, warningPercent, isActive, metadata_json]
      );
      byKey.set(key, Number(ins.rows[0].id));
      created += 1;
    }
  }

  await appendAdminAudit(
    req,
    organisationId,
    "SLA Policies",
    "update",
    `Batch upserted SLA policies for org ${organisationId} (created ${created}, updated ${updated})`
  );
  return res.json({ ok: true, data: { organisation_id: organisationId, created, updated } });
}

export async function updateSlaPolicy(req: Request, res: Response) {
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
  if (effectiveTier === "tier2") {
    const currentMeta = safeParseJsonObject(existing.rows[0]?.metadata_json);
    const incomingMeta = metadata_json === undefined ? currentMeta : safeParseJsonObject(metadata_json);
    const t2Error = await validateTier2Bounds(effectivePriority, effectiveFirstResponse, effectiveResolution, incomingMeta);
    if (t2Error) return res.status(400).json({ ok: false, error: t2Error });
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
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const existing = await pool.query("select tier, organisation_id, name from sla_policies where id=$1", [id]);
  if (!existing.rows[0]) return res.status(404).json({ ok: false, error: "not found" });
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
