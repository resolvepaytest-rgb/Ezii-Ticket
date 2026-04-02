import { pool } from "../db/pool.js";
import { ACTION_KEYS, SCREEN_KEYS, type ActionKey, type ScreenKey } from "../authz/permissionKeys.js";

type RoleRow = {
  id: string;
  organisation_id: string;
  name: string;
  permissions_json: unknown;
};

type EndpointCheck = {
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  actionsAll?: ActionKey[];
  screensAnyView?: ScreenKey[];
};

const ENDPOINT_CHECKS: EndpointCheck[] = [
  { endpoint: "/notifications", method: "GET", actionsAll: ["notifications.read"] },
  { endpoint: "/notifications/read-all", method: "POST", actionsAll: ["notifications.mark_read"] },
  { endpoint: "/notifications/:id/read", method: "POST", actionsAll: ["notifications.mark_read"] },

  { endpoint: "/tickets", method: "GET", actionsAll: ["tickets.list"], screensAnyView: ["tickets"] },
  { endpoint: "/tickets", method: "POST", actionsAll: ["tickets.create"] },
  { endpoint: "/tickets/my", method: "GET", actionsAll: ["tickets.list_my"], screensAnyView: ["my_tickets", "tickets"] },
  { endpoint: "/tickets/:id", method: "GET", actionsAll: ["tickets.read"] },
  { endpoint: "/tickets/:id/messages", method: "POST", actionsAll: ["tickets.reply"] },
  { endpoint: "/tickets/:id/attachments", method: "POST", actionsAll: ["tickets.attach"] },
  {
    endpoint: "/tickets/:ticketId/attachments/:attachmentId/download",
    method: "GET",
    actionsAll: ["tickets.attach_download"],
  },
  { endpoint: "/tickets/:id/status", method: "POST", actionsAll: ["tickets.status_change"] },
  { endpoint: "/tickets/:id/escalate", method: "POST", actionsAll: ["tickets.escalate"] },
  { endpoint: "/tickets/:id/request-escalation", method: "POST", actionsAll: ["tickets.request_escalation"] },
  { endpoint: "/tickets/:id/reopen", method: "POST", actionsAll: ["tickets.reopen"] },
  { endpoint: "/tickets/:id/assign", method: "POST", actionsAll: ["tickets.assign"] },

  { endpoint: "/admin/roles", method: "GET", actionsAll: ["roles.read"], screensAnyView: ["roles_permissions"] },
  { endpoint: "/admin/roles", method: "POST", actionsAll: ["roles.manage"], screensAnyView: ["roles_permissions"] },
  { endpoint: "/admin/users", method: "GET", actionsAll: ["users.read"], screensAnyView: ["users"] },
  { endpoint: "/admin/users/:user_id", method: "PUT", actionsAll: ["users.manage"], screensAnyView: ["users"] },
  {
    endpoint: "/admin/routing-rules",
    method: "POST",
    actionsAll: ["routing_rules.manage"],
    screensAnyView: ["routing_rules"],
  },
  {
    endpoint: "/admin/priority-master",
    method: "PUT",
    actionsAll: ["priority_master.manage"],
    screensAnyView: ["priority_master"],
  },
  {
    endpoint: "/admin/keyword-routing",
    method: "POST",
    actionsAll: ["keyword_routing.manage"],
    screensAnyView: ["keyword_routing"],
  },
  {
    endpoint: "/admin/sla-policies",
    method: "POST",
    actionsAll: ["sla.policies.manage"],
    screensAnyView: ["sla_policies"],
  },
  {
    endpoint: "/admin/notification-templates",
    method: "POST",
    actionsAll: ["notification_templates.manage"],
    screensAnyView: ["notification_templates"],
  },
  {
    endpoint: "/admin/canned-responses",
    method: "POST",
    actionsAll: ["canned_responses.manage"],
    screensAnyView: ["canned_responses"],
  },
  {
    endpoint: "/admin/custom-fields",
    method: "POST",
    actionsAll: ["custom_fields.manage"],
    screensAnyView: ["custom_fields"],
  },
  {
    endpoint: "/admin/api-tokens",
    method: "POST",
    actionsAll: ["api_tokens.manage"],
    screensAnyView: ["api_tokens"],
  },
  {
    endpoint: "/admin/webhooks",
    method: "POST",
    actionsAll: ["webhooks.manage"],
    screensAnyView: ["webhooks"],
  },
  { endpoint: "/admin/audit-logs", method: "GET", actionsAll: ["audit_logs.read"], screensAnyView: ["audit_logs"] },
];

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function screenView(screens: Record<string, unknown>, key: ScreenKey): boolean {
  const n = asObject(screens[key]);
  return Boolean(n.view || n.modify);
}

function checkEndpoint(roleDoc: Record<string, unknown>, check: EndpointCheck): boolean {
  const actions = asObject(roleDoc.actions);
  const screens = asObject(roleDoc.screen_access);

  const actionsOk = (check.actionsAll ?? []).every((k) => actions[k] === true);
  const screensOk =
    !check.screensAnyView || check.screensAnyView.length === 0
      ? true
      : check.screensAnyView.some((k) => screenView(screens, k));
  return actionsOk && screensOk;
}

async function run() {
  const unknownActions = ENDPOINT_CHECKS.flatMap((e) => e.actionsAll ?? []).filter((a) => !ACTION_KEYS.includes(a));
  const unknownScreens = ENDPOINT_CHECKS.flatMap((e) => e.screensAnyView ?? []).filter((s) => !SCREEN_KEYS.includes(s));
  if (unknownActions.length > 0 || unknownScreens.length > 0) {
    console.error(
      `[permissions:verify-role-endpoints] invalid matrix unknownActions=${unknownActions.join(",")} unknownScreens=${unknownScreens.join(",")}`
    );
    process.exitCode = 1;
    return;
  }

  const res = await pool.query<RoleRow>(
    `select id::text, organisation_id::text, name, permissions_json
     from roles
     order by organisation_id asc, id asc`
  );

  for (const row of res.rows) {
    const doc = asObject(row.permissions_json);
    const denied = ENDPOINT_CHECKS.filter((c) => !checkEndpoint(doc, c));
    console.log(
      `[permissions:verify-role-endpoints] org=${row.organisation_id} role=${row.name} allow=${ENDPOINT_CHECKS.length - denied.length}/${ENDPOINT_CHECKS.length}`
    );
    for (const d of denied) {
      console.log(`  deny ${d.method} ${d.endpoint}`);
    }
  }
}

void run()
  .catch((e) => {
    console.error("[permissions:verify-role-endpoints] fatal", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => null);
  });

