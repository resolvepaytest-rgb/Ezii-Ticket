import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { ensureTenantAndDefaultsByOrgId } from "../../services/provisioning/ensureTenantAndDefaults.js";
import { appendAdminAudit } from "./adminAudit.js";

type DefaultTaxonomyCategory = {
  name: string;
  subcategories: string[];
};

const DEFAULT_TAXONOMY_BY_PRODUCT: Record<string, DefaultTaxonomyCategory[]> = {
  payroll: [
    { name: "Salary Discrepancy", subcategories: ["Gross pay incorrect", "Deductions mismatch", "Arrears not processed"] },
    { name: "Tax & Compliance", subcategories: ["TDS computation error", "Form 16 issue", "PF/ESI mismatch"] },
    { name: "Payslip", subcategories: ["Not generated", "Incorrect data", "Download failure"] },
    { name: "Bank Transfer", subcategories: ["Salary not credited", "Wrong account", "Partial transfer"] },
    { name: "Payroll Run", subcategories: ["Run failed", "Incorrect period", "Revision request"] },
    { name: "Configuration", subcategories: ["New employee setup", "Grade / band change", "Component addition"] },
    { name: "Statutory Reports", subcategories: ["MIS report error", "Statutory report", "Export failure"] },
  ],
  leave: [
    { name: "Leave Application", subcategories: ["Cannot apply", "Duplicate application", "Unable to cancel"] },
    { name: "Leave Balance", subcategories: ["Incorrect balance", "Carry-forward issue", "Encashment error"] },
    { name: "Leave Policy", subcategories: ["Policy not applied", "Entitlement mismatch", "Exception request"] },
    { name: "Approval Workflow", subcategories: ["Approver not notified", "Auto-rejected", "Delegation issue"] },
    { name: "Holiday Calendar", subcategories: ["Wrong holiday listed", "Restricted holiday", "State-specific holiday"] },
    { name: "Compensatory Off", subcategories: ["Compoff not credited", "Expired compoff", "Application rejected"] },
    { name: "Reporting", subcategories: ["Leave report incorrect", "Balance summary wrong", "Export failure"] },
  ],
  attendance: [
    { name: "Punch In / Out", subcategories: ["Missed punch", "Duplicate punch", "Biometric failure"] },
    { name: "Regularization", subcategories: ["Regularization rejected", "Missing approval", "Period already closed"] },
    { name: "Shift Management", subcategories: ["Wrong shift assigned", "Roster not updated", "Night shift issue"] },
    { name: "Overtime", subcategories: ["OT not calculated", "OT rate incorrect", "Approval pending"] },
    { name: "Work From Home", subcategories: ["WFH not marked", "Location tracking issue", "Policy mismatch"] },
    { name: "Device & Integration", subcategories: ["Biometric device offline", "Mobile app issue", "GPS failure"] },
    { name: "Reporting", subcategories: ["Attendance summary wrong", "Report mismatch", "Export issue"] },
  ],
  expense: [
    { name: "Claim Submission", subcategories: ["Cannot submit claim", "Attachment issue", "Category not available"] },
    { name: "Approval Workflow", subcategories: ["Approver not notified", "Claim auto-rejected", "Delegation issue"] },
    { name: "Reimbursement", subcategories: ["Not reimbursed", "Partial reimbursement", "Wrong account credited"] },
    { name: "Policy Violation", subcategories: ["Over policy limit", "Missing receipt", "Category mismatch"] },
    { name: "Travel Advance", subcategories: ["Advance not released", "Incorrect amount", "Settlement pending"] },
    { name: "Receipt Management", subcategories: ["OCR scan failure", "Receipt not attached", "Duplicate receipt"] },
    { name: "Reporting", subcategories: ["Expense report incorrect", "Budget variance", "Export failure"] },
  ],
};

function normalizeName(v: string): string {
  return v.trim().toLowerCase();
}

function resolveDefaultTaxonomyProductKey(code: string, name: string): string | null {
  const normCode = normalizeName(code);
  const normName = normalizeName(name);
  if (normCode.startsWith("pay") || normName.includes("payroll")) return "payroll";
  if (normCode.startsWith("lea") || normName.includes("leave")) return "leave";
  if (normCode.startsWith("att") || normName.includes("attendance")) return "attendance";
  if (normCode.startsWith("exp") || normName.includes("expense")) return "expense";
  return null;
}

