import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";

function safeJsonParse(value: unknown): any {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeIdArray(raw: any): number[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && Number.isInteger(n));
  }
  if (typeof raw === "number" && Number.isFinite(raw) && Number.isInteger(raw)) return [raw];
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) && Number.isInteger(n) ? [n] : [];
  }
  return [];
}

type SelectionIds = {
  productIds: number[];
  categoryIds: number[];
  subCategoryIds: number[];
};

function extractSelectionIdsFromConditions(conditionsObj: any): SelectionIds {
  const productIds = normalizeIdArray(conditionsObj?.product_ids ?? conditionsObj?.product_id);
  const categoryIds = normalizeIdArray(conditionsObj?.category_ids ?? conditionsObj?.category_id);
  const subCategoryIds = normalizeIdArray(conditionsObj?.sub_category_ids ?? conditionsObj?.sub_category_id);
  return { productIds, categoryIds, subCategoryIds };
}

/** When sub_category_ids are set but category_ids were omitted (legacy clients), derive category ids from DB. */
async function hydrateRoutingConditionsCategoryIdsFromSubs(
  organisationId: number,
  conditionsJson: string | null | undefined
): Promise<string | null> {
  if (!conditionsJson || typeof conditionsJson !== "string") return conditionsJson ?? null;
  const cond = safeJsonParse(conditionsJson);
  if (!cond || typeof cond !== "object") return conditionsJson;

  const ms = cond["match_scope"];
  if (typeof ms === "object" && ms !== null && ms["categories"] === "all") {
    return conditionsJson;
  }

  let catIds = normalizeIdArray(cond["category_ids"] ?? cond["category_id"]);
  const subIds = normalizeIdArray(cond["sub_category_ids"] ?? cond["sub_category_id"]);
  if (catIds.length > 0 || subIds.length === 0) return conditionsJson;

  const r = await pool.query(
    `
    select distinct ps.category_id
    from product_subcategories ps
    join product_categories pc on pc.id = ps.category_id
    where pc.organisation_id = $1::bigint
      and ps.id = any($2::bigint[])
    `,
    [organisationId, subIds]
  );
  const derived = r.rows.map((row) => Number(row.category_id)).filter((n) => Number.isFinite(n));
  if (derived.length === 0) return conditionsJson;

  cond["category_ids"] = derived;
  if (cond["category_id"] == null && derived.length > 0) cond["category_id"] = derived[0];

  const nameRes = await pool.query(
    `select id, name from product_categories where organisation_id = $1::bigint and id = any($2::bigint[])`,
    [organisationId, derived]
  );
  const nameById = new Map<number, string>();
  for (const row of nameRes.rows) {
    nameById.set(Number(row.id), String(row.name ?? ""));
  }
  cond["categories"] = derived.map((id) => nameById.get(id) ?? `Category ${id}`);

  return JSON.stringify(cond);
}

function generateGlobalDefaultKey() {
  return randomBytes(16).toString("hex");
}

async function getOrganisationIds() {
  const r = await pool.query(`select id from organisations order by id asc`);
  return r.rows.map((row) => Number(row.id)).filter((n) => Number.isFinite(n));
}

