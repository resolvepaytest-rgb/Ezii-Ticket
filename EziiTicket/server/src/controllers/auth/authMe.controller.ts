import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "../admin/adminUtils.js";

/** Current session org’s `is_ngo` (for theme); no extra HTTP surface. */
export async function sendAuthMeWithIsNgo(req: Request, res: Response) {
  const orgId = req.user?.org_id ? asInt(String(req.user.org_id)) : null;
  let is_ngo = false;
  if (orgId) {
    const r = await pool.query<{ is_ngo: boolean }>(
      `select coalesce(o.is_ngo, false) as is_ngo from organisations o where o.id = $1::bigint`,
      [orgId]
    );
    is_ngo = r.rows[0]?.is_ngo === true;
  }
  return res.json({ ok: true, user: req.user, is_ngo });
}
