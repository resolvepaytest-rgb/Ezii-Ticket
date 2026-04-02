import { pool } from "../../db/pool.js";
import {
  ticketMatchesRoleApplyScope,
  type RoleApplyRow,
} from "../../services/roleTicketScope.js";

export async function loadPrimaryRoleApplyRow(
  userId: number,
  orgId: number
): Promise<RoleApplyRow | null> {
  const r = await pool.query<RoleApplyRow>(
    `select r.apply_role_to, r.apply_attribute_id, r.apply_sub_attribute_id, r.apply_worker_type_id
     from user_roles ur
     join roles r on r.id = ur.role_id
     where ur.user_id = $1::bigint
       and (
         ur.scope_organisation_id = $2::bigint
         or (ur.scope_organisation_id is null and r.organisation_id = $2::bigint)
       )
     order by case when ur.scope_organisation_id is not null then 0 else 1 end, ur.id asc
     limit 1`,
    [userId, orgId]
  );
  return r.rows[0] ?? null;
}

export function ticketMetadataObject(metadataJson: unknown): Record<string, unknown> {
  if (metadataJson == null) return {};
  if (typeof metadataJson === "object" && !Array.isArray(metadataJson)) {
    return metadataJson as Record<string, unknown>;
  }
  if (typeof metadataJson === "string") {
    try {
      const p = JSON.parse(metadataJson) as unknown;
      if (typeof p === "object" && p !== null && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Agent/lead access: own reporter/assignee always; otherwise enforce apply_role_to scope on metadata.
 */
export function userCanAccessTicketForAgentRole(args: {
  ticket: { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json?: unknown };
  viewerUserId: number;
  apply: RoleApplyRow | null;
}): boolean {
  const { ticket, viewerUserId, apply } = args;
  if (Number(ticket.reporter_user_id) === viewerUserId) return true;
  if (ticket.assignee_user_id != null && Number(ticket.assignee_user_id) === viewerUserId) return true;
  if (!apply || (apply.apply_role_to ?? "all") === "all") return true;
  const meta = ticketMetadataObject(ticket.metadata_json);
  return ticketMatchesRoleApplyScope(meta, apply, viewerUserId);
}

/** Load ticket row fields needed for scope check (agent actions). */
export async function fetchTicketScopeRow(
  ticketId: number,
  orgId: number
): Promise<{ reporter_user_id: unknown; assignee_user_id: unknown; metadata_json: unknown } | null> {
  const r = await pool.query(
    `select reporter_user_id, assignee_user_id, metadata_json
     from tickets where id = $1 and organisation_id = $2`,
    [ticketId, orgId]
  );
  return (r.rows[0] as { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json: unknown }) ?? null;
}

export async function assertAgentCanAccessTicketOrThrow(
  viewerUserId: number,
  orgId: number,
  ticketId: number
): Promise<void> {
  const apply = await loadPrimaryRoleApplyRow(viewerUserId, orgId);
  const row = await fetchTicketScopeRow(ticketId, orgId);
  if (!row) {
    const err = new Error("not_found");
    (err as { name?: string }).name = "TicketNotFound";
    throw err;
  }
  if (
    !userCanAccessTicketForAgentRole({
      ticket: row,
      viewerUserId,
      apply,
    })
  ) {
    const err = new Error("forbidden");
    (err as { name?: string }).name = "Forbidden";
    throw err;
  }
}
