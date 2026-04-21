import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";
import { seedKeywordRoutingForOrg } from "../../services/keywordRoutingSeed.js";
import { ensureTenantAndDefaultsByOrgId } from "../../services/provisioning/ensureTenantAndDefaults.js";

export async function listOrganisations(_req: Request, res: Response) {
  const result = await pool.query(
    `select id, name, support_email, timezone, logo_url, portal_subdomain, is_ngo, created_at, updated_at
     from organisations order by id desc`
  );
  return res.json({ ok: true, data: result.rows });
}

export async function createOrganisation(req: Request, res: Response) {
  const { name, support_email, timezone, logo_url, portal_subdomain } =
    req.body ?? {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const result = await pool.query(
    `insert into organisations (name, support_email, timezone, logo_url, portal_subdomain)
     values ($1,$2,coalesce($3,'Asia/Kolkata'),$4,$5)
     returning id, name, support_email, timezone, logo_url, portal_subdomain, is_ngo, created_at, updated_at`,
    [name, support_email ?? null, timezone ?? null, logo_url ?? null, portal_subdomain ?? null]
  );

  const org = result.rows[0];

  // Create organisation_products rows for all products (disabled by default).
  if (org?.id) {
    await pool.query(
      `insert into organisation_products (organisation_id, product_id, default_routing_queue_id, enabled)
       select $1 as organisation_id, p.id as product_id, null::bigint as default_routing_queue_id, false as enabled
       from products p
       on conflict (organisation_id, product_id) do nothing`,
      [org.id]
    );
    await seedKeywordRoutingForOrg(Number(org.id));
    await ensureTenantAndDefaultsByOrgId(org.id);
  }

  await appendAdminAudit(
    req,
    Number(org.id),
    "Organisations",
    "create",
    `Created organisation "${org.name}"`
  );
  return res.status(201).json({ ok: true, data: org });
}

export async function getOrganisationById(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const result = await pool.query(
    `select id, name, support_email, timezone, logo_url, portal_subdomain, is_ngo, created_at, updated_at
     from organisations where id=$1`,
    [id]
  );

  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  return res.json({ ok: true, data: row });
}

export async function updateOrganisationById(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const { name, support_email, timezone, logo_url, portal_subdomain } =
    req.body ?? {};

  const result = await pool.query(
    `update organisations
     set name = coalesce($2, name),
         support_email = coalesce($3, support_email),
         timezone = coalesce($4, timezone),
         logo_url = coalesce($5, logo_url),
         portal_subdomain = coalesce($6, portal_subdomain),
         updated_at = now()
     where id=$1
     returning id, name, support_email, timezone, logo_url, portal_subdomain, is_ngo, created_at, updated_at`,
    [id, name ?? null, support_email ?? null, timezone ?? null, logo_url ?? null, portal_subdomain ?? null]
  );

  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });

  await appendAdminAudit(
    req,
    Number(row.id),
    "Organisations",
    "update",
    `Updated organisation "${row.name}"`
  );
  return res.json({ ok: true, data: row });
}

export async function getOrganisationSettings(req: Request, res: Response) {
  const orgId = asInt(req.params.id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid id" });

  const result = await pool.query(
    `select organisation_id, business_hours_definition, holiday_calendar, is_ngo, ticket_retention_months
     from organisation_settings where organisation_id=$1`,
    [orgId]
  );

  return res.json({ ok: true, data: result.rows[0] ?? null });
}

export async function updateOrganisationSettings(req: Request, res: Response) {
  const orgId = asInt(req.params.id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid id" });

  const {
    business_hours_definition,
    holiday_calendar,
    is_ngo,
    ticket_retention_months,
  } = req.body ?? {};

  const result = await pool.query(
    `insert into organisation_settings (organisation_id, business_hours_definition, holiday_calendar, is_ngo, ticket_retention_months)
     values ($1,$2,$3,coalesce($4,false),coalesce($5,36))
     on conflict (organisation_id) do update
       set business_hours_definition = coalesce(excluded.business_hours_definition, organisation_settings.business_hours_definition),
           holiday_calendar = coalesce(excluded.holiday_calendar, organisation_settings.holiday_calendar),
           is_ngo = coalesce(excluded.is_ngo, organisation_settings.is_ngo),
           ticket_retention_months = coalesce(excluded.ticket_retention_months, organisation_settings.ticket_retention_months),
           updated_at = now()
     returning organisation_id, business_hours_definition, holiday_calendar, is_ngo, ticket_retention_months`,
    [
      orgId,
      business_hours_definition ?? null,
      holiday_calendar ?? null,
      typeof is_ngo === "boolean" ? is_ngo : null,
      typeof ticket_retention_months === "number" ? ticket_retention_months : null,
    ]
  );

  const row = result.rows[0];
  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "Organisations",
    "update_settings",
    `Updated organisation settings`
  );

  return res.json({ ok: true, data: row });
}

export async function getOrganisationRetention(req: Request, res: Response) {
  const orgId = asInt(req.params.id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid id" });

  const result = await pool.query(
    `select organisation_id, closed_ticket_retention_months, audit_log_retention_months, pii_masking_rules
     from data_retention_policy where organisation_id=$1`,
    [orgId]
  );

  return res.json({ ok: true, data: result.rows[0] ?? null });
}

export async function updateOrganisationRetention(req: Request, res: Response) {
  const orgId = asInt(req.params.id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid id" });

  const {
    closed_ticket_retention_months,
    audit_log_retention_months,
    pii_masking_rules,
  } = req.body ?? {};

  const result = await pool.query(
    `insert into data_retention_policy (organisation_id, closed_ticket_retention_months, audit_log_retention_months, pii_masking_rules)
     values ($1,coalesce($2,36),coalesce($3,24),$4)
     on conflict (organisation_id) do update
       set closed_ticket_retention_months = coalesce(excluded.closed_ticket_retention_months, data_retention_policy.closed_ticket_retention_months),
           audit_log_retention_months = coalesce(excluded.audit_log_retention_months, data_retention_policy.audit_log_retention_months),
           pii_masking_rules = coalesce(excluded.pii_masking_rules, data_retention_policy.pii_masking_rules),
           updated_at = now()
     returning organisation_id, closed_ticket_retention_months, audit_log_retention_months, pii_masking_rules`,
    [
      orgId,
      typeof closed_ticket_retention_months === "number"
        ? closed_ticket_retention_months
        : null,
      typeof audit_log_retention_months === "number"
        ? audit_log_retention_months
        : null,
      pii_masking_rules ?? null,
    ]
  );

  const row = result.rows[0];
  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "Organisations",
    "update_retention",
    `Updated data retention policy`
  );

  return res.json({ ok: true, data: row });
}

