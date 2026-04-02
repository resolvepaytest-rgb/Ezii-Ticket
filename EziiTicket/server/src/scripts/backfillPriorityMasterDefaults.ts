import { pool } from "../db/pool.js";
import { ensureTenantAndDefaultsByOrgId } from "../services/provisioning/ensureTenantAndDefaults.js";

async function run() {
  const orgs = await pool.query<{ id: string }>(
    `select id::text as id from organisations order by id asc`
  );

  let ok = 0;
  let failed = 0;
  for (const row of orgs.rows) {
    const orgId = row.id;
    try {
      await ensureTenantAndDefaultsByOrgId(orgId);
      ok += 1;
      console.log(`[backfill] org ${orgId}: done`);
    } catch (e) {
      failed += 1;
      console.error(`[backfill] org ${orgId}: failed`, e);
    }
  }

  console.log(`[backfill] completed. total=${orgs.rowCount ?? 0} ok=${ok} failed=${failed}`);
}

void run()
  .catch((e) => {
    console.error("[backfill] fatal", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => null);
  });

