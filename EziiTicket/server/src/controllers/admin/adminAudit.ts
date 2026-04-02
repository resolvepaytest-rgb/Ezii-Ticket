import type { Request } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";

export async function appendAdminAudit(
  req: Request,
  organisationId: number,
  module: string,
  action: string,
  summary: string
) {
  await pool.query(
    `insert into admin_audit_logs (organisation_id, module, action, summary, actor_user_id, actor_role_name)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      organisationId,
      module,
      action,
      summary,
      asInt(req.user?.user_id) ?? null,
      req.user?.role_name ?? null,
    ]
  );
}
