import type { Request, Response } from "express";
import { pool } from "../db/pool.js";
import { asInt } from "./admin/adminUtils.js";
import {
  parseAddTicketMessageBody,
  parseAssignBody,
  parseCreateTicketBody,
  parseEscalateBody,
  parseCustomerEscalationBody,
  parseReopenBody,
  parseStatusChangeBody,
  parseTicketIdParam,
  parseTicketListFilterQuery,
  type TicketPriority,
  type TicketChannel,
} from "./tickets.dto.js";
import { notifyTeamLeadsNoAvailableAgent } from "../services/tickets/teamLeadAssignmentNotify.js";
import { createUserNotification } from "../services/notifications/userNotifications.js";
import { env } from "../config/env.js";
import { getNotificationEmailTemplate } from "../services/notifications/loadNotificationEmailTemplate.js";
import { insertNotificationEmailLog } from "../services/notifications/notificationEmailLog.js";
import { resolveNotificationRecipientEmail } from "../services/notifications/organizationEmailStatus.js";
import { renderNotificationPlaceholders } from "../services/notifications/renderTemplate.js";
import { sendSmtpEmail } from "../services/notifications/sendSmtpEmail.js";
import {
  buildTicketScopePredicate,
  canDo,
  canViewScreen,
  getEffectivePolicyForRequest,
} from "../authz/policy.js";
import { appendPermissionDeniedAudit } from "../authz/denyAudit.js";

type TicketStatus = "new" | "open" | "pending" | "escalated" | "resolved" | "closed" | "cancelled" | "reopened";
const VALID_NEXT: Record<TicketStatus, TicketStatus[]> = {
  new: ["open", "cancelled"],
  open: ["pending", "escalated", "resolved"],
  pending: ["open", "resolved"],
  escalated: ["open", "resolved"],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
  cancelled: [],
  reopened: ["open", "escalated"],
};

/** Statuses where a customer may request escalation (separate from agent VALID_NEXT). */
const CUSTOMER_CAN_REQUEST_ESCALATION_STATUSES = new Set<TicketStatus>(["new", "open", "pending", "reopened"]);

const MS_24H = 24 * 60 * 60 * 1000;

async function logDenied(req: Request, organisationId: number, action: string, summary: string) {
  try {
    await appendPermissionDeniedAudit(req, organisationId, action, summary);
  } catch {
    // Best-effort only; authorization response should not fail if audit insert fails.
  }
}

async function getCustomerEscalationEligibility(args: {
  ticketId: number;
  organisationId: number;
  status: TicketStatus;
  ticketCreatedAt: Date;
}): Promise<{ eligible: boolean; error?: string }> {
  if (!CUSTOMER_CAN_REQUEST_ESCALATION_STATUSES.has(args.status)) {
    return { eligible: false };
  }
  const lastAgentRes = await pool.query<{ last_at: Date | null }>(
    `select max(created_at) as last_at
     from ticket_messages
     where ticket_id = $1 and organisation_id = $2
       and author_type = 'agent'
       and coalesce(is_internal, false) = false`,
    [args.ticketId, args.organisationId]
  );
  const lastAgentAt = lastAgentRes.rows[0]?.last_at;
  const baselineMs = lastAgentAt ? new Date(lastAgentAt).getTime() : new Date(args.ticketCreatedAt).getTime();
  if (Date.now() - baselineMs < MS_24H) {
    return {
      eligible: false,
      error: "escalation is available after 24 hours without an agent reply",
    };
  }
  return { eligible: true };
}

function currentOrgId(req: Request): number | null {
  return asInt(req.user?.org_id);
}

function currentUserId(req: Request): number | null {
  return asInt(req.user?.user_id);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStartLevelValue(value: unknown): string | null {
  const s = asNonEmptyString(value);
  if (!s) return null;
  const up = s.toUpperCase().replace(/\s+/g, "");
  if (/^L\d+$/.test(up)) return up;
  if (/^LEVEL\d+$/.test(up)) return `L${up.slice("LEVEL".length)}`;
  return null;
}

function normalizePriority(raw: unknown): TicketPriority {
  const p = String(raw ?? "P3").toUpperCase();
  if (p === "P1" || p === "P2" || p === "P3" || p === "P4") return p;
  return "P3";
}

function normalizeIdArray(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && Number.isInteger(n));
  }
  const one = Number(raw);
  return Number.isFinite(one) && Number.isInteger(one) ? [one] : [];
}

function safeJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return asObject(parsed) ?? {};
  } catch {
    return {};
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

function matchesRoutingRule(
  conditions: Record<string, unknown>,
  input: {
    productId: number;
    categoryId: number | null;
    subcategoryId: number | null;
    priority: TicketPriority;
    channel: TicketChannel;
    affectedUsers: number | null;
    keywordSource: string;
  }
) {
  const productIds = normalizeIdArray(
    conditions.product_ids ?? conditions.product_id ?? conditions.productIds ?? conditions.productId
  );
  const categoryIds = normalizeIdArray(
    conditions.category_ids ?? conditions.category_id ?? conditions.categoryIds ?? conditions.categoryId
  );
  const subCategoryIds = normalizeIdArray(
    conditions.sub_category_ids ??
      conditions.sub_category_id ??
      conditions.subcategory_ids ??
      conditions.subcategory_id ??
      conditions.subCategoryIds ??
      conditions.subCategoryId
  );

  if (productIds.length > 0 && !productIds.includes(input.productId)) return false;
  if (categoryIds.length > 0 && (!input.categoryId || !categoryIds.includes(input.categoryId))) return false;
  if (subCategoryIds.length > 0 && (!input.subcategoryId || !subCategoryIds.includes(input.subcategoryId))) return false;

  const priorities = toStringArray(conditions.priorities ?? (conditions.priority ? [String(conditions.priority)] : []))
    .map((x) => x.toUpperCase());
  if (priorities.length > 0 && !priorities.includes(input.priority)) return false;

  const channels = toStringArray(conditions.channels ?? (conditions.channel ? [String(conditions.channel)] : []))
    .map((x) => x.toLowerCase());
  if (channels.length > 0 && !channels.includes(input.channel)) return false;

  const minAffectedUsers = asInt(conditions.min_affected_users);
  const maxAffectedUsers = asInt(conditions.max_affected_users);
  if (minAffectedUsers && (input.affectedUsers ?? 0) < minAffectedUsers) return false;
  if (maxAffectedUsers && input.affectedUsers !== null && input.affectedUsers > maxAffectedUsers) return false;

  const keywordsAny = toStringArray(conditions.keywords_any).map((k) => k.toLowerCase());
  const keywordsAll = toStringArray(conditions.keywords_all).map((k) => k.toLowerCase());
  const text = input.keywordSource.toLowerCase();
  if (keywordsAny.length > 0 && !keywordsAny.some((k) => text.includes(k))) return false;
  if (keywordsAll.length > 0 && !keywordsAll.every((k) => text.includes(k))) return false;

  return true;
}

function matchesRoutingRuleByHierarchy(
  conditions: Record<string, unknown>,
  input: {
    productId: number;
    categoryId: number | null;
    subcategoryId: number | null;
  }
) {
  const productIds = normalizeIdArray(
    conditions.product_ids ?? conditions.product_id ?? conditions.productIds ?? conditions.productId
  );
  const categoryIds = normalizeIdArray(
    conditions.category_ids ?? conditions.category_id ?? conditions.categoryIds ?? conditions.categoryId
  );
  const subCategoryIds = normalizeIdArray(
    conditions.sub_category_ids ??
      conditions.sub_category_id ??
      conditions.subcategory_ids ??
      conditions.subcategory_id ??
      conditions.subCategoryIds ??
      conditions.subCategoryId
  );

  if (productIds.length > 0 && !productIds.includes(input.productId)) return false;
  if (categoryIds.length > 0 && (!input.categoryId || !categoryIds.includes(input.categoryId))) return false;
  if (subCategoryIds.length > 0 && (!input.subcategoryId || !subCategoryIds.includes(input.subcategoryId))) return false;
  return true;
}

async function resolvePriorityFromPriorityMaster(input: {
  organisationId: number;
  productId: number;
  categoryId: number | null;
  subcategoryId: number | null;
}): Promise<{ priority: TicketPriority; priorityMasterId: number } | null> {
  if (input.categoryId == null || input.subcategoryId == null) return null;

  const r = await pool.query<{ id: number; priority: string }>(
    `select id, priority
     from subcategory_priority_master
     where organisation_id = $1
       and product_id = $2
       and category_id = $3
       and sub_category_id = $4
     limit 1`,
    [input.organisationId, input.productId, input.categoryId, input.subcategoryId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const raw = asNonEmptyString(row.priority);
  if (!raw) return null;
  return { priority: normalizePriority(raw), priorityMasterId: row.id };
}

async function resolveL3QueueForProduct(
  organisationId: number,
  productId: number
): Promise<{ queueId: number | null; teamId: number | null }> {
  const ranked = await pool.query<{ id: number; team_id: number | null }>(
    `select q.id, q.team_id
     from queues q
     left join teams t on t.id = q.team_id and t.organisation_id = q.organisation_id
     where q.organisation_id = $1 and q.product_id = $2
       and (
         lower(q.name) ~ '(^|[^a-z0-9])l3([^a-z0-9]|$)'
         or lower(q.name) like '%l3 queue%'
         or lower(q.name) like '%level 3%'
         or lower(coalesce(t.name, '')) ~ '(^|[^a-z0-9])l3([^a-z0-9]|$)'
       )
     order by
       case
         when (
           (lower(q.name) like '%p1%' or lower(q.name) like '%priority 1%')
           and (
             lower(q.name) ~ '(^|[^a-z0-9])l3([^a-z0-9]|$)'
             or lower(q.name) like '%l3 queue%'
             or lower(q.name) like '%level 3%'
           )
         ) then 0
         when (
           lower(q.name) ~ '(^|[^a-z0-9])l3([^a-z0-9]|$)'
           or lower(q.name) like '%l3 queue%'
           or lower(q.name) like '%level 3%'
         ) then 1
         else 2
       end asc,
       q.id asc
     limit 1`,
    [organisationId, productId]
  );
  const row = ranked.rows[0];
  return { queueId: row?.id ?? null, teamId: row?.team_id ?? null };
}

async function loadUserSupportLevelKey(organisationId: number, userId: number): Promise<string | null> {
  const levelRes = await pool.query<{ support_level_key: string | null }>(
    `select
       coalesce(
         nullif(upper(regexp_replace(coalesce(osl.code, ''), '\\s+', '', 'g')), ''),
         nullif(upper(regexp_replace(coalesce(osl.name, ''), '\\s+', '', 'g')), '')
       ) as support_level_key
     from user_org_support_levels uosl
     join org_support_levels osl on osl.id = uosl.support_level_id
     where uosl.user_id = $1
       and uosl.is_active = true
       and osl.organisation_id = $2
     order by uosl.updated_at desc, uosl.id desc
     limit 1`,
    [userId, organisationId]
  );
  return levelRes.rows[0]?.support_level_key ?? null;
}

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

async function ensureSlaInstanceForTicket(args: {
  ticketId: number;
  organisationId: number;
  priority: TicketPriority;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
}) {
  await pool.query(
    `insert into ticket_sla_instances
      (ticket_id, organisation_id, priority, first_response_due_at, resolution_due_at, created_at, updated_at)
     values ($1,$2,$3,$4,$5,now(),now())
     on conflict (ticket_id)
     do update set priority = excluded.priority,
                   first_response_due_at = excluded.first_response_due_at,
                   resolution_due_at = excluded.resolution_due_at,
                   updated_at = now()`,
    [args.ticketId, args.organisationId, args.priority, args.firstResponseDueAt, args.resolutionDueAt]
  );
}

async function pauseSlaTimer(ticketId: number, organisationId: number) {
  await pool.query(
    `insert into ticket_sla_pauses (ticket_id, organisation_id, pause_started_at, reason, created_at)
     select $1, $2, now(), 'pending_status', now()
     where not exists (
       select 1 from ticket_sla_pauses where ticket_id = $1 and pause_ended_at is null
     )`,
    [ticketId, organisationId]
  );
}

async function resumeSlaTimer(ticketId: number, organisationId: number) {
  const activePause = await pool.query<{ id: number; pause_started_at: string }>(
    `select id, pause_started_at
     from ticket_sla_pauses
     where ticket_id = $1 and organisation_id = $2 and pause_ended_at is null
     order by id desc
     limit 1`,
    [ticketId, organisationId]
  );
  if (activePause.rowCount === 0) return;
  const pause = activePause.rows[0]!;
  await pool.query(
    `update ticket_sla_pauses
     set pause_ended_at = now()
     where id = $1`,
    [pause.id]
  );
  await pool.query(
    `update ticket_sla_instances
     set first_response_due_at = case when first_response_due_at is null then null else first_response_due_at + (now() - $3::timestamptz) end,
         resolution_due_at = case when resolution_due_at is null then null else resolution_due_at + (now() - $3::timestamptz) end,
         paused_total_seconds = paused_total_seconds + greatest(0, extract(epoch from (now() - $3::timestamptz))::bigint),
         updated_at = now()
     where ticket_id = $1 and organisation_id = $2`,
    [ticketId, organisationId, pause.pause_started_at]
  );
  await pool.query(
    `update tickets t
     set first_response_due_at = s.first_response_due_at,
         resolution_due_at = s.resolution_due_at,
         updated_at = now()
     from ticket_sla_instances s
     where t.id = s.ticket_id
       and t.id = $1
       and t.organisation_id = $2`,
    [ticketId, organisationId]
  );
}

async function allocateTicketNumber(organisationId: number, productId: number) {
  const up = await pool.query<{ last_value: number }>(
    `insert into ticket_counters (organisation_id, product_id, last_value, updated_at)
     values ($1,$2,1,now())
     on conflict (organisation_id, product_id)
     do update set last_value = ticket_counters.last_value + 1, updated_at = now()
     returning last_value`,
    [organisationId, productId]
  );
  return up.rows[0]!.last_value;
}

type AssignmentBlockReason = "unavailable" | "out_of_office";

async function selectLeastLoadedAssigneeByLevel(args: {
  organisationId: number;
  teamId: number;
  startLevel: string | null;
}): Promise<{ assigneeUserId: number | null; assigneeOpenCount: number | null; blockReason: AssignmentBlockReason | null }> {
  const { organisationId, teamId } = args;
  const levelKey = typeof args.startLevel === "string" ? args.startLevel.trim().toUpperCase() : "";
  const applyLevelFilter = /^L\d+$/.test(levelKey);
  const levelNum = applyLevelFilter ? Number(levelKey.slice(1)) : null;

  const candidate = await pool.query<{ user_id: number; open_count: number }>(
    `with open_counts as (
       select assignee_user_id as user_id, count(*)::int as open_count
       from tickets
       where organisation_id = $1
         and assignee_user_id is not null
         and status in ('new','open','pending','escalated','reopened')
       group by assignee_user_id
     ),
     member_base as (
       select tm.user_id,
              lower(coalesce(u.status, 'inactive')) as user_status,
              coalesce(u.out_of_office, false) as out_of_office,
              tm.max_open_tickets_cap,
              coalesce(oc.open_count, 0) as open_count,
              (
                select
                  coalesce(
                    nullif(upper(regexp_replace(coalesce(osl.code, ''), '\\s+', '', 'g')), ''),
                    nullif(upper(regexp_replace(coalesce(osl.name, ''), '\\s+', '', 'g')), '')
                  )
                from user_org_support_levels uosl
                join org_support_levels osl on osl.id = uosl.support_level_id
                where uosl.user_id = tm.user_id
                  and uosl.is_active = true
                  and osl.organisation_id = $1
                order by uosl.updated_at desc, uosl.id desc
                limit 1
              ) as support_level_key
       from team_members tm
       join users u on u.user_id = tm.user_id and u.organisation_id = $1
       left join open_counts oc on oc.user_id = tm.user_id
       where tm.team_id = $2
     )
     select mb.user_id, mb.open_count
     from member_base mb
    where (
      $3::boolean = false
      or mb.support_level_key = $4::text
      or mb.support_level_key = ('LEVEL' || $5::text)
      or (
        $5::int is not null
        and regexp_replace(coalesce(mb.support_level_key, ''), '[^0-9]', '', 'g') = $5::text
      )
    )
       and mb.user_status = 'active'
       and mb.out_of_office = false
       and (mb.max_open_tickets_cap is null or mb.open_count < mb.max_open_tickets_cap)
     order by mb.open_count asc, mb.user_id asc
     limit 1`,
    [organisationId, teamId, applyLevelFilter, levelKey, levelNum]
  );
  const assigneeRaw = candidate.rows[0]?.user_id ?? null;
  const assigneeUserId = assigneeRaw === null ? null : asInt(assigneeRaw);
  if (assigneeUserId !== null) {
    return {
      assigneeUserId,
      assigneeOpenCount: asInt(candidate.rows[0]?.open_count) ?? 0,
      blockReason: null,
    };
  }

  const summary = await pool.query<{
    active_non_ooo_count: number;
    active_ooo_count: number;
  }>(
    `with open_counts as (
       select assignee_user_id as user_id, count(*)::int as open_count
       from tickets
       where organisation_id = $1
         and assignee_user_id is not null
         and status in ('new','open','pending','escalated','reopened')
       group by assignee_user_id
     ),
     member_base as (
       select tm.user_id,
              lower(coalesce(u.status, 'inactive')) as user_status,
              coalesce(u.out_of_office, false) as out_of_office,
              tm.max_open_tickets_cap,
              coalesce(oc.open_count, 0) as open_count,
              (
                select
                  coalesce(
                    nullif(upper(regexp_replace(coalesce(osl.code, ''), '\\s+', '', 'g')), ''),
                    nullif(upper(regexp_replace(coalesce(osl.name, ''), '\\s+', '', 'g')), '')
                  )
                from user_org_support_levels uosl
                join org_support_levels osl on osl.id = uosl.support_level_id
                where uosl.user_id = tm.user_id
                  and uosl.is_active = true
                  and osl.organisation_id = $1
                order by uosl.updated_at desc, uosl.id desc
                limit 1
              ) as support_level_key
       from team_members tm
       join users u on u.user_id = tm.user_id and u.organisation_id = $1
       left join open_counts oc on oc.user_id = tm.user_id
       where tm.team_id = $2
     )
     select
       count(*) filter (
        where (
          $3::boolean = false
          or mb.support_level_key = $4::text
          or mb.support_level_key = ('LEVEL' || $5::text)
          or (
            $5::int is not null
            and regexp_replace(coalesce(mb.support_level_key, ''), '[^0-9]', '', 'g') = $5::text
          )
        )
           and mb.user_status = 'active'
           and mb.out_of_office = false
       )::int as active_non_ooo_count,
       count(*) filter (
        where (
          $3::boolean = false
          or mb.support_level_key = $4::text
          or mb.support_level_key = ('LEVEL' || $5::text)
          or (
            $5::int is not null
            and regexp_replace(coalesce(mb.support_level_key, ''), '[^0-9]', '', 'g') = $5::text
          )
        )
           and mb.user_status = 'active'
           and mb.out_of_office = true
       )::int as active_ooo_count
     from member_base mb`,
    [organisationId, teamId, applyLevelFilter, levelKey, levelNum]
  );
  const activeNonOoo = summary.rows[0]?.active_non_ooo_count ?? 0;
  const activeOoo = summary.rows[0]?.active_ooo_count ?? 0;
  const blockReason: AssignmentBlockReason = activeNonOoo === 0 && activeOoo > 0 ? "out_of_office" : "unavailable";
  return { assigneeUserId: null, assigneeOpenCount: null, blockReason };
}

async function listOrgAdminUserIds(organisationId: number): Promise<number[]> {
  const adminUsers = await pool.query<{ user_id: number }>(
    `select distinct ur.user_id::int as user_id
     from user_roles ur
     join roles r on r.id = ur.role_id
     join users u on u.user_id = ur.user_id and u.organisation_id = $1
     where (
       ur.scope_organisation_id = $1
       or (ur.scope_organisation_id is null and r.organisation_id = $1)
     )
       and lower(coalesce(u.status, 'inactive')) = 'active'
       and lower(regexp_replace(coalesce(r.name, ''), '[\\s-]+', '_', 'g')) in (
         'admin',
         'administrator',
         'org_admin',
         'organization_admin',
         'organisation_admin',
         'system_admin',
         'systemadministrator',
         'systemadministrator_role'
       )`,
    [organisationId]
  );
  return adminUsers.rows.map((r) => asInt(r.user_id)).filter((id): id is number => Number.isInteger(id));
}

async function notifyUsersForTicketEvent(args: {
  organisationId: number;
  ticketId: number;
  actorUserId: number | null;
  eventKey: string;
  title: string;
  message: string;
  recipientUserIds: Array<number | null | undefined>;
}) {
  const recipients = Array.from(
    new Set(
      args.recipientUserIds.filter(
        (id): id is number => Number.isInteger(id) && id !== args.actorUserId
      )
    )
  );
  for (const userId of recipients) {
    await createUserNotification({
      organisationId: args.organisationId,
      userId,
      ticketId: args.ticketId,
      eventKey: args.eventKey,
      title: args.title,
      message: args.message,
      navigateUrl: `/tickets/${args.ticketId}`,
      createdByUserId: args.actorUserId,
    });
  }

  if (recipients.length === 0) return;

  const ticketRes = await pool.query<{
    ticket_code: string;
    subject: string;
    status: string;
  }>(
    `select ticket_code, subject, status
     from tickets
     where id = $1 and organisation_id = $2
     limit 1`,
    [args.ticketId, args.organisationId]
  );
  const ticket = ticketRes.rows[0];
  if (!ticket) return;

  const usersRes = await pool.query<{ user_id: number; email: string | null; name: string | null }>(
    `select user_id, email, name
     from users
     where organisation_id = $1
       and user_id = any($2::bigint[])
       and lower(status) = 'active'`,
    [args.organisationId, recipients]
  );

  if (usersRes.rows.length === 0) return;

  const tmpl = await getNotificationEmailTemplate(args.organisationId, args.eventKey);
  const ticketUrl = `${env.ticketPortalBaseUrl}/tickets/${encodeURIComponent(String(args.ticketId))}`;
  const baseVars: Record<string, string> = {
    ticket_id: String(args.ticketId),
    ticket_code: ticket.ticket_code,
    ticket_subject: ticket.subject ?? "",
    latest_message: args.message ?? "",
    ticket_url: ticketUrl,
    csat_link: `${ticketUrl}?tab=csat`,
  };

  for (const user of usersRes.rows) {
    const intendedTo = String(user.email ?? "").trim();
    if (!intendedTo) continue;

    const vars = {
      ...baseVars,
      recipient_name: (user.name ?? "").trim() || "User",
      user_name: (user.name ?? "").trim() || "User",
    };
    const subject = renderNotificationPlaceholders(tmpl.subject || args.title, vars);
    const html = renderNotificationPlaceholders(tmpl.body, vars);
    let routedTo: string | null = null;

    try {
      const resolved = await resolveNotificationRecipientEmail({
        organisationId: args.organisationId,
        intendedTo,
        product: "ticket",
      });
      if (!resolved.ok) {
        await insertNotificationEmailLog({
          organisationId: args.organisationId,
          ticketId: args.ticketId,
          ticketStatus: ticket.status,
          notificationKey: args.eventKey,
          product: "ticket",
          mailFrom: env.smtpFrom,
          recipientIntended: intendedTo,
          recipientActual: null,
          subject,
          sendStatus: "skipped",
          errorMessage: resolved.reason,
          contextJson: {
            event_key: args.eventKey,
            sender_email: env.smtpFrom,
            recipient_email_intended: intendedTo,
            skip_reason: resolved.reason,
          },
        });
        continue;
      }

      routedTo = resolved.to;
      const smtp = await sendSmtpEmail({ to: resolved.to, subject, html });
      const sendStatus = smtp.sent
        ? "sent"
        : smtp.reason === "notifications_disabled"
          ? "disabled"
          : "no_smtp";

      await insertNotificationEmailLog({
        organisationId: args.organisationId,
        ticketId: args.ticketId,
        ticketStatus: ticket.status,
        notificationKey: args.eventKey,
        product: "ticket",
        mailFrom: env.smtpFrom,
        recipientIntended: intendedTo,
        recipientActual: resolved.to,
        subject,
        sendStatus,
        errorMessage: smtp.sent ? null : (smtp.reason ?? null),
        contextJson: {
          event_key: args.eventKey,
          sender_email: env.smtpFrom,
          recipient_email_intended: intendedTo,
          recipient_email_actual: resolved.to,
          routed_to_sandbox: resolved.to !== intendedTo,
          html_length: html.length,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await insertNotificationEmailLog({
        organisationId: args.organisationId,
        ticketId: args.ticketId,
        ticketStatus: ticket.status,
        notificationKey: args.eventKey,
        product: "ticket",
        mailFrom: env.smtpFrom,
        recipientIntended: intendedTo,
        recipientActual: routedTo,
        subject,
        sendStatus: "failed",
        errorMessage: msg,
        contextJson: {
          event_key: args.eventKey,
          sender_email: env.smtpFrom,
          recipient_email_intended: intendedTo,
          recipient_email_actual: routedTo,
        },
      });
    }
  }
}

export async function createTicket(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  if (!orgId || !userId) return res.status(400).json({ ok: false, error: "invalid user context" });

  const parsed = parseCreateTicketBody(req.body);
  if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
  const dto = parsed.data;

  const productId = dto.productId;
  const categoryId = dto.categoryId;
  const subcategoryId = dto.subcategoryId;
  const subject = dto.subject;
  const description = dto.description;
  const channel = dto.channel;
  const requestedPriority = dto.priority;
  const metadata = dto.metadata;
  const affectedUsers = dto.affectedUsers;

  await pool.query("begin");
  try {
    const prodRes = await pool.query<{
      id: number;
      default_ticket_prefix: string;
      default_routing_queue_id: number | null;
      enabled: boolean;
    }>(
      `select p.id, p.default_ticket_prefix, op.default_routing_queue_id, op.enabled
       from products p
       join organisation_products op
         on op.product_id = p.id and op.organisation_id = $1
       where p.id = $2`,
      [orgId, productId]
    );
    if (prodRes.rowCount === 0) {
      await pool.query("rollback");
      return res.status(400).json({ ok: false, error: "product is not available for this organisation" });
    }
    const product = prodRes.rows[0]!;
    if (!product.enabled) {
      await pool.query("rollback");
      return res.status(400).json({ ok: false, error: "product is disabled for this organisation" });
    }

    if (categoryId) {
      const catRes = await pool.query(
        `select 1
         from product_categories
         where id = $1 and organisation_id = $2 and product_id = $3 and is_active = true`,
        [categoryId, orgId, productId]
      );
      if (catRes.rowCount === 0) {
        await pool.query("rollback");
        return res.status(400).json({ ok: false, error: "invalid category_id" });
      }
    }

    if (subcategoryId) {
      const subRes = await pool.query(
        `select 1
         from product_subcategories ps
         join product_categories pc on pc.id = ps.category_id
         where ps.id = $1 and pc.organisation_id = $2 and pc.product_id = $3 and ps.is_active = true`,
        [subcategoryId, orgId, productId]
      );
      if (subRes.rowCount === 0) {
        await pool.query("rollback");
        return res.status(400).json({ ok: false, error: "invalid subcategory_id" });
      }
    }

    const keywordText = `${subject} ${description}`.toLowerCase();
    let keywordRoutingEntryId: number | null = null;
    const kwRes = await pool.query<{ id: number; phrase_normalized: string }>(
      `select id, phrase_normalized
       from keyword_routing_entries
       where organisation_id = $1 and product_id = $2 and is_active = true
       order by char_length(phrase_normalized) desc, id asc`,
      [orgId, productId]
    );
    for (const row of kwRes.rows) {
      if (keywordText.includes(row.phrase_normalized)) {
        keywordRoutingEntryId = row.id;
        break;
      }
    }

    let selectedRuleId: number | null = null;
    let queueId: number | null = null;
    let teamId: number | null = null;
    let startLevel: string | null = null;
    let finalPriority: TicketPriority = requestedPriority;
    let priorityMasterAppliedId: number | null = null;

    if (keywordRoutingEntryId !== null) {
      finalPriority = "P1";
      startLevel = "L3";
      const l3 = await resolveL3QueueForProduct(orgId, productId);
      queueId = l3.queueId;
      teamId = l3.teamId;
    } else {
      const rulesRes = await pool.query<{ id: number; conditions_json: string | null; actions_json: string | null }>(
        `select id, conditions_json, actions_json
         from routing_rules
         where organisation_id = $1 and is_active = true
         order by id asc`,
        [orgId]
      );

      for (const row of rulesRes.rows) {
        const conditions = safeJsonObject(row.conditions_json);
        if (
          !matchesRoutingRuleByHierarchy(conditions, {
            productId,
            categoryId: categoryId ?? null,
            subcategoryId: subcategoryId ?? null,
          })
        ) {
          continue;
        }
        const actions = safeJsonObject(row.actions_json);
        selectedRuleId = row.id;
        queueId = asInt(actions.queue_id ?? actions.queueId ?? actions.target_queue_id ?? actions.targetQueueId);
        teamId = asInt(actions.team_id ?? actions.teamId ?? actions.target_team_id ?? actions.targetTeamId);
        // Primary contract: actions_json.start_with
        startLevel =
          normalizeStartLevelValue(actions.startLevel) ??
          normalizeStartLevelValue(actions.start_with) ??
          normalizeStartLevelValue(actions.start_level) ??
          normalizeStartLevelValue(actions.startLevelKey) ??
          normalizeStartLevelValue(conditions.start_level) ??
          normalizeStartLevelValue(conditions.startLevel) ??
          "L1";
        break;
      }
    }

    const priorityMaster = await resolvePriorityFromPriorityMaster({
      organisationId: orgId,
      productId,
      categoryId: categoryId ?? null,
      subcategoryId: subcategoryId ?? null,
    });
    if (priorityMaster) {
      finalPriority = priorityMaster.priority;
      priorityMasterAppliedId = priorityMaster.priorityMasterId;
    }

    const ticketMetadata: Record<string, unknown> = { ...metadata };
    if (keywordRoutingEntryId !== null) {
      ticketMetadata.keyword_routing = { matched: true, entry_id: keywordRoutingEntryId };
    }
    if (priorityMasterAppliedId !== null) {
      ticketMetadata.priority_master = {
        priority_master_id: priorityMasterAppliedId,
        priority: finalPriority,
      };
    }
    ticketMetadata.assignment = {
      keyword_routing_entry_id: keywordRoutingEntryId,
      routing_rule_id: selectedRuleId,
      start_level: startLevel,
    };

    if (selectedRuleId !== null && !queueId && teamId) {
      const queueFromTeam = await pool.query<{ id: number }>(
        `select id
         from queues
         where organisation_id = $1 and product_id = $2 and team_id = $3
         order by id asc
         limit 1`,
        [orgId, productId, teamId]
      );
      queueId = queueFromTeam.rows[0]?.id ?? null;
    }

    // If a routing rule matched but did not provide explicit queue/team,
    // fall back to organisation product defaults instead of leaving ids null.
    if (!queueId && selectedRuleId !== null) {
      queueId = product.default_routing_queue_id ?? null;
    }

    const hasExplicitRouting = keywordRoutingEntryId !== null || selectedRuleId !== null;
    if (!hasExplicitRouting) {
      queueId = null;
      teamId = null;
      startLevel = null;
    } else if (queueId && !teamId) {
      const qr = await pool.query<{ team_id: number | null }>(
        "select team_id from queues where id = $1 and organisation_id = $2",
        [queueId, orgId]
      );
      teamId = qr.rows[0]?.team_id ?? null;
    }

    let assigneeUserId: number | null = null;
    let assigneeBlockReason: AssignmentBlockReason | null = null;
    if (hasExplicitRouting && teamId && assigneeUserId === null) {
      const assignment = await selectLeastLoadedAssigneeByLevel({
        organisationId: orgId,
        teamId,
        startLevel,
      });
      assigneeUserId = assignment.assigneeUserId;
      assigneeBlockReason = assignment.blockReason;
    }
    if (!startLevel && assigneeUserId) {
      const inferredLevel = await loadUserSupportLevelKey(orgId, assigneeUserId);
      if (inferredLevel && /^L\d+$/.test(inferredLevel)) {
        startLevel = inferredLevel;
      } else if (inferredLevel && /^LEVEL\d+$/.test(inferredLevel)) {
        startLevel = `L${inferredLevel.slice("LEVEL".length)}`;
      }
    }
    ticketMetadata.assignment = {
      ...(ticketMetadata.assignment as Record<string, unknown>),
      keyword_routing_entry_id: keywordRoutingEntryId,
      routing_rule_id: selectedRuleId,
      start_level: startLevel,
      assignee_user_id: assigneeUserId,
      block_reason: assigneeBlockReason,
    };

    const activePolicy = await pool.query<{ first_response_mins: number; resolution_mins: number }>(
      `select first_response_mins, resolution_mins
       from sla_policies
       where organisation_id = $1
         and lower(tier) = 'tier1'
         and upper(priority) = $2
         and is_active = true
       order by id asc
       limit 1`,
      [orgId, finalPriority]
    );
    const firstResponseMins = activePolicy.rows[0]?.first_response_mins ?? null;
    const resolutionMins = activePolicy.rows[0]?.resolution_mins ?? null;

    const ticketNumber = await allocateTicketNumber(orgId, productId);
    const ticketCode = `${product.default_ticket_prefix}-${String(ticketNumber).padStart(5, "0")}`;

    const initialStatus: TicketStatus = hasExplicitRouting ? "open" : "new";

    const inserted = await pool.query<{
      id: number;
      ticket_code: string;
      status: TicketStatus;
      assignee_user_id: number | null;
      queue_id: number | null;
      team_id: number | null;
      priority: TicketPriority;
      first_response_due_at: string | null;
      resolution_due_at: string | null;
    }>(
      `insert into tickets
        (organisation_id, ticket_code, ticket_number, channel, reporter_user_id, assignee_user_id, product_id,
         category_id, subcategory_id, subject, description, status, priority, queue_id, team_id,
         first_response_due_at, resolution_due_at, metadata_json, created_at, updated_at)
       values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         case when $16::int is null then null else now() + make_interval(mins => $16::int) end,
         case when $17::int is null then null else now() + make_interval(mins => $17::int) end,
         $18::jsonb, now(), now())
       returning id, ticket_code, status, assignee_user_id, queue_id, team_id, priority, first_response_due_at, resolution_due_at`,
      [
        orgId,
        ticketCode,
        ticketNumber,
        channel,
        userId,
        assigneeUserId,
        productId,
        categoryId ?? null,
        subcategoryId ?? null,
        subject,
        description,
        initialStatus,
        finalPriority,
        queueId,
        teamId,
        firstResponseMins,
        resolutionMins,
        JSON.stringify(ticketMetadata),
      ]
    );
    const ticket = inserted.rows[0]!;
    await ensureSlaInstanceForTicket({
      ticketId: ticket.id,
      organisationId: orgId,
      priority: finalPriority,
      firstResponseDueAt: ticket.first_response_due_at,
      resolutionDueAt: ticket.resolution_due_at,
    });
    await pool.query(
      `insert into ticket_workflow_state
        (ticket_id, organisation_id, sequence_id, current_step_order, escalated_count, created_at, updated_at)
       values ($1,$2,null,1,0,now(),now())
       on conflict (ticket_id) do nothing`,
      [ticket.id, orgId]
    );

    await pool.query(
      `insert into ticket_messages
        (ticket_id, organisation_id, author_user_id, author_type, body, is_internal, attachments_json, created_at)
       values ($1,$2,$3,'customer',$4,false,'[]'::jsonb,now())`,
      [ticket.id, orgId, userId, description]
    );

    if (teamId && assigneeUserId === null) {
      await notifyTeamLeadsNoAvailableAgent({
        organisationId: orgId,
        teamId,
        ticketId: ticket.id,
        ticketCode: ticket.ticket_code,
        context: "create",
        reason: assigneeBlockReason ?? "unavailable",
        startLevel,
      });
    }

    await appendTicketEvent({
      ticketId: ticket.id,
      organisationId: orgId,
      eventType: "ticket_created",
      actorUserId: userId,
      newValues: {
        status: initialStatus,
        priority: finalPriority,
        queue_id: queueId,
        team_id: teamId,
        assignee_user_id: assigneeUserId,
      },
      metadata: {
        channel,
        routing_rule_id: selectedRuleId,
        affected_users: affectedUsers,
        keyword_routing_entry_id: keywordRoutingEntryId,
        start_level: startLevel,
        assignee_block_reason: assigneeBlockReason,
      },
    });

    await notifyUsersForTicketEvent({
      organisationId: orgId,
      ticketId: ticket.id,
      actorUserId: userId,
      eventKey: "ticket_created",
      title: `New ticket ${ticket.ticket_code}`,
      message: `${subject.slice(0, 120)}`,
      recipientUserIds: hasExplicitRouting ? [assigneeUserId] : await listOrgAdminUserIds(orgId),
    });

    await pool.query("commit");
    return res.status(201).json({
      ok: true,
      data: {
        id: ticket.id,
        ticket_code: ticket.ticket_code,
        status: ticket.status,
        priority: ticket.priority,
        queue_id: ticket.queue_id,
        team_id: ticket.team_id,
        assignee_user_id: ticket.assignee_user_id,
        keyword_routing_entry_id: keywordRoutingEntryId,
        routing_rule_id: selectedRuleId,
      },
    });
  } catch (e) {
    await pool.query("rollback");
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "failed to create ticket" });
  }
}

export async function listMyTickets(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  if (!orgId || !userId) return res.status(400).json({ ok: false, error: "invalid user context" });

  const policy = await getEffectivePolicyForRequest(req);
  const canListMyByPolicy = canDo(policy, "tickets.list_my") || canDo(policy, "tickets.read");
  if (!canListMyByPolicy) {
    await logDenied(req, orgId, "tickets.list_my", "Denied my tickets access.");
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const query = `select t.id, t.ticket_code, t.product_id, t.category_id, t.subcategory_id, t.subject, t.status, t.priority,
                        t.reporter_user_id, t.assignee_user_id, t.queue_id, t.team_id,
                        t.first_response_due_at, t.resolution_due_at, t.created_at, t.updated_at, t.metadata_json,
                        coalesce(nullif(trim(ru.user_name), ''), ru.name) as reporter_name
                 from tickets t
                 left join users ru on ru.user_id = t.reporter_user_id and ru.organisation_id = t.organisation_id
                 where t.organisation_id = $1
                 order by t.updated_at desc
                 limit 100`;
  const result = await pool.query(query, [orgId]);
  const scope = buildTicketScopePredicate(policy);
  const filtered = result.rows.filter((row) =>
    scope(row as { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json?: unknown })
  );
  return res.json({ ok: true, data: filtered });
}

export async function listTickets(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  if (!orgId || !userId) return res.status(400).json({ ok: false, error: "invalid user context" });

  const policy = await getEffectivePolicyForRequest(req);
  const policyGate = canViewScreen(policy, "tickets") && canDo(policy, "tickets.list");
  if (!policyGate) {
    await logDenied(req, orgId, "tickets.list", "Denied tickets list access.");
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const parsed = parseTicketListFilterQuery(req.query);
  const filter = parsed.data;

  const where: string[] = ["t.organisation_id = $1"];
  const args: unknown[] = [orgId];
  let i = 2;

  if (filter.status) {
    where.push(`t.status = $${i++}`);
    args.push(filter.status);
  }
  if (filter.assigneeUserId) {
    where.push(`t.assignee_user_id = $${i++}`);
    args.push(filter.assigneeUserId);
  }
  if (filter.queueId) {
    where.push(`t.queue_id = $${i++}`);
    args.push(filter.queueId);
  }
  if (filter.teamId) {
    where.push(`t.team_id = $${i++}`);
    args.push(filter.teamId);
  }
  if (filter.productId) {
    where.push(`t.product_id = $${i++}`);
    args.push(filter.productId);
  }
  if (filter.priority) {
    where.push(`t.priority = $${i++}`);
    args.push(filter.priority);
  }
  if (filter.unassignedOnly) {
    where.push("t.assignee_user_id is null");
  }
  if (filter.search) {
    where.push(`(t.subject ilike $${i} or t.ticket_code ilike $${i})`);
    args.push(`%${filter.search}%`);
    i += 1;
  }

  const sql = `select t.id, t.ticket_code, t.product_id, t.category_id, t.subcategory_id, t.subject, t.status, t.priority,
                      t.reporter_user_id, t.assignee_user_id, t.queue_id, t.team_id, t.first_response_due_at,
                      t.resolution_due_at, t.created_at, t.updated_at, t.metadata_json,
                      coalesce(nullif(trim(ru.user_name), ''), ru.name) as reporter_name
               from tickets t
               left join users ru on ru.user_id = t.reporter_user_id and ru.organisation_id = t.organisation_id
               where ${where.join(" and ")}
               order by t.updated_at desc
               limit $${i}`;
  args.push(filter.limit);

  const result = await pool.query(sql, args);
  const policyScope = buildTicketScopePredicate(policy);
  const filtered = result.rows.filter((row) =>
    policyScope(row as { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json?: unknown })
  );
  return res.json({ ok: true, data: filtered });
}

export async function getTicketById(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  const parsedTicketId = parseTicketIdParam(req.params.id);
  if (!orgId || !userId || !parsedTicketId.ok) {
    return res.status(400).json({ ok: false, error: "invalid request" });
  }
  const ticketId = parsedTicketId.data;

  const policy = await getEffectivePolicyForRequest(req);
  const canReadByPolicy = canDo(policy, "tickets.read");
  const policyScope = buildTicketScopePredicate(policy);
  if (!canReadByPolicy) {
    await logDenied(req, orgId, "tickets.read", `Denied ticket read access for ticket ${ticketId}.`);
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const ticketRes = await pool.query(
    `select t.id, t.ticket_code, t.organisation_id, t.product_id, t.category_id, t.subcategory_id, t.subject, t.description,
            t.channel, t.status, t.priority, t.reporter_user_id, t.assignee_user_id, t.queue_id, t.team_id,
            t.first_response_due_at, t.resolution_due_at, t.created_at, t.updated_at, t.metadata_json,
            coalesce(nullif(trim(ru.user_name), ''), ru.name) as reporter_name
     from tickets t
     left join users ru on ru.user_id = t.reporter_user_id and ru.organisation_id = t.organisation_id
     where t.id = $1 and t.organisation_id = $2`,
    [ticketId, orgId]
  );
  if (ticketRes.rowCount === 0) return res.status(404).json({ ok: false, error: "ticket not found" });
  const ticket = ticketRes.rows[0] as any;

  // Keep a single row-scope decision path aligned with listTickets.
  if (
    !policyScope(
      ticket as { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json?: unknown }
    )
  ) {
    await logDenied(req, orgId, "tickets.read", `Denied ticket scope for ticket ${ticketId}.`);
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const viewerCanReadInternal = canDo(policy, "tickets.internal_notes.read");
  const messagesRes = await pool.query(
    `select id, ticket_id, author_user_id, author_type, body, is_internal, attachments_json, created_at
     from ticket_messages
     where ticket_id = $1 and organisation_id = $2
       and ($3::boolean = true or coalesce(is_internal, false) = false)
     order by created_at asc`,
    [ticketId, orgId, viewerCanReadInternal]
  );

  const eventsRes = await pool.query(
    `select id, event_type, actor_user_id, old_values, new_values, metadata_json, created_at
     from ticket_events
     where ticket_id = $1 and organisation_id = $2
     order by created_at asc`,
    [ticketId, orgId]
  );

  const attachmentsRes = await pool.query(
    `select id, ticket_id, message_id, uploader_user_id, file_name, file_url, mime_type, size_bytes, created_at
     from ticket_attachments
     where ticket_id = $1 and organisation_id = $2
     order by created_at asc`,
    [ticketId, orgId]
  );

  let canRequestEscalation = false;
  if (!viewerCanReadInternal && Number(ticket.reporter_user_id) === userId) {
    const elig = await getCustomerEscalationEligibility({
      ticketId,
      organisationId: orgId,
      status: ticket.status as TicketStatus,
      ticketCreatedAt: new Date(ticket.created_at),
    });
    canRequestEscalation = elig.eligible;
  }

  return res.json({
    ok: true,
    data: {
      ...ticket,
      messages: messagesRes.rows,
      events: eventsRes.rows,
      attachments: attachmentsRes.rows,
      can_request_escalation: canRequestEscalation,
    },
  });
}

export async function addTicketMessage(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  const parsedTicketId = parseTicketIdParam(req.params.id);
  if (!orgId || !userId || !parsedTicketId.ok) {
    return res.status(400).json({ ok: false, error: "invalid request" });
  }
  const ticketId = parsedTicketId.data;

  const parsedBody = parseAddTicketMessageBody(req.body);
  if (!parsedBody.ok) return res.status(400).json({ ok: false, error: parsedBody.error });
  const body = parsedBody.data.body;
  const wantsInternal = parsedBody.data.isInternal;

  const policy = await getEffectivePolicyForRequest(req);
  const canWriteInternal = canDo(policy, "tickets.internal_notes.read");
  const isAgent = canWriteInternal;
  const authorType = canWriteInternal ? "agent" : "customer";
  const isInternal = Boolean(canWriteInternal && wantsInternal);
  const canReplyByPolicy = canDo(policy, "tickets.reply") || canDo(policy, "tickets.read");
  const policyScope = buildTicketScopePredicate(policy);
  if (!canReplyByPolicy) {
    await logDenied(req, orgId, "tickets.reply", `Denied add message for ticket ${ticketId}.`);
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  await pool.query("begin");
  try {
    const ticketRes = await pool.query<{
      reporter_user_id: number;
      status: TicketStatus;
      assignee_user_id: number | null;
      metadata_json: unknown;
      ticket_code: string;
    }>(
      `select reporter_user_id, status, assignee_user_id, metadata_json, ticket_code
       from tickets
       where id = $1 and organisation_id = $2
       for update`,
      [ticketId, orgId]
    );
    if (ticketRes.rowCount === 0) {
      await pool.query("rollback");
      return res.status(404).json({ ok: false, error: "ticket not found" });
    }
    const ticket = ticketRes.rows[0]!;

    if (
      !policyScope(
        ticket as { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json?: unknown }
      )
    ) {
      await pool.query("rollback");
      await logDenied(req, orgId, "tickets.reply", `Denied message scope for ticket ${ticketId}.`);
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const messageRes = await pool.query(
      `insert into ticket_messages
        (ticket_id, organisation_id, author_user_id, author_type, body, is_internal, attachments_json, created_at)
       values ($1,$2,$3,$4,$5,$6,'[]'::jsonb,now())
       returning id, ticket_id, author_user_id, author_type, body, is_internal, attachments_json, created_at`,
      [ticketId, orgId, userId, authorType, body, isInternal]
    );

    let statusMoved = false;
    if (!isAgent && ticket.status === "pending") {
      await pool.query("update tickets set status = 'open', updated_at = now() where id = $1", [ticketId]);
      await resumeSlaTimer(ticketId, orgId);
      statusMoved = true;
      await appendTicketEvent({
        ticketId,
        organisationId: orgId,
        eventType: "status_changed",
        actorUserId: userId,
        oldValues: { status: "pending" },
        newValues: { status: "open" },
        metadata: { reason: "customer_reply" },
      });
    } else {
      await pool.query("update tickets set updated_at = now() where id = $1", [ticketId]);
    }

    await appendTicketEvent({
      ticketId,
      organisationId: orgId,
      eventType: "message_added",
      actorUserId: userId,
      metadata: { author_type: authorType, is_internal: isInternal, status_moved_to_open: statusMoved },
    });

    if (!isInternal) {
      await notifyUsersForTicketEvent({
        organisationId: orgId,
        ticketId,
        actorUserId: userId,
        eventKey: isAgent ? "agent_reply_added" : "customer_reply_added",
        title: `${isAgent ? "Agent" : "Customer"} reply on ${ticket.ticket_code}`,
        message: body.slice(0, 140),
        recipientUserIds: isAgent ? [ticket.reporter_user_id] : [ticket.assignee_user_id],
      });
    }

    await pool.query("commit");
    return res.status(201).json({ ok: true, data: messageRes.rows[0] });
  } catch (e) {
    await pool.query("rollback");
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "failed to add message" });
  }
}

export async function assignTicket(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const actorUserId = currentUserId(req);
  const parsedTicketId = parseTicketIdParam(req.params.id);
  const parsedBody = parseAssignBody(req.body);
  if (!orgId || !actorUserId || !parsedTicketId.ok || !parsedBody.ok) {
    return res.status(400).json({ ok: false, error: "invalid request" });
  }
  const ticketId = parsedTicketId.data;
  const policy = await getEffectivePolicyForRequest(req);
  const canAssignByPolicy = canDo(policy, "tickets.assign");
  const policyScope = buildTicketScopePredicate(policy);
  if (!canAssignByPolicy) {
    await logDenied(req, orgId, "tickets.assign", `Denied assign action for ticket ${ticketId}.`);
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const dto = parsedBody.data;

  const before = await pool.query<{ ticket_code: string; assignee_user_id: number | null; reporter_user_id: number; metadata_json: unknown }>(
    `select ticket_code, assignee_user_id
            ,reporter_user_id, metadata_json
     from tickets
     where id = $1 and organisation_id = $2`,
    [ticketId, orgId]
  );
  if (before.rowCount === 0) return res.status(404).json({ ok: false, error: "ticket not found" });
  if (
    !policyScope(
      before.rows[0] as { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json?: unknown }
    )
  ) {
    await logDenied(req, orgId, "tickets.assign", `Denied assign scope for ticket ${ticketId}.`);
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const updated = await pool.query(
    `update tickets
     set assignee_user_id = coalesce($3, assignee_user_id),
         team_id = coalesce($4, team_id),
         queue_id = coalesce($5, queue_id),
         updated_at = now()
     where id = $1 and organisation_id = $2
     returning id, ticket_code, assignee_user_id, team_id, queue_id, status, updated_at`,
    [ticketId, orgId, dto.assigneeUserId, dto.teamId, dto.queueId]
  );
  if (updated.rowCount === 0) return res.status(404).json({ ok: false, error: "ticket not found" });

  await appendTicketEvent({
    ticketId,
    organisationId: orgId,
    eventType: "assignment_changed",
    actorUserId,
    newValues: {
      assignee_user_id: updated.rows[0]!.assignee_user_id,
      team_id: updated.rows[0]!.team_id,
      queue_id: updated.rows[0]!.queue_id,
    },
  });

  await notifyUsersForTicketEvent({
    organisationId: orgId,
    ticketId,
    actorUserId,
    eventKey: "assignment_changed",
    title: `Ticket assigned: ${updated.rows[0]!.ticket_code}`,
    message: `Assignee updated for ticket ${updated.rows[0]!.ticket_code}.`,
    recipientUserIds: [updated.rows[0]!.assignee_user_id],
  });

  return res.json({ ok: true, data: updated.rows[0] });
}

export async function escalateTicket(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const actorUserId = currentUserId(req);
  const parsedTicketId = parseTicketIdParam(req.params.id);
  const parsedBody = parseEscalateBody(req.body);
  if (!orgId || !actorUserId || !parsedTicketId.ok || !parsedBody.ok) {
    return res.status(400).json({ ok: false, error: "invalid request" });
  }
  const ticketId = parsedTicketId.data;
  const policy = await getEffectivePolicyForRequest(req);
  const canEscalateByPolicy = canDo(policy, "tickets.escalate");
  const policyScope = buildTicketScopePredicate(policy);
  if (!canEscalateByPolicy) {
    await logDenied(req, orgId, "tickets.escalate", `Denied escalate action for ticket ${ticketId}.`);
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const dto = parsedBody.data;

  await pool.query("begin");
  try {
    const t = await pool.query<{ status: TicketStatus; reporter_user_id: number; assignee_user_id: number | null; metadata_json: unknown; ticket_code: string }>(
      "select status, reporter_user_id, assignee_user_id, metadata_json, ticket_code from tickets where id = $1 and organisation_id = $2 for update",
      [ticketId, orgId]
    );
    if (t.rowCount === 0) {
      await pool.query("rollback");
      return res.status(404).json({ ok: false, error: "ticket not found" });
    }
    const oldStatus = t.rows[0]!.status;
    if (
      !policyScope(
        t.rows[0] as { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json?: unknown }
      )
    ) {
      await pool.query("rollback");
      await logDenied(req, orgId, "tickets.escalate", `Denied escalate scope for ticket ${ticketId}.`);
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    if (!VALID_NEXT[oldStatus].includes("escalated")) {
      await pool.query("rollback");
      return res.status(400).json({ ok: false, error: `cannot escalate from status ${oldStatus}` });
    }

    const assigneeResolution = dto.targetTeamId
      ? await selectLeastLoadedAssigneeByLevel({
          organisationId: orgId,
          teamId: dto.targetTeamId,
          startLevel: null,
        })
      : { assigneeUserId: null, blockReason: null as AssignmentBlockReason | null };
    const assigneeCandidate = assigneeResolution.assigneeUserId;
    const updated = await pool.query(
      `update tickets
       set status = 'escalated',
           team_id = coalesce($3, team_id),
           queue_id = coalesce($4, queue_id),
           assignee_user_id = coalesce($5, assignee_user_id),
           updated_at = now()
       where id = $1 and organisation_id = $2
       returning id, ticket_code, status, team_id, queue_id, assignee_user_id, updated_at`,
      [ticketId, orgId, dto.targetTeamId, dto.targetQueueId, assigneeCandidate]
    );

    const escRow = updated.rows[0]!;
    if (dto.targetTeamId && assigneeCandidate === null) {
      await notifyTeamLeadsNoAvailableAgent({
        organisationId: orgId,
        teamId: dto.targetTeamId,
        ticketId,
        ticketCode: escRow.ticket_code,
        context: "escalate",
        reason: assigneeResolution.blockReason ?? "unavailable",
        startLevel: null,
      });
    }

    await pool.query(
      `insert into ticket_stage_gate_results (ticket_id, organisation_id, gate_type, passed, actor_user_id, details_json, created_at)
       values ($1,$2,'escalation_handoff',true,$3,$4::jsonb,now())`,
      [ticketId, orgId, actorUserId, JSON.stringify({ handoff_note: dto.handoffNote, reason: dto.reason })]
    );
    await pool.query(
      `update ticket_workflow_state
       set escalated_count = escalated_count + 1, last_escalated_at = now(), updated_at = now()
       where ticket_id = $1`,
      [ticketId]
    );

    await appendTicketEvent({
      ticketId,
      organisationId: orgId,
      eventType: "status_changed",
      actorUserId,
      oldValues: { status: oldStatus },
      newValues: { status: "escalated" },
      metadata: { reason: dto.reason ?? "manual_escalation" },
    });

    await notifyUsersForTicketEvent({
      organisationId: orgId,
      ticketId,
      actorUserId,
      eventKey: "ticket_escalated",
      title: `Ticket escalated: ${t.rows[0]!.ticket_code}`,
      message: `Ticket status moved from ${oldStatus} to escalated.`,
      recipientUserIds: [t.rows[0]!.reporter_user_id, t.rows[0]!.assignee_user_id],
    });
    await pool.query("commit");
    return res.json({ ok: true, data: updated.rows[0] });
  } catch (e) {
    await pool.query("rollback");
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "failed to escalate ticket" });
  }
}

export async function requestCustomerEscalation(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const actorUserId = currentUserId(req);
  const parsedTicketId = parseTicketIdParam(req.params.id);
  const parsedBody = parseCustomerEscalationBody(req.body);
  if (!orgId || !actorUserId || !parsedTicketId.ok || !parsedBody.ok) {
    return res.status(400).json({ ok: false, error: "invalid request" });
  }
  const ticketId = parsedTicketId.data;
  const policy = await getEffectivePolicyForRequest(req);
  const canReadInternal = canDo(policy, "tickets.internal_notes.read");
  if (canReadInternal) {
    await logDenied(req, orgId, "tickets.request_escalation", "Denied customer escalation for internal user.");
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const canRequestEscalationByPolicy = canDo(policy, "tickets.request_escalation") || canDo(policy, "tickets.read");
  const policyScope = buildTicketScopePredicate(policy);
  if (!canRequestEscalationByPolicy) {
    await logDenied(req, orgId, "tickets.request_escalation", `Denied customer escalation for ticket ${ticketId}.`);
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const reason = parsedBody.data.reason;

  const t = await pool.query<{
    status: TicketStatus;
    reporter_user_id: number;
    assignee_user_id: number | null;
    metadata_json: unknown;
    ticket_code: string;
    created_at: Date;
  }>(
    `select status, reporter_user_id, assignee_user_id, metadata_json, ticket_code, created_at
     from tickets where id = $1 and organisation_id = $2`,
    [ticketId, orgId]
  );
  if (t.rowCount === 0) return res.status(404).json({ ok: false, error: "ticket not found" });
  const row = t.rows[0]!;
  if (
    !policyScope(
      row as { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json?: unknown }
    )
  ) {
    await logDenied(req, orgId, "tickets.request_escalation", `Denied customer escalation scope for ticket ${ticketId}.`);
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const elig = await getCustomerEscalationEligibility({
    ticketId,
    organisationId: orgId,
    status: row.status,
    ticketCreatedAt: new Date(row.created_at),
  });
  if (!elig.eligible) {
    return res.status(400).json({ ok: false, error: elig.error ?? "cannot request escalation" });
  }

  await pool.query("begin");
  try {
    const oldStatus = row.status;
    const updated = await pool.query(
      `update tickets
       set status = 'escalated',
           updated_at = now()
       where id = $1 and organisation_id = $2
       returning id, ticket_code, status, team_id, queue_id, assignee_user_id, updated_at`,
      [ticketId, orgId]
    );
    if (updated.rowCount === 0) {
      await pool.query("rollback");
      return res.status(404).json({ ok: false, error: "ticket not found" });
    }

    await pool.query(
      `insert into ticket_stage_gate_results (ticket_id, organisation_id, gate_type, passed, actor_user_id, details_json, created_at)
       values ($1,$2,'escalation_handoff',true,$3,$4::jsonb,now())`,
      [ticketId, orgId, actorUserId, JSON.stringify({ handoff_note: reason, reason: "customer_request_escalation" })]
    );
    await pool.query(
      `update ticket_workflow_state
       set escalated_count = escalated_count + 1, last_escalated_at = now(), updated_at = now()
       where ticket_id = $1`,
      [ticketId]
    );

    await appendTicketEvent({
      ticketId,
      organisationId: orgId,
      eventType: "status_changed",
      actorUserId,
      oldValues: { status: oldStatus },
      newValues: { status: "escalated" },
      metadata: { reason: "customer_request_escalation", note: reason ?? null },
    });

    await notifyUsersForTicketEvent({
      organisationId: orgId,
      ticketId,
      actorUserId,
      eventKey: "ticket_escalated",
      title: `Ticket escalated: ${row.ticket_code}`,
      message: `Customer requested escalation (${oldStatus} → escalated).`,
      recipientUserIds: [row.reporter_user_id, row.assignee_user_id],
    });
    await pool.query("commit");
    return res.json({ ok: true, data: updated.rows[0] });
  } catch (e) {
    await pool.query("rollback");
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "failed to escalate ticket" });
  }
}

export async function changeTicketStatus(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const actorUserId = currentUserId(req);
  const parsedTicketId = parseTicketIdParam(req.params.id);
  const parsedBody = parseStatusChangeBody(req.body);
  if (!orgId || !actorUserId || !parsedTicketId.ok || !parsedBody.ok) {
    return res.status(400).json({ ok: false, error: "invalid request" });
  }
  const ticketId = parsedTicketId.data;
  const nextStatus = parsedBody.data.status;
  const policy = await getEffectivePolicyForRequest(req);
  const canStatusByPolicy =
    (nextStatus === "reopened" ? canDo(policy, "tickets.reopen") : canDo(policy, "tickets.status_change")) ||
    canDo(policy, "tickets.read");
  const policyScope = buildTicketScopePredicate(policy);
  if (!canStatusByPolicy) {
    await logDenied(req, orgId, nextStatus === "reopened" ? "tickets.reopen" : "tickets.status_change", `Denied status change for ticket ${ticketId}.`);
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  await pool.query("begin");
  try {
    const t = await pool.query<{
      status: TicketStatus;
      reporter_user_id: number;
      assignee_user_id: number | null;
      metadata_json: unknown;
      ticket_code: string;
      resolved_at: string | null;
      reopened_count: number;
    }>(
      "select status, reporter_user_id, assignee_user_id, metadata_json, ticket_code, resolved_at, reopened_count from tickets where id = $1 and organisation_id = $2 for update",
      [ticketId, orgId]
    );
    if (t.rowCount === 0) {
      await pool.query("rollback");
      return res.status(404).json({ ok: false, error: "ticket not found" });
    }
    const curr = t.rows[0]!;
    const oldStatus = curr.status;

    if (
      !policyScope(
        curr as { reporter_user_id: unknown; assignee_user_id: unknown; metadata_json?: unknown }
      )
    ) {
      await pool.query("rollback");
      await logDenied(req, orgId, nextStatus === "reopened" ? "tickets.reopen" : "tickets.status_change", `Denied status scope for ticket ${ticketId}.`);
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    if (!VALID_NEXT[oldStatus].includes(nextStatus)) {
      await pool.query("rollback");
      return res.status(400).json({ ok: false, error: `invalid transition ${oldStatus} -> ${nextStatus}` });
    }
    if (nextStatus === "resolved") {
      const resolution = parsedBody.data.resolutionNote ?? "";
      const passed = resolution.trim().length >= 50;
      await pool.query(
        `insert into ticket_stage_gate_results (ticket_id, organisation_id, gate_type, passed, actor_user_id, details_json, created_at)
         values ($1,$2,'resolution_notes_min_length',$3,$4,$5::jsonb,now())`,
        [ticketId, orgId, passed, actorUserId, JSON.stringify({ min_required: 50, actual: resolution.trim().length })]
      );
      if (!passed) {
        await pool.query("rollback");
        return res.status(400).json({ ok: false, error: "resolution_note must be at least 50 characters" });
      }
    }

    if (nextStatus === "pending") {
      await pauseSlaTimer(ticketId, orgId);
    }
    if (oldStatus === "pending" && nextStatus !== "pending") {
      await resumeSlaTimer(ticketId, orgId);
    }

    let reopenCountNext = curr.reopened_count;
    if (nextStatus === "reopened") {
      if (!curr.resolved_at) {
        await pool.query("rollback");
        return res.status(400).json({ ok: false, error: "ticket can be reopened only after resolved" });
      }
      const resolvedAt = new Date(curr.resolved_at);
      const limit = new Date(resolvedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (new Date() > limit) {
        await pool.query("rollback");
        return res.status(400).json({ ok: false, error: "reopen window expired (7 days)" });
      }
      reopenCountNext += 1;
    }

    const updated = await pool.query(
      `update tickets
       set status = $3,
           resolved_at = case when $3 = 'resolved' then now() else resolved_at end,
           closed_at = case when $3 = 'closed' then now() else closed_at end,
           reopened_count = $4,
           updated_at = now()
       where id = $1 and organisation_id = $2
       returning id, ticket_code, status, resolved_at, closed_at, reopened_count, updated_at`,
      [ticketId, orgId, nextStatus, reopenCountNext]
    );

    await appendTicketEvent({
      ticketId,
      organisationId: orgId,
      eventType: "status_changed",
      actorUserId,
      oldValues: { status: oldStatus },
      newValues: { status: nextStatus, reopened_count: reopenCountNext },
      metadata: { reason: parsedBody.data.reason ?? null },
    });

    const statusEventKey =
      nextStatus === "resolved"
        ? "ticket_resolved"
        : nextStatus === "reopened"
          ? "ticket_reopened"
          : "ticket_status_changed";
    const statusTitle =
      nextStatus === "resolved"
        ? `Ticket resolved: ${curr.ticket_code}`
        : nextStatus === "reopened"
          ? `Ticket reopened: ${curr.ticket_code}`
          : `Status changed: ${curr.ticket_code}`;
    await notifyUsersForTicketEvent({
      organisationId: orgId,
      ticketId,
      actorUserId,
      eventKey: statusEventKey,
      title: statusTitle,
      message: `Ticket moved from ${oldStatus} to ${nextStatus}.`,
      recipientUserIds: [curr.reporter_user_id, curr.assignee_user_id],
    });

    if (nextStatus === "reopened" && reopenCountNext >= 3) {
      await pool.query(
        `update tickets set status = 'escalated', updated_at = now() where id = $1 and organisation_id = $2`,
        [ticketId, orgId]
      );
      await appendTicketEvent({
        ticketId,
        organisationId: orgId,
        eventType: "status_changed",
        actorUserId,
        oldValues: { status: "reopened" },
        newValues: { status: "escalated" },
        metadata: { reason: "reopen_limit_auto_escalation" },
      });
    }

    await pool.query("commit");
    return res.json({ ok: true, data: updated.rows[0] });
  } catch (e) {
    await pool.query("rollback");
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "failed to update status" });
  }
}

export async function reopenTicket(req: Request, res: Response) {
  const parsed = parseReopenBody(req.body);
  if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
  const body = { ...(req.body ?? {}), status: "reopened", reason: parsed.data.reason };
  req.body = body;
  return changeTicketStatus(req, res);
}

