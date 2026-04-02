import type { Request } from "express";
import { pool } from "../db/pool.js";
import { asInt } from "../controllers/admin/adminUtils.js";

/**
 * Best-effort audit trail for permission denials.
 * This should never block request handling if logging fails.
 */
export async function appendPermissionDeniedAudit(
  req: Request,
  organisationId: number,
  action: string,
  summary: string
): Promise<void> {
  await pool.query(
    `insert into admin_audit_logs (organisation_id, module, action, summary, actor_user_id, actor_role_name)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      organisationId,
      "Authorization",
      action,
      summary,
      asInt(req.user?.user_id) ?? null,
      req.user?.role_name ?? null,
    ]
  );
}

