import { pool } from "../../db/pool.js";

type TicketRow = { id: number; team_id: number | null };

async function pickReplacementAssignee(args: {
  organisationId: number;
  teamId: number | null;
  sourceUserId: number;
}): Promise<number | null> {
  if (!args.teamId) return null;
  const r = await pool.query<{ user_id: number }>(
    `with open_counts as (
       select assignee_user_id as user_id, count(*)::int as open_count
       from tickets
       where organisation_id = $1::bigint
         and status in ('open','escalated','reopened')
         and assignee_user_id is not null
       group by assignee_user_id
     )
     select tm.user_id
     from team_members tm
     join users u on u.user_id = tm.user_id and u.organisation_id = $1::bigint
     left join open_counts oc on oc.user_id = tm.user_id
     where tm.team_id = $2::bigint
       and tm.user_id <> $3::bigint
       and lower(coalesce(u.status, '')) = 'active'
       and coalesce(u.out_of_office, false) = false
     order by coalesce(oc.open_count, 0) asc, tm.user_id asc
     limit 1`,
    [args.organisationId, args.teamId, args.sourceUserId]
  );
  return r.rows[0]?.user_id ?? null;
}

/**
 * Auto-redistribute open tickets for users that just became OOO.
 * Reassigns within the same team to least-loaded active non-OOO teammate; if none, unassigns.
 */
export async function redistributeOpenTicketsForOooUsers(args: {
  organisationId: number;
  sourceUserIds: number[];
}): Promise<{ scanned: number; reassigned: number; unassigned: number }> {
  const sourceSet = new Set(args.sourceUserIds.filter((n) => Number.isFinite(n) && n > 0));
  const sourceUserIds = [...sourceSet];
  if (sourceUserIds.length === 0) return { scanned: 0, reassigned: 0, unassigned: 0 };

  const openTickets = await pool.query<TicketRow>(
    `select id, team_id
     from tickets
     where organisation_id = $1::bigint
       and status in ('open','escalated','reopened')
       and assignee_user_id = any($2::bigint[])`,
    [args.organisationId, sourceUserIds]
  );

  let reassigned = 0;
  let unassigned = 0;
  for (const t of openTickets.rows) {
    const current = await pool.query<{ assignee_user_id: number | null }>(
      `select assignee_user_id
       from tickets
       where id = $1::bigint
         and organisation_id = $2::bigint`,
      [t.id, args.organisationId]
    );
    const sourceUserId = current.rows[0]?.assignee_user_id ?? null;
    if (sourceUserId == null || !sourceSet.has(Number(sourceUserId))) continue;

    const nextAssignee = await pickReplacementAssignee({
      organisationId: args.organisationId,
      teamId: t.team_id,
      sourceUserId: Number(sourceUserId),
    });
    await pool.query(
      `update tickets
       set assignee_user_id = $3::bigint,
           updated_at = now()
       where id = $1::bigint
         and organisation_id = $2::bigint`,
      [t.id, args.organisationId, nextAssignee]
    );
    await pool.query(
      `insert into ticket_events
        (ticket_id, organisation_id, event_type, actor_user_id, old_values, new_values, metadata_json)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
      [
        t.id,
        args.organisationId,
        "assignment_changed",
        null,
        JSON.stringify({ assignee_user_id: sourceUserId }),
        JSON.stringify({ assignee_user_id: nextAssignee }),
        JSON.stringify({ reason: "agent_out_of_office_auto_redistribute" }),
      ]
    );
    if (nextAssignee == null) unassigned += 1;
    else reassigned += 1;
  }

  return { scanned: openTickets.rows.length, reassigned, unassigned };
}