async function recomputeGlobalDefaultsForOrg(orgId: number, globalDefaultKey?: string) {
  // 1) Collect union of overlaps from ALL custom rules in this org.
  // Custom rules = anything that is not a global default.
  const overlapQ = globalDefaultKey
    ? `
      select conditions_json
      from routing_rules
      where organisation_id = $1::bigint
        and is_active = true
        and coalesce((actions_json::jsonb ->> 'is_global_default')::boolean, false) = false
    `
    : `
      select conditions_json
      from routing_rules
      where organisation_id = $1::bigint
        and is_active = true
        and coalesce((actions_json::jsonb ->> 'is_global_default')::boolean, false) = false
    `;

  const overlapsRes = await pool.query(overlapQ, [orgId]);
  const overlapProductIds = new Set<number>();
  const overlapCategoryIds = new Set<number>();
  const overlapSubCategoryIds = new Set<number>();

  for (const row of overlapsRes.rows) {
    const cond = safeJsonParse(row.conditions_json);
    if (!cond) continue;
    const sel = extractSelectionIdsFromConditions(cond);
    for (const id of sel.productIds) overlapProductIds.add(id);
    for (const id of sel.categoryIds) overlapCategoryIds.add(id);
    for (const id of sel.subCategoryIds) overlapSubCategoryIds.add(id);
  }

  // 2) Load all global defaults for this org (optionally scoped by global_default_key).
  const globalDefaultsQuery = globalDefaultKey
    ? `
      select id, organisation_id, name, is_active, conditions_json, actions_json
      from routing_rules
      where organisation_id = $1::bigint
        and coalesce((actions_json::jsonb ->> 'is_global_default')::boolean, false) = true
        and (actions_json::jsonb ->> 'global_default_key') = $2::text
    `
    : `
      select id, organisation_id, name, is_active, conditions_json, actions_json
      from routing_rules
      where organisation_id = $1::bigint
        and coalesce((actions_json::jsonb ->> 'is_global_default')::boolean, false) = true
    `;

  const globalsRes = await pool.query(globalDefaultsQuery, globalDefaultKey ? [orgId, globalDefaultKey] : [orgId]);
  if (globalsRes.rows.length === 0) return;

  // 3) Compute effective arrays for each global default rule.
  type EffectiveRule = {
    ruleId: number;
    baseIsActive: boolean;
    baseProductIds: number[];
    baseCategoryIds: number[];
    baseSubCategoryIds: number[];
    effectiveProductIds: number[];
    effectiveCategoryIds: number[];
    effectiveSubCategoryIds: number[];
    existingConditionsObj: any;
  };

  const subMetaBySubId = new Map<number, { categoryId: number; productId: number }>();
  const categoryMetaByCategoryId = new Map<number, { productId: number }>();
  const allBaseSubIds = new Set<number>();
  const allBaseCategoryIds = new Set<number>();

  const effectiveRules: EffectiveRule[] = [];

  for (const row of globalsRes.rows) {
    const actions = safeJsonParse(row.actions_json) ?? {};
    const baseIsActiveRaw = actions["global_default_base_is_active"];
    const baseIsActive =
      baseIsActiveRaw === true || baseIsActiveRaw === "true" || baseIsActiveRaw === 1 || baseIsActiveRaw === "1"
        ? true
        : typeof baseIsActiveRaw === "boolean"
          ? baseIsActiveRaw
          : Boolean(row.is_active);

    const existingConditionsObj = safeJsonParse(row.conditions_json) ?? {};
    const fallbackSel = extractSelectionIdsFromConditions(existingConditionsObj);

    const baseProductIdsRaw = normalizeIdArray(actions["global_default_base_product_ids"]);
    const baseCategoryIdsRaw = normalizeIdArray(actions["global_default_base_category_ids"]);
    const baseSubCategoryIdsRaw = normalizeIdArray(actions["global_default_base_sub_category_ids"]);

    const baseProductIds = baseProductIdsRaw.length > 0 ? baseProductIdsRaw : fallbackSel.productIds;
    const baseCategoryIds = baseCategoryIdsRaw.length > 0 ? baseCategoryIdsRaw : fallbackSel.categoryIds;
    const baseSubCategoryIds = baseSubCategoryIdsRaw.length > 0 ? baseSubCategoryIdsRaw : fallbackSel.subCategoryIds;

    for (const sid of baseSubCategoryIds) allBaseSubIds.add(sid);
    for (const cid of baseCategoryIds) allBaseCategoryIds.add(cid);

    effectiveRules.push({
      ruleId: Number(row.id),
      baseIsActive,
      baseProductIds,
      baseCategoryIds,
      baseSubCategoryIds,
      effectiveProductIds: [],
      effectiveCategoryIds: [],
      effectiveSubCategoryIds: [],
      existingConditionsObj,
    });
  }

  // Cache subcategory->(category, product) metadata for all base subcategories in this org.
  const allBaseSubIdArr = Array.from(allBaseSubIds);
  if (allBaseSubIdArr.length > 0) {
    const metaRes = await pool.query(
      `
        select
          ps.id as sub_category_id,
          pc.id as category_id,
          pc.product_id as product_id
        from product_subcategories ps
        join product_categories pc on pc.id = ps.category_id
        where pc.organisation_id = $1::bigint
          and ps.id = any($2::bigint[])
      `,
      [orgId, allBaseSubIdArr]
    );
    for (const m of metaRes.rows) {
      const sid = Number(m.sub_category_id);
      subMetaBySubId.set(sid, { categoryId: Number(m.category_id), productId: Number(m.product_id) });
    }
  }

  // Cache category->product metadata for all base categories in this org.
  const allBaseCategoryIdArr = Array.from(allBaseCategoryIds);
  if (allBaseCategoryIdArr.length > 0) {
    const catMetaRes = await pool.query(
      `
        select id as category_id, product_id
        from product_categories
        where organisation_id = $1::bigint
          and id = any($2::bigint[])
      `,
      [orgId, allBaseCategoryIdArr]
    );
    for (const c of catMetaRes.rows) {
      categoryMetaByCategoryId.set(Number(c.category_id), { productId: Number(c.product_id) });
    }
  }

  // Now compute effective arrays per rule.
  for (const r of effectiveRules) {
    const effectiveProductIds = r.baseProductIds.filter((id) => !overlapProductIds.has(id));
    const effectiveCategoryIds: number[] = [];
    for (const cid of r.baseCategoryIds) {
      const meta = categoryMetaByCategoryId.get(cid);
      const shouldRemove = overlapCategoryIds.has(cid) || (meta ? overlapProductIds.has(meta.productId) : false);
      if (!shouldRemove) effectiveCategoryIds.push(cid);
    }

    const effectiveSubCategoryIds: number[] = [];
    for (const sid of r.baseSubCategoryIds) {
      const meta = subMetaBySubId.get(sid);
      const shouldRemove =
        overlapSubCategoryIds.has(sid) ||
        (meta ? overlapCategoryIds.has(meta.categoryId) : false) ||
        (meta ? overlapProductIds.has(meta.productId) : false);
      if (!shouldRemove) effectiveSubCategoryIds.push(sid);
    }

    if (effectiveCategoryIds.length === 0 && effectiveSubCategoryIds.length > 0) {
      const seenCat = new Set<number>();
      for (const sid of effectiveSubCategoryIds) {
        const meta = subMetaBySubId.get(sid);
        if (meta && !seenCat.has(meta.categoryId)) {
          seenCat.add(meta.categoryId);
          effectiveCategoryIds.push(meta.categoryId);
        }
      }
    }

    r.effectiveProductIds = effectiveProductIds;
    r.effectiveCategoryIds = effectiveCategoryIds;
    r.effectiveSubCategoryIds = effectiveSubCategoryIds;
  }

  // 4) Query names/codes for all effective ids in this org (to keep UI display correct).
  const unionEffectiveProductIds = new Set<number>();
  const unionEffectiveCategoryIds = new Set<number>();
  const unionEffectiveSubCategoryIds = new Set<number>();
  for (const r of effectiveRules) {
    for (const pid of r.effectiveProductIds) unionEffectiveProductIds.add(pid);
    for (const cid of r.effectiveCategoryIds) unionEffectiveCategoryIds.add(cid);
    for (const sid of r.effectiveSubCategoryIds) unionEffectiveSubCategoryIds.add(sid);
  }

  const [productsRes, categoriesRes, subCatsRes] = await Promise.all([
    unionEffectiveProductIds.size
      ? pool.query(`select id, name, code from products where id = any($1::bigint[])`, [Array.from(unionEffectiveProductIds)])
      : Promise.resolve({ rows: [] as any[] }),
    unionEffectiveCategoryIds.size
      ? pool.query(
          `select id, name from product_categories where organisation_id = $1::bigint and id = any($2::bigint[])`,
          [orgId, Array.from(unionEffectiveCategoryIds)]
        )
      : Promise.resolve({ rows: [] as any[] }),
    unionEffectiveSubCategoryIds.size
      ? pool.query(
          `select id, name from product_subcategories where id = any($1::bigint[])`,
          [Array.from(unionEffectiveSubCategoryIds)]
        )
      : Promise.resolve({ rows: [] as any[] }),
  ]);

  const productNameById = new Map<number, string>();
  const productCodeById = new Map<number, string>();
  for (const p of productsRes.rows) {
    productNameById.set(Number(p.id), String(p.name ?? ""));
    productCodeById.set(Number(p.id), String(p.code ?? ""));
  }

  const categoryNameById = new Map<number, string>();
  for (const c of categoriesRes.rows) {
    categoryNameById.set(Number(c.id), String(c.name ?? ""));
  }

  const subCategoryNameById = new Map<number, string>();
  for (const s of subCatsRes.rows) {
    subCategoryNameById.set(Number(s.id), String(s.name ?? ""));
  }

  // 5) Update each global default rule with effective selection arrays and is_active.
  for (const r of effectiveRules) {
    const effectiveProductIds = r.effectiveProductIds;
    const effectiveCategoryIds = r.effectiveCategoryIds;
    const effectiveSubCategoryIds = r.effectiveSubCategoryIds;

    const effectiveIsEmpty =
      effectiveProductIds.length === 0 && effectiveCategoryIds.length === 0 && effectiveSubCategoryIds.length === 0;
    const effectiveIsActive = r.baseIsActive && !effectiveIsEmpty;

    const productNames = effectiveProductIds.map((id) => productNameById.get(id) ?? `Product ${id}`);
    const productCodes = effectiveProductIds.map((id) => productCodeById.get(id) ?? "");

    const categoryNames = effectiveCategoryIds.map((id) => categoryNameById.get(id) ?? `Category ${id}`);
    const subCategoryNames = effectiveSubCategoryIds.map((id) => subCategoryNameById.get(id) ?? `Sub-category ${id}`);

    // Preserve other condition keys (priority/start_level).
    const cond = { ...r.existingConditionsObj };
    cond.product_ids = effectiveProductIds;
    cond.product_name = effectiveProductIds.length > 0 ? productNameById.get(effectiveProductIds[0]) ?? null : null;
    cond.product_names = productNames;
    cond.product_code = effectiveProductIds.length > 0 ? productCodeById.get(effectiveProductIds[0]) ?? null : null;
    cond.product_codes = productCodes;

    cond.category_ids = effectiveCategoryIds;
    cond.category = effectiveCategoryIds.length > 0 ? categoryNameById.get(effectiveCategoryIds[0]) ?? null : null;
    cond.categories = categoryNames;

    cond.sub_category_ids = effectiveSubCategoryIds;
    cond.sub_category = effectiveSubCategoryIds.length > 0 ? subCategoryNameById.get(effectiveSubCategoryIds[0]) ?? null : null;
    cond.sub_categories = subCategoryNames;

    // Backward compatibility single-value keys.
    cond.product_id = effectiveProductIds.length > 0 ? effectiveProductIds[0] : null;
    cond.category_id = effectiveCategoryIds.length > 0 ? effectiveCategoryIds[0] : null;
    cond.sub_category_id = effectiveSubCategoryIds.length > 0 ? effectiveSubCategoryIds[0] : null;

    await pool.query(
      `
        update routing_rules
        set conditions_json = $2,
            is_active = $3,
            updated_at = now()
        where id = $1
      `,
      [r.ruleId, JSON.stringify(cond), effectiveIsActive]
    );
  }
}