/** Ensures PRD default categories exist for org+product; safe to call before listing. Exported for portal ticket form. */
export async function ensureDefaultTaxonomyForOrgProduct(orgId: number, productId: number) {
  const p = await pool.query("select code, name from products where id = $1", [productId]);
  const product = p.rows[0];
  if (!product) return;

  const key = resolveDefaultTaxonomyProductKey(String(product.code ?? ""), String(product.name ?? ""));
  if (!key) return;
  const template = DEFAULT_TAXONOMY_BY_PRODUCT[key];
  if (!template?.length) return;

  const existingCats = await pool.query(
    "select id, name from product_categories where organisation_id = $1 and product_id = $2",
    [orgId, productId]
  );
  const catByName = new Map<string, { id: number }>();
  for (const c of existingCats.rows) {
    catByName.set(normalizeName(String(c.name ?? "")), { id: Number(c.id) });
  }

  for (let i = 0; i < template.length; i += 1) {
    const category = template[i];
    const catKey = normalizeName(category.name);
    let cat = catByName.get(catKey);
    if (!cat) {
      const created = await pool.query(
        `insert into product_categories (organisation_id, product_id, name, sort_order, is_active, is_system_default)
         values ($1, $2, $3, $4, true, true)
         returning id, name`,
        [orgId, productId, category.name, (i + 1) * 10]
      );
      cat = { id: Number(created.rows[0].id) };
      catByName.set(catKey, cat);
    }

    const existingSubs = await pool.query(
      "select id, name from product_subcategories where category_id = $1",
      [cat.id]
    );
    const subByName = new Set(existingSubs.rows.map((s) => normalizeName(String(s.name ?? ""))));
    for (let j = 0; j < category.subcategories.length; j += 1) {
      const sub = category.subcategories[j];
      const subKey = normalizeName(sub);
      if (subByName.has(subKey)) continue;
      await pool.query(
        `insert into product_subcategories (category_id, name, sort_order, is_active, is_system_default)
         values ($1, $2, $3, true, true)`,
        [cat.id, sub, (j + 1) * 10]
      );
      subByName.add(subKey);
    }
  }
}

async function verifyCategoryOrg(categoryId: number, expectedOrgId: number) {
  const r = await pool.query(
    "select organisation_id, is_system_default from product_categories where id = $1",
    [categoryId]
  );
  const row = r.rows[0];
  if (!row) return { ok: false as const, error: "not found" as const };
  if (Number(row.organisation_id) !== expectedOrgId) return { ok: false as const, error: "forbidden" as const };
  return { ok: true as const, row };
}

async function verifySubcategoryOrg(subcategoryId: number, expectedOrgId: number) {
  const r = await pool.query(
    `select pc.organisation_id, ps.is_system_default
     from product_subcategories ps
     join product_categories pc on pc.id = ps.category_id
     where ps.id = $1`,
    [subcategoryId]
  );
  const row = r.rows[0];
  if (!row) return { ok: false as const, error: "not found" as const };
  if (Number(row.organisation_id) !== expectedOrgId) return { ok: false as const, error: "forbidden" as const };
  return { ok: true as const, row };
}

export async function listProductCategoriesTree(req: Request, res: Response) {
  const orgId = asInt(req.params.organisation_id);
  const productId = asInt(req.params.product_id);
  if (!orgId || !productId) {
    return res.status(400).json({ ok: false, error: "invalid organisation or product id" });
  }
  await ensureDefaultTaxonomyForOrgProduct(orgId, productId);

  const cats = await pool.query(
    `select id, organisation_id, product_id, name, sort_order, is_active, is_system_default, created_at, updated_at
     from product_categories
     where organisation_id = $1 and product_id = $2
     order by
       case when coalesce(is_system_default, false) = false then 0 else 1 end asc,
       sort_order asc,
       id asc`,
    [orgId, productId]
  );

  const subs = await pool.query(
    `select ps.id, ps.category_id, ps.name, ps.sort_order, ps.is_active, ps.is_system_default, ps.created_at, ps.updated_at
     from product_subcategories ps
     join product_categories pc on pc.id = ps.category_id
     where pc.organisation_id = $1 and pc.product_id = $2
     order by
       case when coalesce(ps.is_system_default, false) = false then 0 else 1 end asc,
       ps.sort_order asc,
       ps.id asc`,
    [orgId, productId]
  );

  const subByCat = new Map<number, typeof subs.rows>();
  for (const s of subs.rows) {
    const cid = Number(s.category_id);
    const arr = subByCat.get(cid) ?? [];
    arr.push(s);
    subByCat.set(cid, arr);
  }

  const data = cats.rows.map((c) => ({
    ...c,
    subcategories: subByCat.get(Number(c.id)) ?? [],
  }));

  return res.json({ ok: true, data });
}

