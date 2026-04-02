import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";

export async function listProducts(_req: Request, res: Response) {
  const result = await pool.query(
    "select id, code, name, default_ticket_prefix from products order by id asc"
  );
  return res.json({ ok: true, data: result.rows });
}

