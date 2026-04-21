import { pool } from "../db/pool.js";
import { SCREEN_KEYS, type ScreenKey } from "../authz/permissionKeys.js";

type RoleRow = {
  id: string;
  organisation_id: string;
  name: string;
  permissions_json: unknown;
};

type EndpointCheck = {
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  screensAnyView?: ScreenKey[];
};

const ENDPOINT_CHECKS: EndpointCheck[] = [
  { endpoint: "/notifications", method: "GET" },
  { endpoint: "/notifications/read-all", method: "POST" },
  { endpoint: "/notifications/:id/read", method: "POST" },

  { endpoint: "/tickets", method: "GET", screensAnyView: ["tickets"] },
  { endpoint: "/tickets", method: "POST", screensAnyView: ["raise_a_ticket", "my_tickets", "tickets"] },
  { endpoint: "/tickets/my", method: "GET", screensAnyView: ["my_tickets", "agent_my_tickets", "tickets"] },
  { endpoint: "/tickets/:id", method: "GET", screensAnyView: ["my_tickets", "agent_my_tickets", "tickets"] },
  { endpoint: "/tickets/:id/messages", method: "POST", screensAnyView: ["my_tickets", "agent_my_tickets", "tickets"] },
  { endpoint: "/tickets/:id/attachments", method: "POST", screensAnyView: ["my_tickets", "agent_my_tickets", "tickets"] },
  {
    endpoint: "/tickets/:ticketId/attachments/:attachmentId/download",
    method: "GET",
    screensAnyView: ["my_tickets", "agent_my_tickets", "tickets"],
  },
  { endpoint: "/tickets/:id/status", method: "POST", screensAnyView: ["tickets", "agent_team_queue", "agent_history"] },
  { endpoint: "/tickets/:id/escalate", method: "POST", screensAnyView: ["tickets", "agent_team_queue", "agent_history"] },
  { endpoint: "/tickets/:id/request-escalation", method: "POST", screensAnyView: ["my_tickets", "raise_a_ticket"] },
  { endpoint: "/tickets/:id/reopen", method: "POST", screensAnyView: ["my_tickets", "raise_a_ticket", "tickets"] },
  { endpoint: "/tickets/:id/assign", method: "POST", screensAnyView: ["tickets", "agent_team_queue", "agent_history"] },

  { endpoint: "/admin/roles", method: "GET", screensAnyView: ["roles_permissions"] },
  { endpoint: "/admin/roles", method: "POST", screensAnyView: ["roles_permissions"] },
  { endpoint: "/admin/users", method: "GET", screensAnyView: ["users"] },
  { endpoint: "/admin/users/:user_id", method: "PUT", screensAnyView: ["users"] },
  {
    endpoint: "/admin/routing-rules",
    method: "POST",
    screensAnyView: ["routing_rules"],
  },
  {
    endpoint: "/admin/priority-master",
    method: "PUT",
    screensAnyView: ["priority_master"],
  },
  {
    endpoint: "/admin/keyword-routing",
    method: "POST",
    screensAnyView: ["keyword_routing"],
  },
  {
    endpoint: "/admin/sla-policies",
    method: "POST",
    screensAnyView: ["sla_policies"],
  },
  {
    endpoint: "/admin/notification-templates",
    method: "POST",
    screensAnyView: ["notification_templates"],
  },
  {
    endpoint: "/admin/canned-responses",
    method: "POST",
    screensAnyView: ["canned_responses"],
  },
  {
    endpoint: "/admin/custom-fields",
    method: "POST",
    screensAnyView: ["custom_fields"],
  },
  {
    endpoint: "/admin/api-tokens",
    method: "POST",
    screensAnyView: ["api_tokens"],
  },
  {
    endpoint: "/admin/webhooks",
    method: "POST",
    screensAnyView: ["webhooks"],
  },
  { endpoint: "/admin/audit-logs", method: "GET", screensAnyView: ["audit_logs"] },
];

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function screenView(screens: Record<string, unknown>, key: ScreenKey): boolean {
  const n = asObject(screens[key]);
  return Boolean(n.view || n.modify);
}

function checkEndpoint(roleDoc: Record<string, unknown>, check: EndpointCheck): boolean {
  const screens = asObject(roleDoc.screen_access);

  const screensOk =
    !check.screensAnyView || check.screensAnyView.length === 0
      ? true
      : check.screensAnyView.some((k) => screenView(screens, k));
  return screensOk;
}

async function run() {
  const unknownScreens = ENDPOINT_CHECKS.flatMap((e) => e.screensAnyView ?? []).filter((s) => !SCREEN_KEYS.includes(s));
  if (unknownScreens.length > 0) {
    console.error(
      `[permissions:verify-role-endpoints] invalid matrix unknownScreens=${unknownScreens.join(",")}`
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

