import { pool } from "../../db/pool.js";
import { ensureDefaultTier1BoundsForOrg } from "../../controllers/admin/slaTier1Bounds.js";
import { buildScreenAccess } from "../../authz/permissionSchema.js";
import { seedKeywordRoutingForOrg } from "../keywordRoutingSeed.js";

function permissionsJsonWithScreen(
  base: Record<string, unknown>,
  screenFullModify: boolean
): string {
  return JSON.stringify({
    ...base,
    screen_access: buildScreenAccess(screenFullModify),
  });
}

/** Same as `buildScreenAccess(false)` but Team/Agent workspace screens are view + modify (aligns with Roles baselines / migration 028). */
const AGENT_WORKSPACE_SCREEN_KEYS = [
  "agent_dashboard",
  "agent_my_tickets",
  "agent_team_queue",
  "agent_history",
  "agent_reports",
] as const;

function permissionsJsonWithScreenAgentTier(base: Record<string, unknown>): string {
  const screen = { ...buildScreenAccess(false) } as Record<string, { view: boolean; modify: boolean }>;
  for (const k of AGENT_WORKSPACE_SCREEN_KEYS) {
    screen[k] = { view: true, modify: true };
  }
  return JSON.stringify({
    ...base,
    screen_access: screen,
  });
}

function parseBigint(v: unknown): bigint | null {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isInteger(v)) return null;
    return BigInt(v);
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    // Ensure it looks like an integer (allow leading + / - if ever needed)
    if (!/^[+-]?\d+$/.test(trimmed)) return null;
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

async function ensureDefaultRoles(organisationId: bigint) {
  // Ensure default roles exist and have the default permission matrix stored in `permissions_json`.
  // Note: for now this is data-only (Option A). Authorization is not yet derived from these fields.
  const commonRoles = [
    [
      "customer",
      "End user; can access own tickets",
      permissionsJsonWithScreen({}, false),
    ],
    [
      "org_admin",
      "Customer org admin; can access org tickets",
      permissionsJsonWithScreen({}, false),
    ],
    [
      "agent",
      "Support agent; workspace access is defined by role and routing stage by support level",
      permissionsJsonWithScreenAgentTier({}),
    ],
  ] as const;

  const eziiOnlyRoles = [
    [
      "team_lead",
      "Team lead; visibility + intervention",
      permissionsJsonWithScreenAgentTier({}),
    ],
    [
      "system_admin",
      "System admin; full access + configuration",
      permissionsJsonWithScreen({}, true),
    ],
  ] as const;

  // Customer orgs should get default operational roles too, except system_admin.
  const nonSystemOperationalRoles = eziiOnlyRoles.filter(([name]) => name !== "system_admin");
  const rolesForOrg =
    organisationId === BigInt(1)
      ? [...commonRoles, ...eziiOnlyRoles]
      : [...commonRoles, ...nonSystemOperationalRoles];

  for (const [name, description, permissionsJson] of rolesForOrg) {
    await pool.query(
      `insert into roles (organisation_id, name, description, permissions_json, is_default)
       values ($1,$2,$3,$4::jsonb,true)
       on conflict (organisation_id, name) do update
         set is_default = true,
             description = case
               when roles.permissions_json is null or roles.permissions_json = '{}'::jsonb
                 then excluded.description
               else roles.description
             end,
             permissions_json = case
               when roles.permissions_json is null or roles.permissions_json = '{}'::jsonb
                 then excluded.permissions_json
               else roles.permissions_json
             end`,
      [organisationId, name, description, permissionsJson]
    );
  }
}

async function ensureDefaultSupportLevels(organisationId: bigint) {
  const defaults = [
    ["L1", "L1", "Level 1 routing tier"],
    ["L2", "L2", "Level 2 routing tier"],
    ["L3", "L3", "Level 3 routing tier"],
  ] as const;

  for (const [code, name, description] of defaults) {
    await pool.query(
      `update org_support_levels
       set name = $3,
           description = $4,
           is_default = true,
           updated_at = now()
       where organisation_id = $1
         and lower(trim(code)) = lower(trim($2))`,
      [organisationId, code, name, description]
    );
    await pool.query(
      `insert into org_support_levels (organisation_id, code, name, description, is_default)
       select $1,$2,$3,$4,true
       where not exists (
         select 1
         from org_support_levels
         where organisation_id = $1
           and lower(trim(code)) = lower(trim($2))
       )`,
      [organisationId, code, name, description]
    );
  }
}

