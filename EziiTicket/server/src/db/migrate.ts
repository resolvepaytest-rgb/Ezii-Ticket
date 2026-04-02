import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./pool.js";

async function ensureMigrationsTable() {
  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getAppliedVersions(): Promise<Set<string>> {
  const res = await pool.query<{ version: string }>(
    "select version from schema_migrations order by applied_at asc"
  );
  return new Set(res.rows.map((r) => r.version));
}

export async function migrate() {
  const dir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
    "migrations"
  );
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  await ensureMigrationsTable();
  const applied = await getAppliedVersions();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) continue;

    const sql = await fs.readFile(path.join(dir, file), "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations (version) values ($1)", [version]);
      await pool.query("commit");
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied ${version}`);
    } catch (e) {
      await pool.query("rollback");
      throw e;
    }
  }
}

if (process.env.RUN_MIGRATIONS === "1") {
  migrate()
    .then(() => process.exit(0))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[migrate] failed", e);
      process.exit(1);
    });
}

