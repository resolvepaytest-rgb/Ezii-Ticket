import { SCREEN_KEYS } from "../authz/permissionKeys.js";
import { pool } from "../db/pool.js";

type RoleRow = {
  id: string;
  organisation_id: string;
  name: string;
  permissions_json: unknown;
};

function asObject(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

async function run() {
  const res = await pool.query<RoleRow>(
    `select id::text, organisation_id::text, name, permissions_json
     from roles
     order by organisation_id asc, id asc`
  );

  let invalid = 0;
  for (const row of res.rows) {
    const doc = asObject(row.permissions_json);
    const screens = asObject(doc.screen_access);

    const missingScreens = SCREEN_KEYS.filter((k) => !(k in screens));

    const badScreenShape = SCREEN_KEYS.filter((k) => {
      const entry = asObject(screens[k]);
      return typeof entry.view !== "boolean" || typeof entry.modify !== "boolean";
    });

    if (missingScreens.length === 0 && badScreenShape.length === 0) {
      continue;
    }

    invalid += 1;
    console.error(
      `[permissions:validate-keys] role_id=${row.id} org=${row.organisation_id} name=${row.name}`
    );
    if (missingScreens.length > 0) console.error(`  missing screens: ${missingScreens.join(", ")}`);
    if (badScreenShape.length > 0) console.error(`  malformed screens: ${badScreenShape.join(", ")}`);
  }

  if (invalid > 0) {
    console.error(`[permissions:validate-keys] failed invalid_roles=${invalid}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[permissions:validate-keys] ok roles=${res.rowCount ?? 0}`);
}

void run()
  .catch((e) => {
    console.error("[permissions:validate-keys] fatal", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => null);
  });

