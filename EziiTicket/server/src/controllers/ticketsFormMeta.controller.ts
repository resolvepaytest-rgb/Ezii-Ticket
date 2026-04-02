import type { Request, Response } from "express";
import { pool } from "../db/pool.js";
import { asInt } from "./admin/adminUtils.js";
import { ensureDefaultTaxonomyForOrgProduct } from "./admin/productCategories.controller.js";

function currentOrgId(req: Request): number | null {
  return asInt(req.user?.org_id);
}

/**
 * Enabled products for the authenticated user's organisation (portal / raise ticket).
 */
export async function listTicketFormProducts(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  if (!orgId) return res.status(400).json({ ok: false, error: "invalid user context" });

  const result = await pool.query<{
    id: number;
    code: string;
    name: string;
    default_ticket_prefix: string;
  }>(
    `select p.id, p.code, p.name, p.default_ticket_prefix
     from organisation_products op
     join products p on p.id = op.product_id
     where op.organisation_id = $1 and op.enabled = true
     order by p.id asc`,
    [orgId]
  );

  return res.json({ ok: true, data: result.rows });
}

/**
 * Category tree for raise-ticket form; org must have the product enabled.
 */
export async function listTicketFormCategories(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const productId = asInt(req.params.productId);
  if (!orgId || !productId) {
    return res.status(400).json({ ok: false, error: "invalid organisation or product" });
  }

  const en = await pool.query(
    `select 1 from organisation_products
     where organisation_id = $1 and product_id = $2 and enabled = true`,
    [orgId, productId]
  );
  if (en.rowCount === 0) {
    return res.status(403).json({ ok: false, error: "product is not enabled for this organisation" });
  }

  await ensureDefaultTaxonomyForOrgProduct(orgId, productId);

  const cats = await pool.query(
    `select id, organisation_id, product_id, name, sort_order, is_active, is_system_default, created_at, updated_at
     from product_categories
     where organisation_id = $1 and product_id = $2 and is_active = true
     order by
       case when coalesce(is_system_default, false) = false then 0 else 1 end asc,
       sort_order asc,
       id asc`,
    [orgId, productId]
  );

  const subs = await pool.query(
    `select ps.id, ps.category_id, ps.name, ps.sort_order, ps.is_active, ps.is_system_default, ps.created_at, ps.updated_at
     from product_subcategories ps
     join product_categories pc on pc.id = ps.category_id
     where pc.organisation_id = $1 and pc.product_id = $2 and ps.is_active = true
     order by
       case when coalesce(ps.is_system_default, false) = false then 0 else 1 end asc,
       ps.sort_order asc,
       ps.id asc`,
    [orgId, productId]
  );

  const subByCat = new Map<number, typeof subs.rows>();
  for (const s of subs.rows) {
    const cid = Number(s.category_id);
    const arr = subByCat.get(cid) ?? [];
    arr.push(s);
    subByCat.set(cid, arr);
  }

  const data = cats.rows.map((c) => ({
    ...c,
    subcategories: subByCat.get(Number(c.id)) ?? [],
  }));

  return res.json({ ok: true, data });
}
