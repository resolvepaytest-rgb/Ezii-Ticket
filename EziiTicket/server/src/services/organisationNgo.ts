import { pool } from "../db/pool.js";

/**
 * Single DB path for NGO flag: `organisations.is_ngo` and `organisation_settings.is_ngo`.
 * Only writes when the value differs (`is distinct from`).
 * @returns true if at least one row was updated
 */
export async function persistOrganisationIsNgo(orgId: number, isNgo: boolean): Promise<boolean> {
  const orgRes = await pool.query(
    `update organisations set is_ngo = $2, updated_at = now()
     where id = $1::bigint and is_ngo is distinct from $2`,
    [orgId, isNgo]
  );
  const setRes = await pool.query(
    `update organisation_settings set is_ngo = $2, updated_at = now()
     where organisation_id = $1::bigint and is_ngo is distinct from $2`,
    [orgId, isNgo]
  );
  return (orgRes.rowCount ?? 0) > 0 || (setRes.rowCount ?? 0) > 0;
}
