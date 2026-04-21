import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { EXTERNAL_ORG_PATHS, getExternalOrgApiBaseUrl } from "../../config/externalOrgApi.js";
import { ensureTenantAndDefaultsByOrgId } from "../../services/provisioning/ensureTenantAndDefaults.js";
import { persistOrganisationIsNgo } from "../../services/organisationNgo.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";
import { asInt } from "./adminUtils.js";

type ExternalFlags = {
  ispayroll: boolean;
  isattendance: boolean;
  isleave: boolean;
  isexpense: boolean;
  is_ngo: boolean | null;
};

const PRODUCT_CODE_BY_KEY: { key: keyof Pick<ExternalFlags, "ispayroll" | "isattendance" | "isleave" | "isexpense">; code: string }[] = [
  { key: "ispayroll", code: "PAY" },
  { key: "isattendance", code: "ATT" },
  { key: "isleave", code: "LEA" },
  { key: "isexpense", code: "EXP" },
];

function asBool(v: unknown): boolean {
  return v === true;
}

function asBoolOrNull(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function coerceNgoForDb(v: boolean | null): boolean {
  return v === true;
}

function readBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function normalizeFlagsFromRecord(row: Record<string, unknown>): ExternalFlags {
  const g = (snake: string, camel: string) => row[snake] ?? row[camel];
  return {
    ispayroll: asBool(g("ispayroll", "isPayroll")),
    isattendance: asBool(g("isattendance", "isAttendance")),
    isleave: asBool(g("isleave", "isLeave")),
    isexpense: asBool(g("isexpense", "isExpense")),
    is_ngo: asBoolOrNull(row.is_ngo ?? row.isNgo),
  };
}

async function loadProductIdByCode(): Promise<Map<string, number>> {
  const r = await pool.query<{ id: string; code: string }>(
    `select id, upper(trim(code)) as code from products`
  );
  const m = new Map<string, number>();
  for (const row of r.rows) m.set(row.code, Number(row.id));
  return m;
}

async function applyProductFlagsToOrganisation(
  orgId: number,
  flags: ExternalFlags
): Promise<{ product_rows_touched: number; ngo_touched: boolean }> {
  await ensureTenantAndDefaultsByOrgId(orgId);
  const byCode = await loadProductIdByCode();
  let product_rows_touched = 0;

  for (const { key, code } of PRODUCT_CODE_BY_KEY) {
    const productId = byCode.get(code);
    if (!productId) continue;
    const enabled = flags[key];
    const u = await pool.query(
      `update organisation_products
       set enabled = $3, updated_at = now()
       where organisation_id = $1::bigint and product_id = $2::bigint and enabled is distinct from $3`,
      [orgId, productId, enabled]
    );
    product_rows_touched += u.rowCount ?? 0;
  }

  const ngoDb = coerceNgoForDb(flags.is_ngo);
  const ngo_touched = await persistOrganisationIsNgo(orgId, ngoDb);

  return { product_rows_touched, ngo_touched };
}

async function sessionOrgIsNgo(req: Request): Promise<boolean> {
  const jwtOrg = req.user?.org_id ? asInt(String(req.user.org_id)) : null;
  if (!jwtOrg) return false;
  const r = await pool.query<{ is_ngo: boolean }>(
    `select coalesce(is_ngo, false) as is_ngo from organisations where id = $1::bigint`,
    [jwtOrg]
  );
  return r.rows[0]?.is_ngo === true;
}

function parseReportsPayload(json: unknown): Array<Record<string, unknown>> {
  if (!json || typeof json !== "object") return [];
  const o = json as { data?: unknown };
  if (!Array.isArray(o.data)) return [];
  return o.data.filter((x): x is Record<string, unknown> => x != null && typeof x === "object");
}

function parseSingleOrgPayload(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const inner = o["data"];
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return o;
}

/**
 * One entrypoint (POST /auth/sync-client-products):
 * - System admin: GET `/reports/get-client-products` (no token) → update every org in the payload.
 * - Otherwise: GET `/organization/get-client-products` with Bearer → update JWT org only.
 */
export async function syncClientProducts(req: Request, res: Response) {
  let base: string;
  try {
    base = getExternalOrgApiBaseUrl();
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : "EXTERNAL_API_URL is not configured",
    });
  }

  try {
    if (isEziiSystemAdmin(req)) {
      const extRes = await fetch(`${base}${EXTERNAL_ORG_PATHS.reportsClientProducts}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const body = await extRes.json().catch(() => null);
      if (!extRes.ok) {
        return res.status(502).json({
          ok: false,
          error:
            body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
              ? (body as { message: string }).message
              : `External reports API failed (${extRes.status})`,
        });
      }

      const rows = parseReportsPayload(body);
      let organisations_processed = 0;
      let product_updates = 0;
      let ngo_updates = 0;

      for (const row of rows) {
        const rawId = row.orgid ?? row.orgId;
        const orgId = typeof rawId === "number" ? rawId : asInt(String(rawId ?? ""));
        if (!orgId) continue;
        const flags = normalizeFlagsFromRecord(row);
        const { product_rows_touched, ngo_touched } = await applyProductFlagsToOrganisation(orgId, flags);
        organisations_processed += 1;
        product_updates += product_rows_touched;
        if (ngo_touched) ngo_updates += 1;
      }

      const is_ngo = await sessionOrgIsNgo(req);
      return res.json({
        ok: true,
        data: {
          mode: "reports_all_orgs" as const,
          organisations_processed,
          product_updates,
          ngo_updates,
          is_ngo,
        },
      });
    }

    const bearer = readBearer(req);
    if (!bearer) {
      return res.status(401).json({ ok: false, error: "Missing Bearer token" });
    }

    const extRes = await fetch(`${base}${EXTERNAL_ORG_PATHS.organizationClientProducts}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${bearer}` },
    });
    const body = await extRes.json().catch(() => null);
    if (!extRes.ok) {
      return res.status(502).json({
        ok: false,
        error:
          body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
            ? (body as { message: string }).message
            : `External organization client-products API failed (${extRes.status})`,
      });
    }

    const row = parseSingleOrgPayload(body);
    if (!row) {
      return res.status(502).json({ ok: false, error: "Unexpected external client-products payload" });
    }

    const rawOrg = row.orgId ?? row.orgid;
    const extOrgId = typeof rawOrg === "number" ? rawOrg : asInt(String(rawOrg ?? ""));
    if (!extOrgId) {
      return res.status(502).json({ ok: false, error: "External response missing org id" });
    }

    const jwtOrg = req.user?.org_id ? asInt(String(req.user.org_id)) : null;
    if (!jwtOrg || jwtOrg !== extOrgId) {
      return res.status(403).json({ ok: false, error: "External org id does not match signed-in organisation" });
    }

    const flags = normalizeFlagsFromRecord(row);
    const { product_rows_touched, ngo_touched } = await applyProductFlagsToOrganisation(extOrgId, flags);
    const is_ngo = await sessionOrgIsNgo(req);

    return res.json({
      ok: true,
      data: {
        mode: "organization_current_org" as const,
        organisation_id: extOrgId,
        product_updates: product_rows_touched,
        ngo_updated: ngo_touched,
        is_ngo,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : "sync failed",
    });
  }
}