export async function createProductCategory(req: Request, res: Response) {
  const orgId = asInt(req.params.organisation_id);
  const productId = asInt(req.params.product_id);
  if (!orgId || !productId) {
    return res.status(400).json({ ok: false, error: "invalid organisation or product id" });
  }

  await ensureTenantAndDefaultsByOrgId(orgId);

  const { name, sort_order } = req.body ?? {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const result = await pool.query(
    `insert into product_categories (organisation_id, product_id, name, sort_order, is_active, is_system_default)
     values ($1, $2, $3, coalesce($4, 0), true, false)
     returning id, organisation_id, product_id, name, sort_order, is_active, is_system_default, created_at, updated_at`,
    [orgId, productId, name.trim(), typeof sort_order === "number" ? sort_order : null]
  );
  const row = result.rows[0];
  await appendAdminAudit(req, orgId, "Products", "category_create", `Created category "${name.trim()}" (product ${productId})`);
  return res.status(201).json({ ok: true, data: { ...row, subcategories: [] } });
}

export async function updateProductCategory(req: Request, res: Response) {
  const id = asInt(req.params.id);
  const orgId = asInt(req.query.organisation_id);
  if (!id || !orgId) return res.status(400).json({ ok: false, error: "invalid id or organisation_id query" });

  const v = await verifyCategoryOrg(id, orgId);
  if (!v.ok) {
    return res.status(v.error === "not found" ? 404 : 403).json({ ok: false, error: v.error });
  }

  const { name, sort_order, is_active } = req.body ?? {};
  const result = await pool.query(
    `update product_categories
     set name = coalesce($2, name),
         sort_order = coalesce($3, sort_order),
         is_active = coalesce($4, is_active),
         updated_at = now()
     where id = $1
     returning id, organisation_id, product_id, name, sort_order, is_active, is_system_default, created_at, updated_at`,
    [id, name != null && typeof name === "string" ? name.trim() : null, typeof sort_order === "number" ? sort_order : null, typeof is_active === "boolean" ? is_active : null]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, orgId, "Products", "category_update", `Updated category id=${id}`);
  return res.json({ ok: true, data: row });
}

export async function createProductSubcategory(req: Request, res: Response) {
  const categoryId = asInt(req.params.categoryId);
  const orgId = asInt(req.query.organisation_id);
  if (!categoryId || !orgId) return res.status(400).json({ ok: false, error: "invalid category or organisation_id query" });

  const v = await verifyCategoryOrg(categoryId, orgId);
  if (!v.ok) {
    return res.status(v.error === "not found" ? 404 : 403).json({ ok: false, error: v.error });
  }

  const { name, sort_order } = req.body ?? {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const result = await pool.query(
    `insert into product_subcategories (category_id, name, sort_order, is_active, is_system_default)
     values ($1, $2, coalesce($3, 0), true, false)
     returning id, category_id, name, sort_order, is_active, is_system_default, created_at, updated_at`,
    [categoryId, name.trim(), typeof sort_order === "number" ? sort_order : null]
  );
  await appendAdminAudit(req, orgId, "Products", "subcategory_create", `Created sub-category "${name.trim()}" under category ${categoryId}`);
  return res.status(201).json({ ok: true, data: result.rows[0] });
}

export async function updateProductSubcategory(req: Request, res: Response) {
  const id = asInt(req.params.id);
  const orgId = asInt(req.query.organisation_id);
  if (!id || !orgId) return res.status(400).json({ ok: false, error: "invalid id or organisation_id query" });

  const v = await verifySubcategoryOrg(id, orgId);
  if (!v.ok) {
    return res.status(v.error === "not found" ? 404 : 403).json({ ok: false, error: v.error });
  }

  const { name, sort_order, is_active } = req.body ?? {};
  const result = await pool.query(
    `update product_subcategories
     set name = coalesce($2, name),
         sort_order = coalesce($3, sort_order),
         is_active = coalesce($4, is_active),
         updated_at = now()
     where id = $1
     returning id, category_id, name, sort_order, is_active, is_system_default, created_at, updated_at`,
    [id, name != null && typeof name === "string" ? name.trim() : null, typeof sort_order === "number" ? sort_order : null, typeof is_active === "boolean" ? is_active : null]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(req, orgId, "Products", "subcategory_update", `Updated sub-category id=${id}`);
  return res.json({ ok: true, data: row });
}

export async function deleteProductCategory(req: Request, res: Response) {
  const id = asInt(req.params.id);
  const orgId = asInt(req.query.organisation_id);
  if (!id || !orgId) return res.status(400).json({ ok: false, error: "invalid id or organisation_id query" });

  const v = await verifyCategoryOrg(id, orgId);
  if (!v.ok) {
    return res.status(v.error === "not found" ? 404 : 403).json({ ok: false, error: v.error });
  }
  if (Boolean(v.row.is_system_default)) {
    return res.status(403).json({ ok: false, error: "default categories cannot be removed; disable instead" });
  }

  await pool.query("delete from product_categories where id = $1", [id]);
  await appendAdminAudit(req, orgId, "Products", "category_delete", `Deleted category id=${id}`);
  return res.json({ ok: true, data: { id } });
}

export async function deleteProductSubcategory(req: Request, res: Response) {
  const id = asInt(req.params.id);
  const orgId = asInt(req.query.organisation_id);
  if (!id || !orgId) return res.status(400).json({ ok: false, error: "invalid id or organisation_id query" });

  const v = await verifySubcategoryOrg(id, orgId);
  if (!v.ok) {
    return res.status(v.error === "not found" ? 404 : 403).json({ ok: false, error: v.error });
  }
  if (Boolean(v.row.is_system_default)) {
    return res.status(403).json({ ok: false, error: "default sub-categories cannot be removed; disable instead" });
  }

  await pool.query("delete from product_subcategories where id = $1", [id]);
  await appendAdminAudit(req, orgId, "Products", "subcategory_delete", `Deleted sub-category id=${id}`);
  return res.json({ ok: true, data: { id } });
}
