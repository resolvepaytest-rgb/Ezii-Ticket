import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { ensureTenantAndDefaultsByOrgId } from "../../services/provisioning/ensureTenantAndDefaults.js";
import { appendAdminAudit } from "./adminAudit.js";

export async function getOrganisationProducts(req: Request, res: Response) {
  const orgId = asInt(req.params.id);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid id" });

  const result = await pool.query(
    `select p.id as product_id,
            p.code,
            p.name,
            coalesce(op.enabled, false) as enabled,
            op.default_routing_queue_id,
            q.name as default_routing_queue_name
     from products p
     left join organisation_products op
       on op.organisation_id = $1 and op.product_id = p.id
     left join queues q
       on q.id = op.default_routing_queue_id
     order by p.id asc`,
    [orgId]
  );

  return res.json({ ok: true, data: result.rows });
}

export async function setOrganisationProduct(req: Request, res: Response) {
  const orgId = asInt(req.params.id);
  const productId = asInt(req.params.product_id);
  if (!orgId || !productId) {
    return res.status(400).json({ ok: false, error: "invalid ids" });
  }

  // Ensure FK parent rows exist for external org ids selected from profile APIs.
  await ensureTenantAndDefaultsByOrgId(orgId);

  const { enabled, default_routing_queue_id } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    return res
      .status(400)
      .json({ ok: false, error: "enabled boolean is required" });
  }

  const queueId =
    typeof default_routing_queue_id === "number"
      ? default_routing_queue_id
      : typeof default_routing_queue_id === "string"
        ? asInt(default_routing_queue_id)
        : null;

  const result = await pool.query(
    `insert into organisation_products (organisation_id, product_id, default_routing_queue_id, enabled)
     values ($1,$2,$3,$4)
     on conflict (organisation_id, product_id) do update
       set default_routing_queue_id = excluded.default_routing_queue_id,
           enabled = excluded.enabled,
           updated_at = now()
     returning organisation_id, product_id, enabled, default_routing_queue_id`,
    [orgId, productId, queueId, enabled]
  );

  await appendAdminAudit(
    req,
    orgId,
    "Organisations",
    "update_product_enablement",
    `Set product ${productId} enabled=${enabled}`
  );

  return res.json({ ok: true, data: result.rows[0] });
}