async function ensureOrganisationRow(organisationId: bigint) {
  const existing = await pool.query("select 1 from organisations where id=$1", [
    organisationId,
  ]);
  if (existing.rowCount && existing.rowCount > 0) return;

  // Identity PK is `generated always as identity`, so we must override the system value
  // to align org_id from JWT with organisations.id used by the UI.
  await pool.query(
    `insert into organisations (id, name, support_email, timezone, logo_url, portal_subdomain, created_at, updated_at)
     overriding system value
     values ($1, $2, $3, $4, $5, $6, now(), now())`,
    [
      organisationId,
      `Organisation ${organisationId.toString()}`,
      null,
      "Asia/Kolkata",
      null,
      null,
    ]
  );
}

async function ensureOrganisationSettings(organisationId: bigint) {
  await pool.query(
    `insert into organisation_settings (organisation_id, business_hours_definition, holiday_calendar, is_ngo, ticket_retention_months)
     values ($1, null, null, false, 36)
     on conflict (organisation_id) do nothing`,
    [organisationId]
  );
}

async function ensureDataRetentionPolicy(organisationId: bigint) {
  await pool.query(
    `insert into data_retention_policy (organisation_id, closed_ticket_retention_months, audit_log_retention_months, pii_masking_rules)
     values ($1, 36, 24, null)
     on conflict (organisation_id) do nothing`,
    [organisationId]
  );
}

async function ensureOrganisationProducts(organisationId: bigint) {
  await pool.query(
    `insert into organisation_products (organisation_id, product_id, default_routing_queue_id, enabled)
     select $1 as organisation_id, p.id as product_id, null::bigint as default_routing_queue_id, false as enabled
     from products p
     on conflict (organisation_id, product_id) do nothing`,
    [organisationId]
  );
}

/** PRD defaults: one routing queue per core product, no team until assigned in admin. */
const DEFAULT_PRODUCT_QUEUES: { code: string; queueName: string }[] = [
  { code: "PAY", queueName: "Payroll Support Queue" },
  { code: "LEA", queueName: "Leave Support Queue" },
  { code: "ATT", queueName: "Attendance Support Queue" },
  { code: "EXP", queueName: "Expense Support Queue" },
];

async function ensureDefaultProductQueuesForOrganisation(organisationId: bigint) {
  for (const { code, queueName } of DEFAULT_PRODUCT_QUEUES) {
    const prodRes = await pool.query<{ id: string }>(
      `select id from products where code = $1`,
      [code]
    );
    const productId = prodRes.rows[0]?.id;
    if (productId == null) continue;

    const existing = await pool.query<{ id: string }>(
      `select id from queues
       where organisation_id = $1 and lower(trim(name)) = lower(trim($2::text))`,
      [organisationId, queueName]
    );

    let queueId: number;
    if (existing.rows[0]) {
      queueId = Number(existing.rows[0].id);
      await pool.query(
        `update queues
         set product_id = coalesce(product_id, $2::bigint),
             updated_at = now()
         where id = $1`,
        [queueId, productId]
      );
    } else {
      const ins = await pool.query<{ id: string }>(
        `insert into queues (organisation_id, product_id, team_id, name)
         values ($1, $2, null, $3)
         returning id`,
        [organisationId, productId, queueName]
      );
      const newId = ins.rows[0]?.id;
      if (newId == null) continue;
      queueId = Number(newId);
    }

    await pool.query(
      `update organisation_products
       set default_routing_queue_id = $3,
           enabled = true,
           updated_at = now()
       where organisation_id = $1
         and product_id = $2
         and default_routing_queue_id is null`,
      [organisationId, productId, queueId]
    );
  }
}

