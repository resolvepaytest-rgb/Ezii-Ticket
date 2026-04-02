import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";

export type KeywordRoutingEntryRow = {
  id: number;
  organisation_id: number;
  product_id: number;
  product_name: string | null;
  product_code: string | null;
  phrase: string;
  phrase_normalized: string;
  is_active: boolean;
  is_system_default: boolean;
  created_at: string;
  updated_at: string;
};

export async function listKeywordRouting(req: Request, res: Response) {
  const orgId = asInt(req.query.organisation_id);
  if (!orgId) return res.status(400).json({ ok: false, error: "organisation_id is required" });

  const result = await pool.query<KeywordRoutingEntryRow>(
    `select k.id,
            k.organisation_id,
            k.product_id,
            p.name as product_name,
            p.code as product_code,
            k.phrase,
            k.phrase_normalized,
            k.is_active,
            k.is_system_default,
            k.created_at::text,
            k.updated_at::text
     from keyword_routing_entries k
     join products p on p.id = k.product_id
     where k.organisation_id = $1
     order by p.name asc, k.phrase_normalized asc`,
    [orgId]
  );
  return res.json({ ok: true, data: result.rows });
}

export async function createKeywordRouting(req: Request, res: Response) {
  const organisation_id = asInt(req.body?.organisation_id);
  const product_id = asInt(req.body?.product_id);
  const phrase = typeof req.body?.phrase === "string" ? req.body.phrase.trim() : "";
  if (!organisation_id) return res.status(400).json({ ok: false, error: "organisation_id is required" });
  if (!product_id) return res.status(400).json({ ok: false, error: "product_id is required" });
  if (!phrase) return res.status(400).json({ ok: false, error: "phrase is required" });

  const ins = await pool.query<{ id: number }>(
    `insert into keyword_routing_entries (organisation_id, product_id, phrase, is_system_default, is_active)
     values ($1,$2,$3,false,true)
     returning id`,
    [organisation_id, product_id, phrase]
  );
  const newId = ins.rows[0]?.id;
  if (!newId) return res.status(500).json({ ok: false, error: "failed to create" });

  const result = await pool.query<KeywordRoutingEntryRow>(
    `select k.id,
            k.organisation_id,
            k.product_id,
            p.name as product_name,
            p.code as product_code,
            k.phrase,
            k.phrase_normalized,
            k.is_active,
            k.is_system_default,
            k.created_at::text,
            k.updated_at::text
     from keyword_routing_entries k
     join products p on p.id = k.product_id
     where k.id = $1`,
    [newId]
  );
  const row = result.rows[0];
  if (!row) return res.status(500).json({ ok: false, error: "failed to load created row" });

  await appendAdminAudit(req, organisation_id, "Keyword routing", "create", `Added keyword phrase for product ${product_id}`);
  return res.status(201).json({ ok: true, data: row });
}

export async function updateKeywordRouting(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const phraseRaw = req.body?.phrase;
  const phrase =
    phraseRaw !== undefined && phraseRaw !== null ? String(phraseRaw).trim() : undefined;
  if (phrase !== undefined && !phrase) {
    return res.status(400).json({ ok: false, error: "phrase cannot be empty" });
  }
  const is_active = req.body?.is_active;

  const existing = await pool.query<{ organisation_id: number }>(
    `select organisation_id from keyword_routing_entries where id = $1`,
    [id]
  );
  const orgId = existing.rows[0]?.organisation_id;
  if (!orgId) return res.status(404).json({ ok: false, error: "not found" });

  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [];
  if (phrase !== undefined) {
    params.push(phrase);
    sets.push(`phrase = $${params.length}`);
  }
  if (typeof is_active === "boolean") {
    params.push(is_active);
    sets.push(`is_active = $${params.length}`);
  }
  if (phrase === undefined && typeof is_active !== "boolean") {
    return res.status(400).json({ ok: false, error: "nothing to update" });
  }
  params.push(id);

  const upd = await pool.query(
    `update keyword_routing_entries
     set ${sets.join(", ")}
     where id = $${params.length}
     returning id`,
    params
  );
  if (upd.rows.length === 0) return res.status(404).json({ ok: false, error: "not found" });

  const result = await pool.query<KeywordRoutingEntryRow>(
    `select k.id,
            k.organisation_id,
            k.product_id,
            p.name as product_name,
            p.code as product_code,
            k.phrase,
            k.phrase_normalized,
            k.is_active,
            k.is_system_default,
            k.created_at::text,
            k.updated_at::text
     from keyword_routing_entries k
     join products p on p.id = k.product_id
     where k.id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });

  await appendAdminAudit(req, orgId, "Keyword routing", "update", `Updated keyword entry ${id}`);
  return res.json({ ok: true, data: row });
}

export async function deleteKeywordRouting(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const result = await pool.query<{ organisation_id: number }>(
    `delete from keyword_routing_entries where id = $1 returning organisation_id`,
    [id]
  );
  const orgId = result.rows[0]?.organisation_id;
  if (!orgId) return res.status(404).json({ ok: false, error: "not found" });

  await appendAdminAudit(req, orgId, "Keyword routing", "delete", `Deleted keyword entry ${id}`);
  return res.json({ ok: true, data: { id } });
}
