import { pool } from "../../db/pool.js";
import { sendTeamLeadNoAssigneeEmails } from "../notifications/sendTeamLeadNoAssigneeEmails.js";
import { createUserNotification } from "../notifications/userNotifications.js";

async function appendTicketEventInline(args: {
  ticketId: number;
  organisationId: number;
  eventType: string;
  actorUserId?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  await pool.query(
    `insert into ticket_events
      (ticket_id, organisation_id, event_type, actor_user_id, old_values, new_values, metadata_json)
     values ($1,$2,$3,$4,null,null,$5::jsonb)`,
    [
      args.ticketId,
      args.organisationId,
      args.eventType,
      args.actorUserId ?? null,
      JSON.stringify(args.metadata ?? {}),
    ]
  );
}

/**
 * When no agent could be auto-assigned (OOO / cap / empty team), notify team leads:
 * - Prefer `team_members.is_team_lead` for the target team
 * - Else any user in the org with role `team_lead`
 * Records `ticket_events` + internal system message on the ticket, then sends optional SMTP
 * email using org template `team_lead_no_assignee` (or server default) when `SMTP_HOST` is set.
 */
export async function notifyTeamLeadsNoAvailableAgent(args: {
  organisationId: number;
  teamId: number;
  ticketId: number;
  ticketCode: string;
  context: "create" | "escalate";
  reason?: "unavailable" | "out_of_office";
  startLevel?: string | null;
}): Promise<void> {
  const { organisationId, teamId, ticketId, ticketCode, context, reason = "unavailable", startLevel = null } = args;

  const leadsRes = await pool.query<{ user_id: number; email: string; name: string }>(
    `select tm.user_id, u.email, u.name
     from team_members tm
     join users u on u.user_id = tm.user_id and u.organisation_id = $2
     where tm.team_id = $1
       and tm.is_team_lead = true
       and lower(u.status) = 'active'`,
    [teamId, organisationId]
  );

  let recipients = leadsRes.rows;
  if (recipients.length === 0) {
    const fb = await pool.query<{ user_id: number; email: string; name: string }>(
      `select distinct u.user_id, u.email, u.name
       from team_members tm
       join users u on u.user_id = tm.user_id
       join user_roles ur on ur.user_id = u.user_id
       join roles r on r.id = ur.role_id
       where tm.team_id = $2
         and u.organisation_id = $1
         and lower(u.status) = 'active'
         and (
           lower(replace(r.name, ' ', '_')) = 'team_lead'
           or lower(r.name) like '%team lead%'
         )
       limit 25`,
      [organisationId, teamId]
    );
    recipients = fb.rows;
  }

  // Final fallback: no configured lead in the team.
  if (recipients.length === 0) {
    const fb = await pool.query<{ user_id: number; email: string; name: string }>(
      `select distinct u.user_id, u.email, u.name
       from users u
       join user_roles ur on ur.user_id = u.user_id
       join roles r on r.id = ur.role_id
       where (
         u.organisation_id = $1
         or ur.scope_organisation_id = $1
       )
         and lower(u.status) = 'active'
         and (
           lower(replace(r.name, ' ', '_')) = 'team_lead'
           or lower(r.name) like '%team lead%'
         )
       limit 25`,
      [organisationId]
    );
    recipients = fb.rows;
  }

  const seen = new Set<number>();
  const unique: { user_id: number; email: string; name: string }[] = [];
  for (const r of recipients) {
    const id = Number(r.user_id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(r);
  }

  const emails = unique.map((r) => r.email).filter(Boolean);
  const ids = unique.map((r) => r.user_id);

  await appendTicketEventInline({
    ticketId,
    organisationId,
    eventType: "team_lead_notified_no_assignee",
    metadata: {
      team_id: teamId,
      context,
      ticket_code: ticketCode,
      notified_user_ids: ids,
      notified_emails: emails,
      reason: "no_available_agent_least_loaded",
      assignment_reason: reason,
      start_level: startLevel,
    },
  });

  const summary =
    emails.length > 0
      ? emails.join(", ")
      : "no team lead configured — configure is_team_lead on team members or assign team_lead role";

  const levelPart = startLevel ? ` for ${startLevel}` : "";
  const reasonText =
    reason === "out_of_office"
      ? `all eligible agents${levelPart} are marked out of office`
      : `no eligible agents${levelPart} are currently available (inactive or at capacity)`;
  const body =
    context === "create"
      ? `[System] Ticket ${ticketCode}: no agent was auto-assigned because ${reasonText}. Team Lead notification recorded for: ${summary}.`
      : `[System] Ticket ${ticketCode}: escalation could not auto-assign an agent because ${reasonText}. Team Lead notification recorded for: ${summary}.`;

  await pool.query(
    `insert into ticket_messages
      (ticket_id, organisation_id, author_user_id, author_type, body, is_internal, attachments_json, created_at)
     values ($1, $2, null, 'system', $3, true, '[]'::jsonb, now())`,
    [ticketId, organisationId, body]
  );

  if (unique.length === 0) return;

  for (const lead of unique) {
    await createUserNotification({
      organisationId,
      userId: lead.user_id,
      ticketId,
      eventKey: reason === "out_of_office" ? "team_lead_notified_assignee_ooo" : "team_lead_notified_no_assignee",
      title:
        reason === "out_of_office"
          ? `Assignment blocked (OOO): ${ticketCode}`
          : `Assignment blocked (Unavailable): ${ticketCode}`,
      message:
        reason === "out_of_office"
          ? `Auto-assignment failed${startLevel ? ` for ${startLevel}` : ""}: all eligible agents are out of office.`
          : `Auto-assignment failed${startLevel ? ` for ${startLevel}` : ""}: no eligible agents are currently available.`,
      navigateUrl: `/tickets/${ticketId}`,
      createdByUserId: null,
    });
  }

  const metaRes = await pool.query<{ subject: string; team_name: string }>(
    `select t.subject,
            coalesce(tm.name, 'Team') as team_name
     from tickets t
     left join teams tm
       on tm.id = coalesce(t.team_id, $3::bigint)
      and tm.organisation_id = t.organisation_id
     where t.id = $1 and t.organisation_id = $2`,
    [ticketId, organisationId, teamId]
  );
  const ticketSubject = metaRes.rows[0]?.subject ?? "";
  const teamName = metaRes.rows[0]?.team_name ?? "Team";

  await sendTeamLeadNoAssigneeEmails({
    organisationId,
    recipients: unique.map((u) => ({ email: u.email, name: u.name })),
    ticketId,
    ticketCode,
    ticketSubject,
    teamName,
    context,
  });
}