export async function listRoutingRules(req: Request, res: Response) {
  const orgId = req.query.organisation_id ? asInt(req.query.organisation_id) : null;
  const includeGlobalRaw = String(req.query.include_global ?? "true").toLowerCase();
  const includeGlobal = includeGlobalRaw !== "false";

  if (!orgId) {
    const result = await pool.query(
      `select id, organisation_id, name, is_active, conditions_json, actions_json, created_at, updated_at
       from routing_rules
       order by organisation_id asc, id asc`
    );
    return res.json({ ok: true, data: result.rows });
  }

  if (!includeGlobal || orgId === 1) {
    const result = await pool.query(
      `select id, organisation_id, name, is_active, conditions_json, actions_json, created_at, updated_at
       from routing_rules
       where organisation_id = $1::bigint
       order by organisation_id asc, id asc`,
      [orgId]
    );
    return res.json({ ok: true, data: result.rows });
  }

  // Effective rule set for a customer org:
  // - New model: global defaults are replicated per organisation, so we only query organisation_id = $1.
  // - Legacy model: global defaults were stored only as organisation_id=1 with is_global_default=true.
  //   We include those legacy rows only when global_default_key is missing.
  const result = await pool.query(
    `select id, organisation_id, name, is_active, conditions_json, actions_json, created_at, updated_at
     from routing_rules
     where (
       organisation_id = $1::bigint
       or (
         organisation_id = 1
         and coalesce((actions_json::jsonb ->> 'is_global_default')::boolean, false) = true
         and coalesce(nullif(actions_json::jsonb ->> 'global_default_key', ''), null) is null
       )
     )
     order by
       lower(name) asc,
       case
         when organisation_id = $1::bigint then
           case when coalesce((actions_json::jsonb ->> 'is_global_default')::boolean, false) = true then 1 else 0 end
         else 2
       end asc,
       id asc`,
    [orgId]
  );

  const effectiveByName = new Map<string, (typeof result.rows)[number]>();
  for (const row of result.rows) {
    const key = String(row.name ?? "").trim().toLowerCase();
    if (!key) continue;
    if (!effectiveByName.has(key)) effectiveByName.set(key, row);
  }

  const effective = Array.from(effectiveByName.values()).sort(
    (a, b) =>
      Number(a.organisation_id ?? 0) - Number(b.organisation_id ?? 0) ||
      Number(a.id ?? 0) - Number(b.id ?? 0)
  );

  return res.json({ ok: true, data: effective });
}