/** Seed subcategory_priority_master for new orgs from organisation 1 (no routing_rules rows). */
async function ensureDefaultPriorityMasterRowsForOrganisation(organisationId: bigint) {
  if (organisationId === BigInt(1)) return;

  const orgIdNum = Number(organisationId);
  if (!Number.isFinite(orgIdNum) || orgIdNum <= 0) return;

  const existingRes = await pool.query<{ c: string }>(
    `select count(*)::text as c from subcategory_priority_master where organisation_id = $1::bigint`,
    [orgIdNum]
  );
  if (Number(existingRes.rows[0]?.c ?? "0") > 0) return;

  const srcRes = await pool.query<{
    product_id: number;
    category_name: string;
    sub_category_name: string;
    priority: string;
  }>(
    `select
       spm.product_id,
       pc.name as category_name,
       ps.name as sub_category_name,
       spm.priority
     from subcategory_priority_master spm
     join product_categories pc on pc.id = spm.category_id
     join product_subcategories ps on ps.id = spm.sub_category_id
     where spm.organisation_id = 1
     order by spm.id asc`
  );
  if (srcRes.rowCount === 0) return;

  const sourceProductIds = Array.from(new Set(srcRes.rows.map((r) => r.product_id)));
  const sourceProductsRes = await pool.query<{ id: number; code: string }>(
    `select id, code from products where id = any($1::bigint[])`,
    [sourceProductIds]
  );
  const sourceCodeById = new Map<number, string>();
  for (const p of sourceProductsRes.rows) sourceCodeById.set(Number(p.id), String(p.code ?? ""));

  const targetProductsRes = await pool.query<{ id: number; code: string }>(`select id, code from products`);
  const targetIdByCode = new Map<string, number>();
  for (const p of targetProductsRes.rows) targetIdByCode.set(String(p.code ?? "").toUpperCase(), Number(p.id));

  const targetCatsRes = await pool.query<{
    category_id: number;
    category_name: string;
    product_id: number;
    sub_category_id: number;
    sub_category_name: string;
  }>(
    `select
       pc.id as category_id,
       pc.name as category_name,
       pc.product_id as product_id,
       ps.id as sub_category_id,
       ps.name as sub_category_name
     from product_categories pc
     join product_subcategories ps on ps.category_id = pc.id
     where pc.organisation_id = $1
       and pc.is_active = true
       and ps.is_active = true`,
    [orgIdNum]
  );

  const targetKeyToIds = new Map<string, { productId: number; categoryId: number; subCategoryId: number }>();
  for (const row of targetCatsRes.rows) {
    const key = `${row.product_id}|${String(row.category_name).trim().toLowerCase()}|${String(row.sub_category_name)
      .trim()
      .toLowerCase()}`;
    if (!targetKeyToIds.has(key)) {
      targetKeyToIds.set(key, {
        productId: Number(row.product_id),
        categoryId: Number(row.category_id),
        subCategoryId: Number(row.sub_category_id),
      });
    }
  }

  const existingExactRes = await pool.query<{ k: string }>(
    `select (product_id::text || ':' || category_id::text || ':' || sub_category_id::text) as k
     from subcategory_priority_master
     where organisation_id = $1::bigint`,
    [orgIdNum]
  );
  const existingExactKey = new Set(existingExactRes.rows.map((r) => r.k));

  for (const src of srcRes.rows) {
    const sourceCode = sourceCodeById.get(src.product_id);
    if (!sourceCode) continue;
    const targetProductId = targetIdByCode.get(sourceCode.toUpperCase());
    if (!targetProductId) continue;

    const key = `${targetProductId}|${src.category_name.trim().toLowerCase()}|${src.sub_category_name.trim().toLowerCase()}`;
    const mapped = targetKeyToIds.get(key);
    if (!mapped) continue;

    const exactKey = `${mapped.productId}:${mapped.categoryId}:${mapped.subCategoryId}`;
    if (existingExactKey.has(exactKey)) continue;

    const pr = String(src.priority ?? "P3").toUpperCase();
    const priority = pr === "P1" || pr === "P2" || pr === "P3" || pr === "P4" ? pr : "P3";
    if (priority === "P3") {
      existingExactKey.add(exactKey);
      continue;
    }

    await pool.query(
      `insert into subcategory_priority_master
         (organisation_id, product_id, category_id, sub_category_id, priority, updated_at)
       values ($1::bigint, $2::bigint, $3::bigint, $4::bigint, $5, now())
       on conflict (organisation_id, product_id, category_id, sub_category_id) do nothing`,
      [orgIdNum, mapped.productId, mapped.categoryId, mapped.subCategoryId, priority]
    );
    existingExactKey.add(exactKey);
  }
}

export async function ensureTenantAndDefaultsByOrgId(orgId: unknown) {
  const organisationId = parseBigint(orgId);
  if (!organisationId) return;

  await ensureOrganisationRow(organisationId);
  await ensureDefaultRoles(organisationId);
  await ensureDefaultSupportLevels(organisationId);
  await ensureOrganisationSettings(organisationId);
  await ensureDataRetentionPolicy(organisationId);
  await ensureOrganisationProducts(organisationId);
  await ensureDefaultProductQueuesForOrganisation(organisationId);
  await ensureDefaultTier1BoundsForOrg(organisationId);
  await ensureDefaultPriorityMasterRowsForOrganisation(organisationId);

  const orgIdNum = Number(organisationId);
  if (Number.isFinite(orgIdNum) && orgIdNum > 0) {
    await seedKeywordRoutingForOrg(orgIdNum);
  }
}

