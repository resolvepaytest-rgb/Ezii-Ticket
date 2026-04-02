import { pool } from "../db/pool.js";

/** Default trigger phrases per product code (PRD). One row per phrase per organisation. */
const DEFAULT_PHRASES_BY_PRODUCT_CODE: Record<string, readonly string[]> = {
  PAY: [
    "salary not processed",
    "payroll failed",
    "wrong salary",
    "data breach",
    "all employees",
    "statutory deadline",
  ],
  LEA: ["leave data lost", "negative balance for all", "carry-forward wiped", "compliance audit"],
  ATT: [
    "all punches missing",
    "biometric data loss",
    "regularisation closed for all",
    "payroll sync failed",
  ],
  EXP: ["reimbursement for all", "advance not disbursed", "data corruption", "audit requirement"],
};

export async function seedKeywordRoutingForOrg(organisationId: number) {
  const codes = Object.keys(DEFAULT_PHRASES_BY_PRODUCT_CODE);
  for (const code of codes) {
    const phrases = DEFAULT_PHRASES_BY_PRODUCT_CODE[code];
    if (!phrases?.length) continue;
    const prod = await pool.query<{ id: number }>(`select id from products where code = $1`, [code]);
    const productId = prod.rows[0]?.id;
    if (!productId) continue;

    for (const phrase of phrases) {
      await pool.query(
        `insert into keyword_routing_entries
          (organisation_id, product_id, phrase, is_system_default, is_active)
         values ($1,$2,$3,true,true)
         on conflict (organisation_id, product_id, phrase_normalized) do nothing`,
        [organisationId, productId, phrase]
      );
    }
  }
}