export async function createRoutingRule(req: Request, res: Response) {
  const { organisation_id, name, is_active, conditions_json, actions_json } = req.body ?? {};
  const orgId = asInt(organisation_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  if (!name || typeof name !== "string") return res.status(400).json({ ok: false, error: "name is required" });

  const actionsObj = safeJsonParse(actions_json) ?? {};
  const isGlobalDefault = actionsObj["is_global_default"] === true || actionsObj["is_global_default"] === "true";

  if (isGlobalDefault) {
    const globalDefaultKey = actionsObj["global_default_key"] ? String(actionsObj["global_default_key"]) : generateGlobalDefaultKey();
    const baseIsActive = typeof is_active === "boolean" ? is_active : true;

    const orgIds = await getOrganisationIds();
    const createdRows: any[] = [];

    for (const targetOrgId of orgIds) {
      const hydratedJson = await hydrateRoutingConditionsCategoryIdsFromSubs(targetOrgId, conditions_json);
      const condObj = safeJsonParse(hydratedJson) ?? safeJsonParse(conditions_json) ?? {};
      const baseSel = extractSelectionIdsFromConditions(condObj);
      const key = globalDefaultKey;
      const actionsWithBase = {
        ...actionsObj,
        is_global_default: true,
        global_default_key: key,
        global_default_base_is_active: baseIsActive,
        global_default_base_product_ids: baseSel.productIds,
        global_default_base_category_ids: baseSel.categoryIds,
        global_default_base_sub_category_ids: baseSel.subCategoryIds,
      };

      const result = await pool.query(
        `insert into routing_rules (organisation_id, name, is_active, conditions_json, actions_json)
         values ($1,$2,coalesce($3,true),$4,$5)
         returning id, organisation_id, name, is_active, conditions_json, actions_json, created_at, updated_at`,
        [
          targetOrgId,
          name,
          typeof is_active === "boolean" ? is_active : null,
          hydratedJson ?? conditions_json ?? null,
          JSON.stringify(actionsWithBase),
        ]
      );
      createdRows.push(result.rows[0]);
    }

    // Apply overlap removal for the new global default across all orgs.
    for (const targetOrgId of orgIds) {
      await recomputeGlobalDefaultsForOrg(targetOrgId, globalDefaultKey);
    }

    const row = createdRows[0];
    await appendAdminAudit(req, targetOrgIdSafe(createdRows[0]?.organisation_id), "Routing Rules", "create", `Created global default routing rule "${row?.name}"`);
    return res.status(201).json({ ok: true, data: row });
  }

  const hydratedNonGlobalJson = await hydrateRoutingConditionsCategoryIdsFromSubs(orgId, conditions_json);

  const result = await pool.query(
    `insert into routing_rules (organisation_id, name, is_active, conditions_json, actions_json)
     values ($1,$2,coalesce($3,true),$4,$5)
     returning id, organisation_id, name, is_active, conditions_json, actions_json, created_at, updated_at`,
    [
      orgId,
      name,
      typeof is_active === "boolean" ? is_active : null,
      hydratedNonGlobalJson ?? conditions_json ?? null,
      actions_json ?? null,
    ]
  );
  const row = result.rows[0];
  await appendAdminAudit(req, Number(row.organisation_id), "Routing Rules", "create", `Created routing rule "${row.name}"`);
  // Custom rule changed the overlap set for this org: recompute global defaults.
  await recomputeGlobalDefaultsForOrg(orgId);
  return res.status(201).json({ ok: true, data: row });
}

export async function updateRoutingRule(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const { name, is_active, conditions_json, actions_json } = req.body ?? {};

  const existingRes = await pool.query(`select id, organisation_id, name, is_active, conditions_json, actions_json from routing_rules where id=$1`, [id]);
  const existingRow = existingRes.rows[0];
  if (!existingRow) return res.status(404).json({ ok: false, error: "not found" });

  const existingActions = safeJsonParse(existingRow.actions_json) ?? {};
  const isGlobalDefault = existingActions["is_global_default"] === true || existingActions["is_global_default"] === "true";
  const globalDefaultKey = existingActions["global_default_key"] ? String(existingActions["global_default_key"]) : null;

  // Global defaults should be updated across ALL org copies of the same global_default_key.
  if (isGlobalDefault && globalDefaultKey) {
    const condSource = conditions_json != null ? conditions_json : existingRow.conditions_json;
    const hydratedForBaseSel = await hydrateRoutingConditionsCategoryIdsFromSubs(
      Number(existingRow.organisation_id),
      condSource
    );
    const condObj = safeJsonParse(hydratedForBaseSel) ?? safeJsonParse(condSource) ?? {};
    const baseSel = extractSelectionIdsFromConditions(condObj);
    const baseIsActive =
      typeof is_active === "boolean"
        ? is_active
        : Boolean(existingActions["global_default_base_is_active"] ?? existingRow.is_active);

    const globalsRes = await pool.query(
      `
        select id, organisation_id, actions_json
        from routing_rules
        where actions_json::jsonb ->> 'global_default_key' = $1::text
          and coalesce((actions_json::jsonb ->> 'is_global_default')::boolean, false) = true
      `,
      [globalDefaultKey]
    );

    for (const g of globalsRes.rows) {
      const currentActions = safeJsonParse(g.actions_json) ?? {};
      const nextActions = {
        ...currentActions,
        is_global_default: true,
        global_default_key: globalDefaultKey,
        global_default_base_is_active: baseIsActive,
        global_default_base_product_ids: baseSel.productIds,
        global_default_base_category_ids: baseSel.categoryIds,
        global_default_base_sub_category_ids: baseSel.subCategoryIds,
      };

      const nextConditionsJson =
        conditions_json != null
          ? await hydrateRoutingConditionsCategoryIdsFromSubs(Number(g.organisation_id), conditions_json)
          : null;

      await pool.query(
        `
          update routing_rules
          set name = coalesce($2, name),
              is_active = coalesce($3, is_active),
              conditions_json = coalesce($4, conditions_json),
              actions_json = $5,
              updated_at = now()
          where id=$1
        `,
        [
          g.id,
          name ?? null,
          typeof is_active === "boolean" ? is_active : null,
          nextConditionsJson,
          JSON.stringify(nextActions),
        ]
      );
    }

    const orgsRes = await pool.query(
      `select distinct organisation_id from routing_rules where actions_json::jsonb ->> 'global_default_key' = $1::text`,
      [globalDefaultKey]
    );
    for (const o of orgsRes.rows) {
      await recomputeGlobalDefaultsForOrg(Number(o.organisation_id), globalDefaultKey);
    }

    const updatedRowRes = await pool.query(
      `select id, organisation_id, name, is_active, conditions_json, actions_json, created_at, updated_at
       from routing_rules where id=$1`,
      [id]
    );
    const row = updatedRowRes.rows[0];
    await appendAdminAudit(req, Number(row.organisation_id), "Routing Rules", "update", `Updated global default routing rule "${row.name}"`);
    return res.json({ ok: true, data: row });
  }

  // Default: update a single routing rule.
  const hydratedUpdateJson =
    conditions_json != null
      ? await hydrateRoutingConditionsCategoryIdsFromSubs(Number(existingRow.organisation_id), conditions_json)
      : null;

  const result = await pool.query(
    `update routing_rules
     set name = coalesce($2, name),
         is_active = coalesce($3, is_active),
         conditions_json = coalesce($4, conditions_json),
         actions_json = coalesce($5, actions_json),
         updated_at = now()
     where id=$1
     returning id, organisation_id, name, is_active, conditions_json, actions_json, created_at, updated_at`,
    [
      id,
      name ?? null,
      typeof is_active === "boolean" ? is_active : null,
      hydratedUpdateJson,
      actions_json ?? null,
    ]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, Number(row.organisation_id), "Routing Rules", "update", `Updated routing rule "${row.name}"`);

  // If this was a custom rule, it changes overlaps. Recompute global defaults for its org.
  const actionsAfter = safeJsonParse(row.actions_json) ?? {};
  const wasGlobalDefault = actionsAfter["is_global_default"] === true || actionsAfter["is_global_default"] === "true";
  if (!wasGlobalDefault) {
    await recomputeGlobalDefaultsForOrg(Number(row.organisation_id));
  }

  return res.json({ ok: true, data: row });
}

export async function deleteRoutingRule(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const existingRes = await pool.query(
    `select id, organisation_id, name, conditions_json, actions_json
     from routing_rules where id=$1`,
    [id]
  );
  const existingRow = existingRes.rows[0];
  if (!existingRow) return res.status(404).json({ ok: false, error: "not found" });

  const actions = safeJsonParse(existingRow.actions_json) ?? {};
  const isGlobalDefault = actions["is_global_default"] === true || actions["is_global_default"] === "true";
  const globalDefaultKey = actions["global_default_key"] ? String(actions["global_default_key"]) : null;

  const scopeRaw = String(req.query.scope ?? "org").toLowerCase();
  const scope = scopeRaw === "all" ? "all" : "org";

  if (isGlobalDefault && globalDefaultKey) {
    if (scope === "all") {
      await pool.query(`delete from routing_rules where actions_json::jsonb ->> 'global_default_key' = $1::text`, [globalDefaultKey]);
      await appendAdminAudit(req, Number(existingRow.organisation_id), "Routing Rules", "delete", `Deleted global default routing rule "${existingRow.name}" (all orgs)`);
    } else {
      await pool.query(
        `delete from routing_rules where id=$1`,
        [id]
      );
      await appendAdminAudit(req, Number(existingRow.organisation_id), "Routing Rules", "delete", `Deleted global default routing rule "${existingRow.name}" (selected org)`);
    }
    return res.json({ ok: true, data: { id: existingRow.id } });
  }

  // Custom rule deletion: delete row then recompute global defaults in this org.
  await pool.query(`delete from routing_rules where id=$1`, [id]);
  await appendAdminAudit(req, Number(existingRow.organisation_id), "Routing Rules", "delete", `Deleted routing rule "${existingRow.name}"`);
  await recomputeGlobalDefaultsForOrg(Number(existingRow.organisation_id));
  return res.json({ ok: true, data: { id: existingRow.id } });
}

function targetOrgIdSafe(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

