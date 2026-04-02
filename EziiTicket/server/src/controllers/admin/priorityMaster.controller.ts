import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { appendAdminAudit } from "./adminAudit.js";

const VALID_PRIORITIES = new Set(["P1", "P2", "P3", "P4"]);

type Item = {
  product_id: number;
  category_id: number;
  sub_category_id: number;
  priority: string;
};

function asPositiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

async function validateHierarchy(
  organisationId: number,
  productId: number,
  categoryId: number,
  subCategoryId: number
): Promise<boolean> {
  const r = await pool.query<{ ok: string }>(
    `select 1::text as ok
     from product_categories pc
     join product_subcategories ps on ps.category_id = pc.id
     where pc.organisation_id = $1::bigint
       and pc.product_id = $2::bigint
       and pc.id = $3::bigint
       and ps.id = $4::bigint
     limit 1`,
    [organisationId, productId, categoryId, subCategoryId]
  );
  return Boolean(r.rows[0]?.ok);
}

export async function listPriorityMaster(req: Request, res: Response) {
  const organisationId = Number(req.query["organisation_id"]);
  if (!Number.isFinite(organisationId) || organisationId <= 0) {
    return res.status(400).json({ ok: false, message: "organisation_id required" });
  }

  const r = await pool.query<Item>(
    `select product_id, category_id, sub_category_id, priority
     from subcategory_priority_master
     where organisation_id = $1::bigint
     order by product_id asc, category_id asc, sub_category_id asc`,
    [organisationId]
  );

  return res.json({ ok: true, data: r.rows });
}

export async function upsertPriorityMasterBatch(req: Request, res: Response) {
  const body = req.body as { organisation_id?: unknown; items?: unknown };
  const organisationId = asPositiveInt(body.organisation_id);
  if (organisationId === null) {
    return res.status(400).json({ ok: false, message: "organisation_id required" });
  }
  if (!Array.isArray(body.items)) {
    return res.status(400).json({ ok: false, message: "items array required" });
  }

  const items: Item[] = [];
  for (const raw of body.items) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const product_id = asPositiveInt(o["product_id"]);
    const category_id = asPositiveInt(o["category_id"]);
    const sub_category_id = asPositiveInt(o["sub_category_id"]);
    const pr = typeof o["priority"] === "string" ? o["priority"].toUpperCase() : "";
    if (product_id === null || category_id === null || sub_category_id === null) continue;
    if (!VALID_PRIORITIES.has(pr)) {
      return res.status(400).json({ ok: false, message: `Invalid priority: ${String(o["priority"])}` });
    }
    items.push({ product_id, category_id, sub_category_id, priority: pr });
  }

  if (items.length === 0) {
    return res.json({ ok: true, data: { updated: 0 } });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    for (const it of items) {
      const ok = await validateHierarchy(organisationId, it.product_id, it.category_id, it.sub_category_id);
      if (!ok) {
        await client.query("rollback");
        return res.status(400).json({
          ok: false,
          message: `Invalid taxonomy for product ${it.product_id}, category ${it.category_id}, sub ${it.sub_category_id}`,
        });
      }

      if (it.priority === "P3") {
        await client.query(
          `delete from subcategory_priority_master
           where organisation_id = $1::bigint
             and product_id = $2::bigint
             and category_id = $3::bigint
             and sub_category_id = $4::bigint`,
          [organisationId, it.product_id, it.category_id, it.sub_category_id]
        );
      } else {
        await client.query(
          `insert into subcategory_priority_master
             (organisation_id, product_id, category_id, sub_category_id, priority, updated_at)
           values ($1::bigint, $2::bigint, $3::bigint, $4::bigint, $5, now())
           on conflict (organisation_id, product_id, category_id, sub_category_id)
           do update set priority = excluded.priority, updated_at = now()`,
          [organisationId, it.product_id, it.category_id, it.sub_category_id, it.priority]
        );
      }
    }

    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => null);
    throw e;
  } finally {
    client.release();
  }

  await appendAdminAudit(req, organisationId, "priority_master", "upsert", `Saved ${items.length} priority master row(s)`);

  return res.json({ ok: true, data: { updated: items.length } });
}
