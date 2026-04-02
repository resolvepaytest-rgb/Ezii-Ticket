import { pool } from "../db/pool.js";
import { ensureTenantAndDefaultsByOrgId } from "../services/provisioning/ensureTenantAndDefaults.js";

async function run() {
  const orgs = await pool.query<{ id: string }>(
    `select id::text as id from organisations order by id asc`
  );

  let ok = 0;
  let failed = 0;
  for (const row of orgs.rows) {
    try {
      await ensureTenantAndDefaultsByOrgId(row.id);
      ok += 1;
      console.log(`[permissions:backfill-templates] org ${row.id}: done`);
    } catch (e) {
      failed += 1;
      console.error(`[permissions:backfill-templates] org ${row.id}: failed`, e);
    }
  }

  console.log(
    `[permissions:backfill-templates] completed total=${orgs.rowCount ?? 0} ok=${ok} failed=${failed}`
  );
}

void run()
  .catch((e) => {
    console.error("[permissions:backfill-templates] fatal", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => null);
  });

