import { pool } from "../../db/pool.js";

async function appendTicketEvent(args: {
  ticketId: number;
  organisationId: number;
  eventType: string;
  actorUserId?: number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  await pool.query(
    `insert into ticket_events
      (ticket_id, organisation_id, event_type, actor_user_id, old_values, new_values, metadata_json)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
    [
      args.ticketId,
      args.organisationId,
      args.eventType,
      args.actorUserId ?? null,
      args.oldValues ? JSON.stringify(args.oldValues) : null,
      args.newValues ? JSON.stringify(args.newValues) : null,
      JSON.stringify(args.metadata ?? {}),
    ]
  );
}

export async function runSlaTick() {
  // Warn at 75% elapsed for resolution SLA.
  const warnRows = await pool.query<{
    ticket_id: number;
    organisation_id: number;
    resolution_due_at: string;
    created_at: string;
  }>(
    `select t.id as ticket_id, t.organisation_id, t.resolution_due_at, t.created_at
     from tickets t
     where t.status in ('open','escalated','reopened')
       and t.resolution_due_at is not null
       and not exists (
         select 1 from sla_alerts_sent s where s.ticket_id = t.id and s.alert_type = 'resolution_warn_75'
       )
       and now() >= (t.created_at + ((t.resolution_due_at - t.created_at) * 0.75))
       and now() < t.resolution_due_at
     limit 200`
  );

  for (const r of warnRows.rows) {
    await pool.query(
      `insert into sla_alerts_sent (ticket_id, organisation_id, alert_type, sent_at, metadata_json)
       values ($1,$2,'resolution_warn_75',now(),'{}'::jsonb)
       on conflict do nothing`,
      [r.ticket_id, r.organisation_id]
    );
    await appendTicketEvent({
      ticketId: r.ticket_id,
      organisationId: r.organisation_id,
      eventType: "sla_warning",
      metadata: { type: "resolution_warn_75" },
    });
  }

  // Breach and auto-escalate.
  const breachRows = await pool.query<{
    ticket_id: number;
    organisation_id: number;
    status: string;
  }>(
    `select t.id as ticket_id, t.organisation_id, t.status
     from tickets t
     where t.status in ('open','reopened')
       and t.resolution_due_at is not null
       and now() >= t.resolution_due_at
       and not exists (
         select 1 from sla_alerts_sent s where s.ticket_id = t.id and s.alert_type = 'resolution_breach'
       )
     limit 200`
  );

  for (const r of breachRows.rows) {
    await pool.query("begin");
    try {
      await pool.query(
        `insert into sla_alerts_sent (ticket_id, organisation_id, alert_type, sent_at, metadata_json)
         values ($1,$2,'resolution_breach',now(),'{}'::jsonb)
         on conflict do nothing`,
        [r.ticket_id, r.organisation_id]
      );
      await pool.query(
        `update tickets
         set status = 'escalated', updated_at = now()
         where id = $1 and organisation_id = $2 and status in ('open','reopened')`,
        [r.ticket_id, r.organisation_id]
      );
      await pool.query(
        `update ticket_workflow_state
         set escalated_count = escalated_count + 1, last_escalated_at = now(), updated_at = now()
         where ticket_id = $1`,
        [r.ticket_id]
      );
      await appendTicketEvent({
        ticketId: r.ticket_id,
        organisationId: r.organisation_id,
        eventType: "status_changed",
        oldValues: { status: r.status },
        newValues: { status: "escalated" },
        metadata: { reason: "sla_resolution_breach" },
      });
      await pool.query("commit");
    } catch {
      await pool.query("rollback");
    }
  }
}

export async function runAutoCloseTick() {
  const rows = await pool.query<{ id: number; organisation_id: number }>(
    `select id, organisation_id
     from tickets
     where status = 'resolved'
       and resolved_at is not null
       and resolved_at <= (now() - interval '7 days')
     limit 200`
  );
  for (const r of rows.rows) {
    await pool.query("begin");
    try {
      await pool.query(
        `update tickets
         set status = 'closed', closed_at = now(), updated_at = now()
         where id = $1 and organisation_id = $2 and status = 'resolved'`,
        [r.id, r.organisation_id]
      );
      await appendTicketEvent({
        ticketId: r.id,
        organisationId: r.organisation_id,
        eventType: "status_changed",
        oldValues: { status: "resolved" },
        newValues: { status: "closed" },
        metadata: { reason: "auto_close_after_7_days" },
      });
      await pool.query("commit");
    } catch {
      await pool.query("rollback");
    }
  }
}

