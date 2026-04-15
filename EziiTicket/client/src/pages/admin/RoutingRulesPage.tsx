import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import {
  createRoutingRule,
  deleteRoutingRule,
  getExternalOrganizations,
  listOrganisations,
  listRoles,
  listProductCategoriesTree,
  listProducts,
  listRoutingRules,
  updateRoutingRule,
  type ExternalOrganization,
  type Organisation,
  type ProductCategoryTree,
  type Product,
  type ProductSubcategory,
  type RoutingRule,
  type Role,
} from "@api/adminApi";
import { useAuthStore } from "@store/useAuthStore";
import { EZII_BRAND } from "@/lib/eziiBrand";
import { ChevronDown, Pencil, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";

const TICKET_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
type Priority = (typeof TICKET_PRIORITIES)[number];

const DEFAULT_START_LEVELS = ["L1", "L2", "L3"] as const;
type StartLevel = string;

type RuleDraft = {
  orgId: string;
  isGlobal: boolean;
  name: string;
  productIds: string[];
  categoryIds: string[];
  subCategoryIds: string[];
  categoryNamesFallback: string[];
  subCategoryNamesFallback: string[];
  priority: Priority;
  startLevel: StartLevel;
  isActive: boolean;
};

type RuleView = {
  rule: RoutingRule;
  orgName: string;
  productName: string;
  /** First category name (for filters); not used when matchesAllCategories */
  category: string;
  subCategories: string[];
  matchesAllCategories: boolean;
  matchesAllSubcategories: boolean;
  categoryDisplay: string;
  subCategoriesDisplay: string;
  startLevel: string;
};

function safeParseObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getPriorityFromRule(rule: RoutingRule): string {
  const conditions = safeParseObject(rule.conditions_json);
  const actions = safeParseObject(rule.actions_json);
  if (typeof conditions["priority"] === "string") return conditions["priority"];
  if (typeof actions["ticket_priority"] === "string") return actions["ticket_priority"];
  return "-";
}

function getStartLevelFromRule(rule: RoutingRule): string {
  const conditions = safeParseObject(rule.conditions_json);
  const actions = safeParseObject(rule.actions_json);
  const raw = conditions["start_level"] ?? actions["start_level"];
  return typeof raw === "string" ? raw : "-";
}

function normalizeStartLevel(v: string | null | undefined): StartLevel {
  if (!v) return "L1";
  const t = String(v).trim().toUpperCase();
  // Expect `L<integer>` (e.g. L1, L4, L12)
  if (/^L\d+$/.test(t)) return t;
  return "L1";
}

function sortSubcategories(subs: ProductSubcategory[]): ProductSubcategory[] {
  return [...subs].sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
    const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
    return ao - bo || a.name.localeCompare(b.name);
  });
}

/** Active subcategories for the given categories (union, deduped). */
function collectSubcategoriesFromCategories(categories: ProductCategoryTree[]): ProductSubcategory[] {
  const byId = new Map<number, ProductSubcategory>();
  for (const cat of categories) {
    for (const s of cat.subcategories ?? []) {
      if (!s.is_active) continue;
      if (!byId.has(s.id)) byId.set(s.id, s);
    }
  }
  return sortSubcategories(Array.from(byId.values()));
}

function setsEqualCategoryIds(a: ProductCategoryTree[], b: ProductCategoryTree[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b.map((c) => c.id));
  return a.every((c) => setB.has(c.id));
}

/**
 * Per selected product: if no category id from that product is chosen, use all categories for that product.
 * Deduplicates by category id across products.
 */
function resolveEffectiveCategoriesForProducts(
  orgNum: number,
  productIds: string[],
  categoryTreeByOrgProduct: Record<string, ProductCategoryTree[]>,
  selectedCategoryIds: string[]
): ProductCategoryTree[] {
  const selectedSet = new Set(selectedCategoryIds.map(String));
  const seen = new Set<number>();
  const result: ProductCategoryTree[] = [];

  for (const pidStr of productIds) {
    const pNum = Number(pidStr);
    if (!Number.isFinite(pNum) || pNum <= 0) continue;
    const tree = categoryTreeByOrgProduct[`${orgNum}:${pNum}`] ?? [];
    const catsForProduct = tree.filter((c) => c.is_active);
    const picked = catsForProduct.filter((c) => selectedSet.has(String(c.id)));
    const forP = picked.length === 0 ? catsForProduct : picked;
    for (const c of forP) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
  }
  return result.sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
    const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
    return ao - bo || a.name.localeCompare(b.name);
  });
}

function getMatchScope(conditions: Record<string, unknown>): { categories: string; subcategories: string } | null {
  const raw = conditions["match_scope"];
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const c = o["categories"];
  const s = o["subcategories"];
  if (typeof c !== "string" || typeof s !== "string") return null;
  return { categories: c, subcategories: s };
}

/** When explicit categories are set but category_ids are missing (legacy JSON), derive parent category ids from sub ids — same idea as server hydrateRoutingConditionsCategoryIdsFromSubs. */
function inferCategoryIdsFromSubIdsInTree(tree: ProductCategoryTree[], subIds: number[]): number[] {
  const want = new Set(
    subIds.map((n) => Math.trunc(Number(n))).filter((n) => Number.isFinite(n))
  );
  if (want.size === 0) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const c of tree) {
    if (!c.is_active) continue;
    const cid = Math.trunc(Number(c.id));
    if (!Number.isFinite(cid)) continue;
    for (const s of c.subcategories ?? []) {
      if (!s.is_active) continue;
      const sid = Math.trunc(Number(s.id));
      if (!Number.isFinite(sid) || !want.has(sid)) continue;
      if (!seen.has(cid)) {
        seen.add(cid);
        out.push(cid);
      }
    }
  }
  return out;
}

/** Union of active categories across selected products (same logic as the modal’s category options). */
function collectActiveCategoryUnionFromTrees(
  orgNum: number,
  productIds: string[],
  trees: Record<string, ProductCategoryTree[]>
): ProductCategoryTree[] {
  const byId = new Map<number, ProductCategoryTree>();
  for (const pidStr of productIds) {
    const pNum = Number(pidStr);
    if (!Number.isFinite(pNum) || pNum <= 0) continue;
    const tree = trees[`${orgNum}:${pNum}`] ?? [];
    for (const c of tree) {
      if (!c.is_active) continue;
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
    const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
    return ao - bo || a.name.localeCompare(b.name);
  });
}

/** productId -> categoryId -> subcategory ids */
type ExplicitRuleScope = { byProduct: Map<number, Map<number, Set<number>>> };

function toNumSet(s: Set<number> | Iterable<number>): Set<number> {
  const out = new Set<number>();
  for (const x of s) {
    const n = Number(x);
    if (Number.isFinite(n)) out.add(Math.trunc(n));
  }
  return out;
}

/** Find category node in any product tree involved in the scope (category ids are org-scoped). */
function findCategoryInScopeTrees(
  orgNum: number,
  scope: ExplicitRuleScope,
  trees: Record<string, ProductCategoryTree[]>,
  categoryId: number
): ProductCategoryTree | null {
  const cid = Math.trunc(Number(categoryId));
  if (!Number.isFinite(cid)) return null;
  for (const pid of scope.byProduct.keys()) {
    const tree = trees[`${orgNum}:${pid}`] ?? [];
    const cat = tree.find((x) => Number(x.id) === cid);
    if (cat) return cat;
  }
  return null;
}

/**
 * Build category list and sub list directly from explicit scope + trees so we never drop subs that
 * `collectSubcategoriesFromCategories` would miss (avoids false null from explicitScopeToConditions → erroneous deletes).
 */
function collectCategoryAndSubsFromExplicitScope(
  orgNum: number,
  scope: ExplicitRuleScope,
  trees: Record<string, ProductCategoryTree[]>
): { categoryCfgs: ProductCategoryTree[]; subEntries: { id: number; name: string }[] } {
  const catById = new Map<number, ProductCategoryTree>();
  const subById = new Map<number, { id: number; name: string }>();

  for (const [p, catMap] of scope.byProduct) {
    const tree = trees[`${orgNum}:${p}`] ?? [];
    for (const [c, subs] of catMap) {
      const catId = Math.trunc(Number(c));
      if (!Number.isFinite(catId)) continue;
      let cat: ProductCategoryTree | null | undefined = tree.find((x) => Number(x.id) === catId);
      if (!cat) cat = findCategoryInScopeTrees(orgNum, scope, trees, catId);
      if (cat && !catById.has(catId)) catById.set(catId, cat);

      for (const sid of subs) {
        const n = Math.trunc(Number(sid));
        if (!Number.isFinite(n) || subById.has(n)) continue;
        const name =
          findSubcategoryNameInProductTree(tree, catId, n) ?? `Sub-category ${n}`;
        subById.set(n, { id: n, name });
      }
    }
  }

  /** Tree missing categories (stale ids) but subs were collected — build minimal rows so conditions can be saved. */
  if (catById.size === 0 && subById.size > 0) {
    for (const [p, catMap] of scope.byProduct) {
      for (const [c, subs] of catMap) {
        const catId = Math.trunc(Number(c));
        if (!Number.isFinite(catId) || catById.has(catId)) continue;
        const subList: ProductSubcategory[] = [];
        for (const sid of subs) {
          const n = Math.trunc(Number(sid));
          if (!Number.isFinite(n)) continue;
          const entry = subById.get(n);
          subList.push({
            id: n,
            category_id: catId,
            name: entry?.name ?? `Sub-category ${n}`,
            sort_order: 0,
            is_active: true,
          });
        }
        subList.sort((a, b) => {
          const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
          const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
          return ao - bo || a.name.localeCompare(b.name);
        });
        catById.set(catId, {
          id: catId,
          organisation_id: orgNum,
          product_id: Number(p),
          name: `Category ${catId}`,
          sort_order: 0,
          is_active: true,
          subcategories: subList,
        });
      }
    }
  }

  const categoryCfgs = Array.from(catById.values()).sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
    const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
    return ao - bo || a.name.localeCompare(b.name);
  });
  const subEntries = Array.from(subById.values()).sort((a, b) => a.id - b.id);
  return { categoryCfgs, subEntries };
}

function cloneExplicitScope(scope: ExplicitRuleScope): ExplicitRuleScope {
  const byProduct = new Map<number, Map<number, Set<number>>>();
  for (const [p, cm] of scope.byProduct) {
    const n = new Map<number, Set<number>>();
    for (const [c, subs] of cm) n.set(c, new Set(subs));
    byProduct.set(p, n);
  }
  return { byProduct };
}

/**
 * Remove the overlap between an existing stored rule and the rule being saved (newScope), from the stored rule.
 *
 * Per product (e.g. ATT, LEV, PAY, EXP):
 * 1) For each category that exists in **both** rules for that product: remove overlapping sub-category ids only.
 *    If a category has no subs left → drop that category.
 * 2) If no categories remain for that product → drop the product from the stored rule (minimal removal; other products
 *    on the same rule are unchanged).
 *
 * Mixed example: new rule selects PAY+EXP with EXP categories ZZ+XX (all subs there) and PAY with only some subs
 * (PA, PB, QA, QB) — only those overlapping subs/categories are removed from the stored rule; other products on the
 * stored rule are unchanged.
 *
 * **Multiple existing rules:** the save handler runs this once per other rule in the org; each rule is patched from its
 * own pre-save scope vs the same newScope (not chained).
 */
function subtractOverlapFromOldScope(oldScope: ExplicitRuleScope, newScope: ExplicitRuleScope): {
  result: ExplicitRuleScope;
  hadOverlap: boolean;
} {
  const result = cloneExplicitScope(oldScope);
  let hadOverlap = false;

  for (const [p, oldCatMap] of oldScope.byProduct) {
    const newCatMap = newScope.byProduct.get(p);
    if (!newCatMap) continue;

    const outCatMap = result.byProduct.get(p);
    if (!outCatMap) continue;

    /** Always subtract per category (same outcome as map-equal when overlap is 100% for that product). */
    for (const [c, oldSubs] of oldCatMap) {
      const newSubs = newCatMap.get(c);
      if (!newSubs) continue;

      const oldN = toNumSet(oldSubs);
      const newN = toNumSet(newSubs);
      const inter = new Set<number>();
      for (const sid of oldN) {
        if (newN.has(sid)) inter.add(sid);
      }
      if (inter.size === 0) continue;

      hadOverlap = true;
      const nextSubs = new Set<number>();
      for (const sid of oldN) {
        if (!inter.has(sid)) nextSubs.add(sid);
      }
      if (nextSubs.size === 0) {
        outCatMap.delete(c);
      } else {
        outCatMap.set(c, nextSubs);
      }
    }

    if (outCatMap.size === 0) {
      result.byProduct.delete(p);
    }
  }

  return { result, hadOverlap };
}

function parseNumericId(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseStoredRuleToExplicitScope(
  orgNum: number,
  rule: RoutingRule,
  trees: Record<string, ProductCategoryTree[]>
): ExplicitRuleScope | null {
  const conditions = safeParseObject(rule.conditions_json);
  const rawProductIds = conditions["product_ids"];
  const productIds =
    Array.isArray(rawProductIds) && rawProductIds.every((x) => typeof x === "number" || typeof x === "string")
      ? rawProductIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : parseNumericId(conditions["product_id"]) !== null
        ? [parseNumericId(conditions["product_id"])!]
        : [];
  if (productIds.length === 0) return null;

  const ms = getMatchScope(conditions);
  const categoriesAll = ms?.categories === "all";
  const subsAll = ms?.subcategories === "all";

  const rawCategoryIds = conditions["category_ids"];
  let categoryIds: number[] =
    Array.isArray(rawCategoryIds) && rawCategoryIds.every((x) => typeof x === "number" || typeof x === "string")
      ? rawCategoryIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      : [];
  const singleCat = parseNumericId(conditions["category_id"]);
  if (categoryIds.length === 0 && singleCat !== null) categoryIds = [singleCat];

  /** Some API payloads store category names but omit ids — resolve against each product tree. */
  if (categoryIds.length === 0 && !categoriesAll) {
    const rawNames = conditions["categories"];
    if (Array.isArray(rawNames) && rawNames.every((x) => typeof x === "string")) {
      const nameSet = new Set((rawNames as string[]).map((s) => s.trim()).filter(Boolean));
      const seen = new Set<number>();
      for (const pid of productIds) {
        const tree = trees[`${orgNum}:${pid}`] ?? [];
        for (const c of tree) {
          if (!c.is_active) continue;
          const cid = Math.trunc(Number(c.id));
          if (!Number.isFinite(cid)) continue;
          if (nameSet.has(c.name) && !seen.has(cid)) {
            seen.add(cid);
            categoryIds.push(cid);
          }
        }
      }
    }
  }

  const rawSubIds = conditions["sub_category_ids"];
  let subIds: number[] =
    Array.isArray(rawSubIds) && rawSubIds.every((x) => typeof x === "number" || typeof x === "string")
      ? rawSubIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      : [];
  const singleSub = parseNumericId(conditions["sub_category_id"]);
  if (subIds.length === 0 && singleSub !== null) subIds = [singleSub];

  if (categoryIds.length === 0 && !categoriesAll && subIds.length > 0) {
    const seen = new Set<number>();
    for (const pid of productIds) {
      const tree = trees[`${orgNum}:${pid}`] ?? [];
      for (const cid of inferCategoryIdsFromSubIdsInTree(tree, subIds)) {
        if (!seen.has(cid)) {
          seen.add(cid);
          categoryIds.push(cid);
        }
      }
    }
  }

  const byProduct = new Map<number, Map<number, Set<number>>>();

  for (const pid of productIds) {
    const tree = trees[`${orgNum}:${pid}`] ?? [];
    const activeCats = tree.filter((c) => c.is_active);
    const catIdSet = new Set(categoryIds.map((x) => Math.trunc(Number(x))).filter((n) => Number.isFinite(n)));
    const cats = categoriesAll ? activeCats : activeCats.filter((c) => catIdSet.has(Math.trunc(Number(c.id))));
    const catMap = new Map<number, Set<number>>();
    const subIdSet = new Set(subIds.map((x) => Math.trunc(Number(x))).filter((n) => Number.isFinite(n)));
    for (const c of cats) {
      const cid = Math.trunc(Number(c.id));
      if (!Number.isFinite(cid)) continue;
      const activeSubs = (c.subcategories ?? []).filter((s) => s.is_active);
      const subs = subsAll
        ? activeSubs.map((s) => Math.trunc(Number(s.id))).filter((n) => Number.isFinite(n))
        : activeSubs
            .filter((s) => subIdSet.has(Math.trunc(Number(s.id))))
            .map((s) => Math.trunc(Number(s.id)))
            .filter((n) => Number.isFinite(n));
      if (subs.length === 0) continue;
      catMap.set(cid, new Set(subs));
    }
    if (catMap.size > 0) byProduct.set(pid, catMap);
  }

  if (byProduct.size === 0) return null;
  return { byProduct };
}

function buildExplicitScopeFromResolvedDraft(
  orgNum: number,
  productIds: string[],
  selectedCategoryCfgs: ProductCategoryTree[],
  selectedSubCfgs: { id: number }[],
  categoriesAll: boolean,
  subsAll: boolean,
  trees: Record<string, ProductCategoryTree[]>
): ExplicitRuleScope | null {
  const byProduct = new Map<number, Map<number, Set<number>>>();
  for (const pidStr of productIds) {
    const pid = Number(pidStr);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    const tree = trees[`${orgNum}:${pid}`] ?? [];
    const activeCats = tree.filter((c) => c.is_active);
    const cats = categoriesAll ? activeCats : activeCats.filter((c) => selectedCategoryCfgs.some((x) => x.id === c.id));
    const catMap = new Map<number, Set<number>>();
    for (const c of cats) {
      const cid = Math.trunc(Number(c.id));
      if (!Number.isFinite(cid)) continue;
      const activeSubs = (c.subcategories ?? []).filter((s) => s.is_active);
      const subs = subsAll
        ? activeSubs.map((s) => Math.trunc(Number(s.id))).filter((n) => Number.isFinite(n))
        : activeSubs
            .filter((s) => selectedSubCfgs.some((x) => Math.trunc(Number(x.id)) === Math.trunc(Number(s.id))))
            .map((s) => Math.trunc(Number(s.id)))
            .filter((n) => Number.isFinite(n));
      if (subs.length === 0) continue;
      catMap.set(cid, new Set(subs));
    }
    if (catMap.size > 0) byProduct.set(pid, catMap);
  }
  if (byProduct.size === 0) return null;
  return { byProduct };
}

/** Resolve sub-category display name; IDs from API may be string | number. */
function findSubcategoryNameInProductTree(
  tree: ProductCategoryTree[],
  categoryId: number,
  subId: number
): string | null {
  const sid = Number(subId);
  if (!Number.isFinite(sid)) return null;
  const cat = tree.find((x) => Number(x.id) === Number(categoryId));
  const underCat = cat?.subcategories?.find((s) => Number(s.id) === sid);
  if (underCat?.name) return String(underCat.name);
  for (const c of tree) {
    for (const s of c.subcategories ?? []) {
      if (Number(s.id) === sid && s.name) return String(s.name);
    }
  }
  return null;
}

/** Pair sub_category_ids with sub_categories from stored rule JSON when the tree lookup fails. */
function buildSubCategoryNameMapFromConditions(conditions: Record<string, unknown>): Map<number, string> {
  const m = new Map<number, string>();
  const ids = conditions["sub_category_ids"];
  const names = conditions["sub_categories"];
  if (Array.isArray(ids) && Array.isArray(names)) {
    const len = Math.min(ids.length, names.length);
    for (let i = 0; i < len; i++) {
      const n = Number(ids[i]);
      const nm = names[i];
      if (Number.isFinite(n) && typeof nm === "string" && nm.trim()) m.set(Math.trunc(n), nm.trim());
    }
  }
  const sid = parseNumericId(conditions["sub_category_id"]);
  const sn = conditions["sub_category"];
  if (sid !== null && typeof sn === "string" && sn.trim()) m.set(sid, sn.trim());
  return m;
}

function describeScopeIntersection(
  oldScope: ExplicitRuleScope,
  newScope: ExplicitRuleScope,
  orgNum: number,
  trees: Record<string, ProductCategoryTree[]>,
  productNameById: Map<string, string>,
  fallbackSubNames?: Map<number, string>
): string[] {
  const lines: string[] = [];
  for (const [p, oldM] of oldScope.byProduct) {
    const newM = newScope.byProduct.get(p);
    if (!newM) continue;
    const pName = productNameById.get(String(p)) ?? `Product ${p}`;
    const tree = trees[`${orgNum}:${p}`] ?? [];
    for (const [c, oldS] of oldM) {
      const newS = newM.get(c);
      if (!newS) continue;
      const oldN = toNumSet(oldS);
      const newNn = toNumSet(newS);
      const inter: number[] = [];
      for (const sid of oldN) {
        if (newNn.has(sid)) inter.push(sid);
      }
      if (inter.length === 0) continue;
      const cat = tree.find((x) => Number(x.id) === Number(c));
      const catName = cat?.name ?? `Category ${c}`;
      const subNames = inter.map((sid) => {
        return (
          findSubcategoryNameInProductTree(tree, c, sid) ??
          fallbackSubNames?.get(sid) ??
          `Sub-category ${sid}`
        );
      });
      lines.push(`${pName} › ${catName} › ${subNames.join(", ")}`);
    }
  }
  return lines;
}

function explicitScopeToConditions(
  scope: ExplicitRuleScope,
  orgNum: number,
  trees: Record<string, ProductCategoryTree[]>,
  products: Product[],
  priority: Priority,
  startLevel: string
): Record<string, unknown> | null {
  if (scope.byProduct.size === 0) return null;

  const productNums = [...scope.byProduct.keys()].sort((a, b) => a - b);
  const productIdStrs = productNums.map(String);

  const { categoryCfgs, subEntries } = collectCategoryAndSubsFromExplicitScope(orgNum, scope, trees);
  if (subEntries.length === 0) return null;

  const allCategoriesMode = resolveEffectiveCategoriesForProducts(orgNum, productIdStrs, trees, []);
  const categoriesAll =
    allCategoriesMode.length > 0 && setsEqualCategoryIds(categoryCfgs, allCategoriesMode);

  const allSubsFromCats = collectSubcategoriesFromCategories(categoryCfgs);
  const subIdSet = new Set(subEntries.map((s) => s.id));
  const subsAll =
    allSubsFromCats.length === 0 ||
    (allSubsFromCats.length === subIdSet.size && allSubsFromCats.every((s) => subIdSet.has(s.id)));

  const selectedProducts = productNums.map((pid) => {
    const found = products.find((p) => String(p.id) === String(pid));
    return (
      found ?? {
        id: pid,
        name: `Product ${pid}`,
        code: "",
        default_ticket_prefix: "",
      }
    );
  });
  const firstProduct = selectedProducts[0] ?? null;
  const firstCategoryCfg = categoryCfgs[0] ?? null;
  const firstSubCfg = subEntries[0] ?? null;
  if (!firstProduct || !firstCategoryCfg || !firstSubCfg) return null;

  const categoryIdNums = categoryCfgs.map((c) => c.id).filter((n) => Number.isFinite(n));

  return {
    product_id: Number(firstProduct.id),
    product_ids: productNums,
    product_name: firstProduct?.name ?? null,
    product_names: selectedProducts.map((p) => p.name),
    product_code: firstProduct?.code ?? null,
    product_codes: selectedProducts.map((p) => p.code),

    category_id: firstCategoryCfg?.id ?? null,
    category_ids: categoryIdNums,
    category: firstCategoryCfg?.name ?? null,
    categories: categoryCfgs.map((c) => c.name),

    sub_category_id: firstSubCfg?.id ?? null,
    sub_category: firstSubCfg?.name ?? null,
    sub_category_ids: subEntries.map((s) => s.id),
    sub_categories: subEntries.map((s) => s.name),
    match_scope: {
      categories: categoriesAll ? "all" : "explicit",
      subcategories: subsAll ? "all" : "explicit",
    },
    priority,
    start_level: startLevel,
  };
}

type MultiSelectOption = { id: string; label: string };
function MultiSelectDropdown(props: {
  label: string;
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** When set, shows this single label instead of listing every selected option (e.g. "All"). */
  summaryOverride?: string | null;
}) {
  const { label, options, selectedIds, onChange, placeholder, disabled, summaryOverride } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedLabels = useMemo(() => {
    const byId = new Map(options.map((o) => [o.id, o.label] as const));
    return selectedIds.map((id) => byId.get(id)).filter((x): x is string => typeof x === "string");
  }, [options, selectedIds]);

  const summaryLabels = summaryOverride
    ? [summaryOverride]
    : selectedLabels.length > 0
      ? selectedLabels
      : placeholder
        ? [placeholder]
        : [];

  return (
    <div ref={wrapRef} className="relative">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">{label}</div>
      <button
        type="button"
        className="mt-1 flex w-full items-center justify-between rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <div className="min-w-0 flex flex-wrap items-center gap-1">
          {summaryLabels.length === 0 ? (
            <span className="text-slate-500 dark:text-slate-400">Select</span>
          ) : (
            <>
              {summaryLabels.slice(0, 2).map((t, idx) => (
                <span
                  key={`${t}:${idx}`}
                  className={
                    summaryOverride || selectedLabels.length > 0
                      ? "rounded-full bg-[#1E88E5]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1E88E5]"
                      : "text-slate-500 dark:text-slate-400"
                  }
                >
                  {t}
                </span>
              ))}
              {!summaryOverride && selectedLabels.length > 2 ? (
                <span className="rounded-full bg-[#1E88E5]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1E88E5]">
                  +{selectedLabels.length - 2}
                </span>
              ) : null}
            </>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-[90] mt-2 max-h-40 overflow-auto rounded-xl border border-black/10 bg-white/95 p-2 shadow-lg dark:border-white/15 dark:bg-[#080D16]/95">
          {options.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400">No options</div>
          ) : (
            <div className="grid gap-1">
              {options.map((opt) => {
                const checked = selectedSet.has(opt.id);
                return (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? Array.from(new Set([...selectedIds, opt.id]))
                          : selectedIds.filter((x) => x !== opt.id);
                        onChange(next);
                      }}
                      className="h-4 w-4 accent-[#1E88E5]"
                    />
                    <span className="whitespace-nowrap text-[11px]">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function extractLevelFromRoleName(roleName: string): StartLevel | null {
  const s = String(roleName ?? "").toLowerCase().trim();
  // Supports patterns like:
  // - "l4 engineer"
  // - "L5_custom_role"
  // - "level l3 specialist"
  const m = s.match(/\bl\s*([0-9]+)(?=\b|_|\s|$)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  return `L${Math.trunc(n)}`;
}

function emptyDraft(defaultOrgId: string): RuleDraft {
  return {
    orgId: defaultOrgId,
    isGlobal: defaultOrgId === "1",
    name: "",
    productIds: [],
    categoryIds: [],
    subCategoryIds: [],
    categoryNamesFallback: [],
    subCategoryNamesFallback: [],
    priority: "P3",
    startLevel: "L1",
    isActive: true,
  };
}

function getIsGlobalDefaultFromRule(rule: RoutingRule): boolean {
  const actions = safeParseObject(rule.actions_json);
  const raw = actions["is_global_default"];
  // New model: global defaults are explicitly flagged in actions_json.
  if (raw !== undefined) {
    if (raw === true) return true;
    if (raw === "true" || raw === "1") return true;
    if (raw === 1) return true;
    return false;
  }
  // Backward compatibility: old rules had no flag, treat organisation_id=1 rules as global defaults.
  return Number(rule.organisation_id) === 1;
}

function sanitizeRoutingConditions(conditions: Record<string, unknown>): Record<string, unknown> {
  const next = { ...conditions };
  delete next["priority"];
  return next;
}

export function RoutingRulesPage({ orgId }: { orgId: string }) {
  const authUser = useAuthStore((s) => s.user);
  const isSystemAdminUser =
    String(authUser?.role_name ?? "").toLowerCase().trim() === "admin" &&
    String(authUser?.org_id ?? "") === "1" &&
    String(authUser?.user_id ?? "") === "1" &&
    String(authUser?.role_id ?? "") === "1" &&
    String(authUser?.user_type_id ?? "") === "1";
  const isOrgScopedAdmin = !isSystemAdminUser;

  const shellOrgId = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);
  const defaultSelectedOrgId = useMemo(() => {
    if (!isSystemAdminUser) return shellOrgId ? String(shellOrgId) : "1";
    // System admin defaults to Ezii HQ rules context.
    return "1";
  }, [isSystemAdminUser, shellOrgId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allRules, setAllRules] = useState<RoutingRule[]>([]);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryTreeByOrgProduct, setCategoryTreeByOrgProduct] = useState<Record<string, ProductCategoryTree[]>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetRule, setDeleteTargetRule] = useState<RoutingRule | null>(null);
  /** When true, show global-default scope choice (all org vs selected); otherwise a simple confirm. */
  const [deleteConfirmGlobalChoice, setDeleteConfirmGlobalChoice] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  const [createConflictItems, setCreateConflictItems] = useState<{ rule: RoutingRule; overlapLines: string[] }[]>([]);
  const [createPendingPayload, setCreatePendingPayload] = useState<
    | ({
        mode: "create";
        patches: ({ kind: "update"; rule: RoutingRule; conditions: Record<string, unknown> } | { kind: "delete"; rule: RoutingRule })[];
        createBody: {
          organisation_id: number;
          name: string;
          is_active: boolean;
          conditions_json: string;
          actions_json: string;
        };
      } | {
        mode: "edit";
        patches: ({ kind: "update"; rule: RoutingRule; conditions: Record<string, unknown> } | { kind: "delete"; rule: RoutingRule })[];
        editBody: {
          ruleId: number;
          payload: {
            name: string;
            is_active: boolean;
            conditions_json: string;
            actions_json: string;
          };
        };
      })
    | null
  >(null);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft(orgId));
  const [selectedOrgId, setSelectedOrgId] = useState<string>(defaultSelectedOrgId);
  const [rolesForLevels, setRolesForLevels] = useState<Role[]>([]);
  const [filter, setFilter] = useState<{ orgId: string; category: string; subCategory: string }>({
    orgId: "all",
    category: "all",
    subCategory: "all",
  });

  const modalOpen = createOpen || editOpen;
  const levelsOrgId = useMemo(() => {
    if (!draft.orgId) return 1;
    if (draft.isGlobal) return 1;
    const n = Number(draft.orgId);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
  }, [draft.orgId, draft.isGlobal]);

  const startLevelsOptions = useMemo(() => {
    // Always include L1/L2/L3.
    const levelNumbers = new Set<number>(DEFAULT_START_LEVELS.map((l) => Number(l.replace("L", ""))));
    for (const r of rolesForLevels) {
      const lvl = extractLevelFromRoleName(r.name);
      if (!lvl) continue;
      const n = Number(lvl.replace("L", ""));
      if (Number.isFinite(n) && n >= 1) levelNumbers.add(Math.trunc(n));
    }
    const sorted = Array.from(levelNumbers).sort((a, b) => a - b);
    return sorted.map((n) => `L${n}`);
  }, [rolesForLevels]);

  useEffect(() => {
    if (!modalOpen) return;
    void listRoles(levelsOrgId)
      .then((r) => setRolesForLevels(r))
      .catch(() => setRolesForLevels([]));
  }, [modalOpen, levelsOrgId]);

  useEffect(() => {
    if (!modalOpen) return;
    if (!startLevelsOptions.includes(draft.startLevel)) {
      setDraft((d) => ({ ...d, startLevel: "L1" }));
    }
  }, [modalOpen, startLevelsOptions, draft.startLevel]);

  async function load() {
    if (!shellOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const productsRes = await listProducts();
      setProducts(productsRes);
      const ext = await getExternalOrganizations().catch(() => []);
      setExternalOrgs(ext);

      if (isSystemAdminUser) {
        const orgList = await listOrganisations();
        const hasGlobalOrg = orgList.some((o) => Number(o.id) === 1);
        const orgsWithGlobal = hasGlobalOrg
          ? orgList
          : ([{ id: 1, name: "Ezii HQ (Global Defaults)" } as Organisation, ...orgList]);
        setOrgs(orgsWithGlobal);
      } else {
        setOrgs([{ id: shellOrgId, name: `Organization ${shellOrgId}` } as Organisation]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load routing rules");
      setAllRules([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellOrgId, isSystemAdminUser]);

  useEffect(() => {
    setSelectedOrgId(defaultSelectedOrgId);
  }, [defaultSelectedOrgId]);

  useEffect(() => {
    if (!isOrgScopedAdmin) return;
    setFilter((prev) => ({ ...prev, orgId: selectedOrgId || defaultSelectedOrgId }));
  }, [isOrgScopedAdmin, selectedOrgId, defaultSelectedOrgId]);

  const fetchRulesForSelectedOrg = useCallback(async (orgIdOverride?: string) => {
    const orgIdToUse = orgIdOverride ?? selectedOrgId;
    const orgNum = Number(orgIdToUse);
    if (!Number.isFinite(orgNum)) {
      setAllRules([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rules = await listRoutingRules(orgNum, { includeGlobal: true });
      setAllRules(rules);
    } catch (e) {
      setAllRules([]);
      setError(e instanceof Error ? e.message : "Failed to load routing rules");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    void fetchRulesForSelectedOrg();
  }, [fetchRulesForSelectedOrg]);

  const ensureTree = useCallback(
    async (orgIdValue: number, productIdValue: number) => {
      const key = `${orgIdValue}:${productIdValue}`;
      if (categoryTreeByOrgProduct[key]) return categoryTreeByOrgProduct[key];
      const tree = await listProductCategoriesTree(orgIdValue, productIdValue);
      setCategoryTreeByOrgProduct((prev) => ({ ...prev, [key]: tree }));
      return tree;
    },
    [categoryTreeByOrgProduct]
  );

  const ruleViews = useMemo(() => {
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
    return allRules.map((rule) => {
      const conditions = safeParseObject(rule.conditions_json);
      const ms = getMatchScope(conditions);
      const matchesAllCategories = ms?.categories === "all";
      const matchesAllSubcategories = ms?.subcategories === "all";
      const rawSubCategories = conditions["sub_categories"];
      const subCategories =
        Array.isArray(rawSubCategories) && rawSubCategories.every((x) => typeof x === "string")
          ? (rawSubCategories as string[])
          : typeof conditions["sub_category"] === "string"
            ? [conditions["sub_category"] as string]
            : [];
      const categoryName = typeof conditions["category"] === "string" ? conditions["category"] : "-";
      return {
        rule,
        orgName: orgMap.get(rule.organisation_id) ?? `Org ${rule.organisation_id}`,
        productName:
          typeof conditions["product_name"] === "string" ? conditions["product_name"] : "-",
        category: matchesAllCategories ? "All" : categoryName,
        subCategories: subCategories.length > 0 ? subCategories : ["-"],
        matchesAllCategories,
        matchesAllSubcategories,
        categoryDisplay: matchesAllCategories ? "All" : categoryName,
        subCategoriesDisplay: matchesAllSubcategories ? "All" : subCategories.length > 0 ? subCategories.join(", ") : "-",
        startLevel: getStartLevelFromRule(rule),
      } as RuleView;
    });
  }, [allRules, orgs]);

  const filteredRules = useMemo(() => {
    return ruleViews.filter((v) => {
      if (filter.orgId !== "all" && String(v.rule.organisation_id) !== filter.orgId) return false;
      if (filter.category !== "all" && !v.matchesAllCategories && v.category !== filter.category) return false;
      if (filter.subCategory !== "all" && !v.matchesAllSubcategories && !v.subCategories.includes(filter.subCategory)) return false;
      return true;
    });
  }, [ruleViews, filter]);

  const stats = useMemo(() => {
    const active = filteredRules.filter((r) => r.rule.is_active).length;
    const paused = filteredRules.filter((r) => !r.rule.is_active).length;
    return { active, paused, total: filteredRules.length };
  }, [filteredRules]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    filteredRules.forEach((r) => {
      if (r.category !== "-") set.add(r.category);
    });
    return Array.from(set);
  }, [filteredRules]);

  const subCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    filteredRules.forEach((r) => {
      r.subCategories.forEach((sc) => {
        if (sc !== "-") set.add(sc);
      });
    });
    return Array.from(set);
  }, [filteredRules]);

  const orgDropdownOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const o of externalOrgs) {
      if (!o.id) continue;
      byId.set(String(o.id), o.organization_name || `Organization ${o.id}`);
    }
    if (!byId.has("1")) byId.set("1", "Ezii HQ");
    if (selectedOrgId && !byId.has(selectedOrgId)) {
      byId.set(selectedOrgId, `Organization ${selectedOrgId}`);
    }
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
  }, [externalOrgs, selectedOrgId]);

  const sortedExecution = useMemo(() => filteredRules, [filteredRules]);

  function openCreate() {
    setDraft(emptyDraft(selectedOrgId || (shellOrgId ? String(shellOrgId) : "1")));
    setCreateOpen(true);
  }

  function openEdit(rule: RoutingRule) {
    const conditions = safeParseObject(rule.conditions_json);
    const priority = getPriorityFromRule(rule);
    const rawProductIds = conditions["product_ids"];
    const productIds =
      Array.isArray(rawProductIds) && rawProductIds.every((x) => typeof x === "number" || typeof x === "string")
        ? rawProductIds.map((x) => String(x))
        : typeof conditions["product_id"] === "number"
          ? [String(conditions["product_id"])]
          : [];

    const rawCategoryIds = conditions["category_ids"];
    const categoryIds =
      Array.isArray(rawCategoryIds) && rawCategoryIds.every((x) => typeof x === "number" || typeof x === "string")
        ? rawCategoryIds.map((x) => String(x))
        : typeof conditions["category_id"] === "number"
          ? [String(conditions["category_id"])]
          : [];

    const rawCategoryNames = conditions["categories"];
    const categoryNamesFallback =
      categoryIds.length > 0
        ? []
        : Array.isArray(rawCategoryNames) && rawCategoryNames.every((x) => typeof x === "string")
          ? (rawCategoryNames as string[])
          : typeof conditions["category"] === "string"
            ? [conditions["category"] as string]
            : [];

    const rawSubCategoryIds = conditions["sub_category_ids"];
    const subCategoryIds =
      Array.isArray(rawSubCategoryIds) && rawSubCategoryIds.every((x) => typeof x === "number" || typeof x === "string")
        ? rawSubCategoryIds.map((x) => String(x))
        : typeof conditions["sub_category_id"] === "number"
          ? [String(conditions["sub_category_id"])]
          : [];

    const rawSubCategoryNames = conditions["sub_categories"];
    const subCategoryNamesFallback =
      subCategoryIds.length > 0
        ? []
        : Array.isArray(rawSubCategoryNames) && rawSubCategoryNames.every((x) => typeof x === "string")
          ? (rawSubCategoryNames as string[])
          : typeof conditions["sub_category"] === "string"
            ? [conditions["sub_category"] as string]
            : [];
    const startLevelRaw = getStartLevelFromRule(rule);
    const ms = getMatchScope(conditions);
    const categoriesAllSaved = ms?.categories === "all";
    const subcategoriesAllSaved = ms?.subcategories === "all";
    setEditingRule(rule);
    setDraft({
      orgId: String(rule.organisation_id),
      isGlobal: getIsGlobalDefaultFromRule(rule),
      name: rule.name,
      productIds,
      categoryIds: categoriesAllSaved ? [] : categoryIds,
      subCategoryIds: subcategoriesAllSaved ? [] : subCategoryIds,
      categoryNamesFallback,
      subCategoryNamesFallback,
      priority: (TICKET_PRIORITIES.includes(priority as Priority) ? priority : "P3") as Priority,
      startLevel: normalizeStartLevel(startLevelRaw),
      isActive: rule.is_active,
    });
    setEditOpen(true);
  }

  const selectedOrgNum = Number(draft.orgId);
  const selectedProductNums = useMemo(
    () => draft.productIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0),
    [draft.productIds]
  );

  const activeCategoryOptions = useMemo(() => {
    if (!Number.isFinite(selectedOrgNum)) return [];
    const byId = new Map<number, ProductCategoryTree>();
    for (const pNum of selectedProductNums) {
      const treeKey = `${selectedOrgNum}:${pNum}`;
      const selectedTree = categoryTreeByOrgProduct[treeKey] ?? [];
      for (const c of selectedTree) {
        if (!c.is_active) continue;
        if (!byId.has(c.id)) byId.set(c.id, c);
      }
    }
    return Array.from(byId.values()).sort((a, b) => {
      const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
      const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
      return ao - bo || a.name.localeCompare(b.name);
    });
  }, [selectedOrgNum, selectedProductNums, categoryTreeByOrgProduct]);

  const productNameById = useMemo(() => {
    return new Map(products.map((p) => [String(p.id), p.name]));
  }, [products]);

  const categoryDropdownOptions = useMemo(() => {
    return activeCategoryOptions.map((c) => {
      const productName = productNameById.get(String(c.product_id));
      const suffix = productName ? ` (${productName})` : "";
      return { id: String(c.id), label: `${c.name}${suffix}` };
    });
  }, [activeCategoryOptions, productNameById]);

  const categoriesForSubPicker = useMemo(() => {
    if (!Number.isFinite(selectedOrgNum)) return [];
    if (draft.productIds.length === 0) return [];
    return resolveEffectiveCategoriesForProducts(
      selectedOrgNum,
      draft.productIds,
      categoryTreeByOrgProduct,
      draft.categoryIds
    );
  }, [selectedOrgNum, draft.productIds, draft.categoryIds, categoryTreeByOrgProduct]);

  const allCategoriesModeCfgs = useMemo(() => {
    if (!Number.isFinite(selectedOrgNum)) return [];
    if (draft.productIds.length === 0) return [];
    return resolveEffectiveCategoriesForProducts(
      selectedOrgNum,
      draft.productIds,
      categoryTreeByOrgProduct,
      []
    );
  }, [selectedOrgNum, draft.productIds, categoryTreeByOrgProduct]);

  const categoriesSummaryIsAll = useMemo(
    () =>
      allCategoriesModeCfgs.length > 0 &&
      setsEqualCategoryIds(categoriesForSubPicker, allCategoriesModeCfgs),
    [categoriesForSubPicker, allCategoriesModeCfgs]
  );

  const activeSubCategoryOptions = useMemo(
    () => collectSubcategoriesFromCategories(categoriesForSubPicker),
    [categoriesForSubPicker]
  );

  const subsDisplayAll = useMemo(() => {
    if (activeSubCategoryOptions.length === 0) return true;
    return (
      draft.subCategoryIds.length === 0 ||
      (draft.subCategoryIds.length === activeSubCategoryOptions.length &&
        activeSubCategoryOptions.every((s) => draft.subCategoryIds.includes(String(s.id))))
    );
  }, [activeSubCategoryOptions, draft.subCategoryIds]);

  const subCategoryLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categoriesForSubPicker) {
      for (const s of cat.subcategories ?? []) {
        if (!s.is_active) continue;
        const sid = String(s.id);
        if (!map.has(sid)) map.set(sid, cat.name);
      }
    }
    return map;
  }, [categoriesForSubPicker]);

  const subCategoryDropdownOptions = useMemo(() => {
    return activeSubCategoryOptions.map((s) => {
      const parentCat = subCategoryLabelById.get(String(s.id));
      const suffix = parentCat ? ` (${parentCat})` : "";
      return { id: String(s.id), label: `${s.name}${suffix}` };
    });
  }, [activeSubCategoryOptions, subCategoryLabelById]);

  // Legacy fallback mapping: when existing rules store category/sub-category by name only,
  // convert them to ids once the category trees have loaded.
  useEffect(() => {
    if (draft.categoryIds.length > 0) return;
    if (draft.categoryNamesFallback.length === 0) return;
    if (activeCategoryOptions.length === 0) return;

    const mapped = activeCategoryOptions
      .filter((c) => draft.categoryNamesFallback.includes(c.name))
      .map((c) => String(c.id));

    if (mapped.length === 0) return;

    setDraft((d) => ({
      ...d,
      categoryIds: Array.from(new Set(mapped)),
      categoryNamesFallback: [],
      // Clearing to ensure sub-category mapping uses the updated category selection.
      subCategoryIds: [],
    }));
  }, [activeCategoryOptions, draft.categoryIds.length, draft.categoryNamesFallback, draft.subCategoryIds.length]);

  useEffect(() => {
    if (draft.subCategoryIds.length > 0) return;
    if (draft.subCategoryNamesFallback.length === 0) return;
    if (activeSubCategoryOptions.length === 0) return;

    const mapped = activeSubCategoryOptions
      .filter((s) => draft.subCategoryNamesFallback.includes(s.name))
      .map((s) => String(s.id));

    if (mapped.length === 0) return;

    setDraft((d) => ({
      ...d,
      subCategoryIds: Array.from(new Set(mapped)),
      subCategoryNamesFallback: [],
    }));
  }, [activeSubCategoryOptions, draft.subCategoryIds.length, draft.subCategoryNamesFallback]);
  const modalOrgOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const o of externalOrgs) {
      if (!o.id) continue;
      byId.set(String(o.id), o.organization_name || `Organization ${o.id}`);
    }
    for (const o of orgs) {
      const id = String(o.id);
      if (!byId.has(id)) byId.set(id, o.name);
    }
    if (draft.orgId && !byId.has(draft.orgId)) {
      byId.set(draft.orgId, `Organization ${draft.orgId}`);
    }
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
  }, [externalOrgs, orgs, draft.orgId]);

  useEffect(() => {
    if (!draft.orgId) return;
    const o = Number(draft.orgId);
    if (!Number.isFinite(o)) return;
    if (selectedProductNums.length === 0) return;
    void Promise.all(selectedProductNums.map((p) => ensureTree(o, p)))
      .then(() => undefined)
      .catch(() => toast.error("Failed to load categories"));
  }, [draft.orgId, selectedProductNums, ensureTree]);

  function tryBuildDraftPayload(
    treesSource: Record<string, ProductCategoryTree[]> = categoryTreeByOrgProduct
  ):
    | { ok: false; message: string }
    | {
        ok: true;
        orgIdValue: number;
        startLevel: string;
        conditions: Record<string, unknown>;
        actions: Record<string, unknown>;
        newExplicit: ExplicitRuleScope;
      } {
    const orgIdValue = Number(draft.orgId);
    const startLevel = normalizeStartLevel(draft.startLevel);
    if (!Number.isFinite(orgIdValue)) return { ok: false, message: "Select organization" };
    if (!draft.name.trim()) return { ok: false, message: "Rule name is required" };
    if (draft.productIds.length === 0) return { ok: false, message: "Select product" };
    const categoriesUnionFromTrees = collectActiveCategoryUnionFromTrees(selectedOrgNum, draft.productIds, treesSource);
    if (categoriesUnionFromTrees.length === 0) {
      return { ok: false, message: "No categories available for the selected products" };
    }

    const selectedProducts = products.filter((p) => draft.productIds.includes(String(p.id)));
    const firstProduct = selectedProducts[0] ?? null;

    const allCategoriesMode = resolveEffectiveCategoriesForProducts(
      selectedOrgNum,
      draft.productIds,
      treesSource,
      []
    );
    const selectedCategoryCfgs = resolveEffectiveCategoriesForProducts(
      selectedOrgNum,
      draft.productIds,
      treesSource,
      draft.categoryIds
    );

    const categoriesAll =
      allCategoriesMode.length > 0 && setsEqualCategoryIds(selectedCategoryCfgs, allCategoriesMode);

    const allSubsFromCats = collectSubcategoriesFromCategories(selectedCategoryCfgs);

    const effectiveSubIds =
      draft.subCategoryIds.length > 0
        ? draft.subCategoryIds
        : allSubsFromCats.map((s) => String(s.id));

    const selectedSubCfgs = allSubsFromCats.filter((s) => effectiveSubIds.includes(String(s.id)));
    const firstCategoryCfg = selectedCategoryCfgs[0] ?? null;
    const firstSubCfg = selectedSubCfgs[0] ?? null;

    const subsAll =
      allSubsFromCats.length === 0 ||
      draft.subCategoryIds.length === 0 ||
      (draft.subCategoryIds.length === allSubsFromCats.length &&
        allSubsFromCats.every((s) => draft.subCategoryIds.includes(String(s.id))));

    if (!firstProduct) return { ok: false, message: "Select product" };
    if (!firstCategoryCfg) return { ok: false, message: "Select category" };
    if (!firstSubCfg) return { ok: false, message: "No sub-categories available for the selected categories" };

    const productIdNums = draft.productIds.map((id) => Number(id)).filter((n) => Number.isFinite(n));
    const categoryIdNums = [
      ...new Set(selectedCategoryCfgs.map((c) => Number(c.id)).filter((n) => Number.isFinite(n))),
    ].sort((a, b) => a - b);
    const catNameById = new Map(selectedCategoryCfgs.map((c) => [Number(c.id), c.name]));
    const subIdSorted = [...new Set(selectedSubCfgs.map((s) => Number(s.id)).filter((n) => Number.isFinite(n)))].sort(
      (a, b) => a - b
    );
    const subNameById = new Map(selectedSubCfgs.map((s) => [Number(s.id), s.name]));

    const conditions = {
      product_id: firstProduct ? Number(firstProduct.id) : null,
      product_ids: productIdNums,
      product_name: firstProduct?.name ?? null,
      product_names: selectedProducts.map((p) => p.name),
      product_code: firstProduct?.code ?? null,
      product_codes: selectedProducts.map((p) => p.code),

      category_id: firstCategoryCfg?.id ?? null,
      /** Always persist numeric category ids alongside sub_category_ids (server also hydrates if missing). */
      category_ids: categoryIdNums,
      category: firstCategoryCfg?.name ?? null,
      categories: categoryIdNums.map((id) => catNameById.get(id) ?? `Category ${id}`),

      sub_category_id: firstSubCfg?.id ?? null,
      sub_category: firstSubCfg?.name ?? null,
      sub_category_ids: subIdSorted,
      sub_categories: subIdSorted.map((id) => subNameById.get(id) ?? `Sub ${id}`),
      match_scope: {
        categories: categoriesAll ? "all" : "explicit",
        subcategories: subsAll ? "all" : "explicit",
      },
      priority: draft.priority,
      start_level: startLevel,
    };
    const actions = { is_global_default: draft.isGlobal, start_level: startLevel };

    const newExplicit = buildExplicitScopeFromResolvedDraft(
      selectedOrgNum,
      draft.productIds,
      selectedCategoryCfgs,
      selectedSubCfgs,
      categoriesAll,
      subsAll,
      treesSource
    );
    if (!newExplicit) return { ok: false, message: "Could not resolve rule scope" };

    return { ok: true, orgIdValue, startLevel, conditions, actions, newExplicit };
  }

  async function confirmCreateWithConflictResolution() {
    if (!createPendingPayload) return;
    setSaving(true);
    try {
      for (const p of createPendingPayload.patches) {
        if (p.kind === "delete") {
          await deleteRoutingRule(p.rule.id, { scope: "org" });
        } else {
          await updateRoutingRule(p.rule.id, {
            conditions_json: JSON.stringify(sanitizeRoutingConditions(p.conditions)),
          });
        }
      }
      if (createPendingPayload.mode === "create") {
        await createRoutingRule(createPendingPayload.createBody);
        toast.success("Routing rule created; overlapping scope was removed from existing rules.");
        setCreateOpen(false);
      } else {
        await updateRoutingRule(createPendingPayload.editBody.ruleId, createPendingPayload.editBody.payload);
        toast.success("Routing rule updated; overlapping scope was removed from other rules.");
        setEditOpen(false);
      }
      setCreateConfirmOpen(false);
      setCreatePendingPayload(null);
      setCreateConflictItems([]);
      await fetchRulesForSelectedOrg();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save routing rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRuleClick() {
    const orgIdValueEarly = Number(draft.orgId);
    if (!Number.isFinite(orgIdValueEarly)) return toast.error("Select organization");

    const targetOrgId = draft.isGlobal ? 1 : orgIdValueEarly;

    /** Full list for the org being saved — not the page filter — so every existing rule for that org is checked. */
    let rulesForConflict: RoutingRule[];
    try {
      rulesForConflict = await listRoutingRules(targetOrgId, { includeGlobal: true });
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Failed to load rules for conflict check");
    }

    const productNumsToLoad = new Set<number>();
    for (const pid of draft.productIds) {
      const n = Number(pid);
      if (Number.isFinite(n) && n > 0) productNumsToLoad.add(n);
    }
    /** Include every rule returned by listRoutingRules (tenant + legacy globals on org 1). Do not filter by organisation_id. */
    for (const r of rulesForConflict) {
      const c = safeParseObject(r.conditions_json);
      const pids = c["product_ids"];
      if (Array.isArray(pids)) {
        for (const x of pids) {
          const n = Number(x);
          if (Number.isFinite(n) && n > 0) productNumsToLoad.add(n);
        }
      } else {
        const pid = parseNumericId(c["product_id"]);
        if (pid !== null) productNumsToLoad.add(pid);
      }
    }

    setSaving(true);
    const trees: Record<string, ProductCategoryTree[]> = { ...categoryTreeByOrgProduct };
    try {
      for (const pid of productNumsToLoad) {
        const key = `${selectedOrgNum}:${pid}`;
        if (trees[key]?.length) continue;
        const t = await listProductCategoriesTree(selectedOrgNum, pid);
        trees[key] = t;
        setCategoryTreeByOrgProduct((prev) => ({ ...prev, [key]: t }));
      }
    } catch {
      toast.error("Failed to load categories for conflict check");
      setSaving(false);
      return;
    }

    const built = tryBuildDraftPayload(trees);
    if (!built.ok) {
      toast.error(built.message);
      setSaving(false);
      return;
    }

    const conflictItems: { rule: RoutingRule; overlapLines: string[] }[] = [];
    const patches: (
      | { kind: "update"; rule: RoutingRule; conditions: Record<string, unknown> }
      | { kind: "delete"; rule: RoutingRule }
    )[] = [];

    const newExp = built.newExplicit;
    const nameMap = productNameById;

    for (const rule of rulesForConflict) {
      if (editOpen && editingRule && rule.id === editingRule.id) continue;
      const oldExp = parseStoredRuleToExplicitScope(selectedOrgNum, rule, trees);
      if (!oldExp) continue;
      const { result, hadOverlap } = subtractOverlapFromOldScope(oldExp, newExp);
      if (!hadOverlap) continue;

      const oldCond = safeParseObject(rule.conditions_json);
      const nameFallback = new Map<number, string>([
        ...buildSubCategoryNameMapFromConditions(oldCond),
        ...buildSubCategoryNameMapFromConditions(built.conditions as Record<string, unknown>),
      ]);
      const overlapLines = describeScopeIntersection(oldExp, newExp, selectedOrgNum, trees, nameMap, nameFallback);
      conflictItems.push({ rule, overlapLines });

      if (result.byProduct.size === 0) {
        patches.push({ kind: "delete", rule });
        continue;
      }

      const oldPriority = getPriorityFromRule(rule);
      const oldStart = getStartLevelFromRule(rule);
      const pr = (TICKET_PRIORITIES.includes(oldPriority as Priority) ? oldPriority : "P3") as Priority;
      const nextConditions = explicitScopeToConditions(
        result,
        selectedOrgNum,
        trees,
        products,
        pr,
        oldStart === "-" ? normalizeStartLevel(String(built.conditions["start_level"])) : normalizeStartLevel(oldStart)
      );
      if (!nextConditions) {
        patches.push({ kind: "delete", rule });
      } else {
        nextConditions["start_level"] =
          oldStart === "-" ? built.conditions["start_level"] : oldStart;
        patches.push({ kind: "update", rule, conditions: nextConditions });
      }
    }

    if (conflictItems.length === 0) {
      try {
        if (editOpen && editingRule) {
          await updateRoutingRule(editingRule.id, {
            name: draft.name.trim(),
            is_active: draft.isActive,
            conditions_json: JSON.stringify(sanitizeRoutingConditions(built.conditions)),
            actions_json: JSON.stringify(built.actions),
          });
          toast.success("Routing rule updated.");
          setEditOpen(false);
        } else {
          await createRoutingRule({
            organisation_id: targetOrgId,
            name: draft.name.trim(),
            is_active: draft.isActive,
            conditions_json: JSON.stringify(sanitizeRoutingConditions(built.conditions)),
            actions_json: JSON.stringify(built.actions),
          });
          toast.success("Routing rule created.");
          setCreateOpen(false);
        }
        await fetchRulesForSelectedOrg();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save routing rule");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (editOpen && editingRule) {
      setCreatePendingPayload({
        mode: "edit",
        patches,
        editBody: {
          ruleId: editingRule.id,
          payload: {
            name: draft.name.trim(),
            is_active: draft.isActive,
            conditions_json: JSON.stringify(sanitizeRoutingConditions(built.conditions)),
            actions_json: JSON.stringify(built.actions),
          },
        },
      });
    } else {
      setCreatePendingPayload({
        mode: "create",
        patches,
        createBody: {
          organisation_id: targetOrgId,
          name: draft.name.trim(),
          is_active: draft.isActive,
          conditions_json: JSON.stringify(sanitizeRoutingConditions(built.conditions)),
          actions_json: JSON.stringify(built.actions),
        },
      });
    }
    setCreateConflictItems(conflictItems);
    setCreateConfirmOpen(true);
    setSaving(false);
  }

  async function handleDeleteConfirmed(rule: RoutingRule, scope: "org" | "all") {
    setDeleteBusy(true);
    try {
      await deleteRoutingRule(rule.id, { scope });
      toast.success("Routing rule deleted.");
      setDeleteConfirmOpen(false);
      setDeleteTargetRule(null);
      setDeleteConfirmGlobalChoice(false);
      await fetchRulesForSelectedOrg();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete routing rule");
    } finally {
      setDeleteBusy(false);
    }
  }

  function handleDeleteRequest(rule: RoutingRule) {
    const actions = safeParseObject(rule.actions_json);
    const gk = actions["global_default_key"];
    const hasGlobalDefaultKey = typeof gk === "string" && gk.length > 0;
    const useGlobalScopeChoice = isSystemAdminUser && getIsGlobalDefaultFromRule(rule) && hasGlobalDefaultKey;
    setDeleteTargetRule(rule);
    setDeleteConfirmGlobalChoice(useGlobalScopeChoice);
    setDeleteConfirmOpen(true);
  }

  function closeDeleteConfirm() {
    setDeleteConfirmOpen(false);
    setDeleteTargetRule(null);
    setDeleteConfirmGlobalChoice(false);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 pb-8 text-[13px]">
      <div className="flex items-start justify-between gap-2.5">
        <div>
          <h1 className="mt-1 text-lg font-bold tracking-tight text-[#475569] dark:text-foreground">Routing Rules</h1>
        </div>
        {!isOrgScopedAdmin ? (
          <div className="min-w-[260px]">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Organization</div>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
            >
              {orgDropdownOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-white"
          style={{ backgroundColor: EZII_BRAND.primary }}
        >
          <Plus className="h-4 w-4" />
          Create New Execution Rule
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <GlassCard className="border-black/10 bg-white/35 p-3.5 dark:border-white/10 dark:bg-white/[0.06]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active Rules</div>
          <div className="mt-1 text-2xl font-bold text-[#111827] dark:text-slate-100">{stats.active}</div>
          <div className="mt-2 text-xs text-emerald-600">~ +3 from last month</div>
        </GlassCard>
        <GlassCard className="border-black/10 bg-white/35 p-3.5 dark:border-white/10 dark:bg-white/[0.06]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Rules</div>
          <div className="mt-1 text-2xl font-bold text-[#1E88E5]">{stats.total}</div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#1E88E5]" style={{ width: "72%" }} />
          </div>
        </GlassCard>
        <GlassCard className="border-black/10 bg-white/35 p-3.5 dark:border-white/10 dark:bg-white/[0.06]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Auto-Resolved</div>
          <div className="mt-1 text-2xl font-bold text-[#111827] dark:text-slate-100">{(stats.total * 58).toLocaleString()}</div>
          <div className="mt-2 text-xs text-slate-500">Monthly volume</div>
        </GlassCard>
        <GlassCard className="border-black/10 bg-white/35 p-3.5 dark:border-white/10 dark:bg-white/[0.06]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Conflict Alerts</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{stats.paused.toString().padStart(2, "0")}</div>
          <div className="mt-2 text-xs text-red-600">Requires attention</div>
        </GlassCard>
      </div>

      <GlassCard className="border-black/10 bg-white/40 p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold text-[#111827] dark:text-slate-100">Routing Rules List</div>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Configure and manage routing rules.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filter
            </button>
            <button
              type="button"
              className="rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
            >
              Bulk Action
            </button>
          </div>
        </div>

        {loading ? <Loader className="mt-8" label="Loading rules..." size="sm" /> : null}
        {error ? <div className="mt-3 text-xs text-red-600">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-3 space-y-1.5">
            {sortedExecution.map((v) => (
              <div
                key={v.rule.id}
                className={`rounded-2xl border p-3.5 ${
                  v.rule.is_active
                    ? "border-black/10 bg-white/65 dark:border-white/15 dark:bg-white/[0.1]"
                    : "border-red-300/60 bg-red-50/40 dark:border-red-400/40 dark:bg-red-500/10"
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="text-sm font-semibold text-[#111827] dark:text-slate-100">{v.rule.name}</div>
                        {getIsGlobalDefaultFromRule(v.rule) ? (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                            GLOBAL DEFAULT
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        Match: Category = '{v.categoryDisplay}' | Sub-categories = '{v.subCategoriesDisplay}' | Start Level ={" "}
                        {v.startLevel}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(v.rule)}
                      className="rounded-lg p-1.5 text-slate-700 transition-colors hover:bg-[#1E88E5]/12 hover:text-[#1E88E5] dark:text-slate-200 dark:hover:bg-[#1E88E5]/20 dark:hover:text-[#8ec5ff]"
                      aria-label={`Edit ${v.rule.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRequest(v.rule)}
                      className="rounded-full border border-red-200/80 p-1.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:border-red-400/35 dark:text-red-300 dark:hover:bg-red-500/20 dark:hover:text-red-200"
                      aria-label={`Delete ${v.rule.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={openCreate}
              className="mt-2.5 flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-black/20 bg-white/40 px-3 py-6 text-xs text-slate-700 hover:bg-white/60 dark:border-white/20 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
            >
              <Plus className="h-5 w-5" />
              <span className="font-semibold">Insert New Execution Rule</span>
            </button>
          </div>
        ) : null}
      </GlassCard>

      {filterOpen && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95 dark:shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
              <div className="text-base font-bold text-[#111827] dark:text-slate-100">Filter Routing Rules</div>
              <button className="rounded-lg p-2 text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10" onClick={() => setFilterOpen(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2.5 p-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Organization</span>
                <select
                  value={filter.orgId}
                  onChange={(e) => setFilter((f) => ({ ...f, orgId: e.target.value }))}
                  disabled={isOrgScopedAdmin}
                  className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100 disabled:opacity-70"
                >
                  {isOrgScopedAdmin ? null : <option value="all">All</option>}
                  {orgs
                    .filter((o) => !isOrgScopedAdmin || String(o.id) === String(selectedOrgId))
                    .map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.name}
                    </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Category</span>
                <select value={filter.category} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))} className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100">
                  <option value="all">All</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Sub-categories</span>
                <select value={filter.subCategory} onChange={(e) => setFilter((f) => ({ ...f, subCategory: e.target.value }))} className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100">
                  <option value="all">All</option>
                  {subCategoryOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-1.5 border-t border-black/10 bg-black/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <button
                type="button"
                onClick={() =>
                  setFilter({
                    orgId: isOrgScopedAdmin ? String(selectedOrgId || defaultSelectedOrgId) : "all",
                    category: "all",
                    subCategory: "all",
                  })
                }
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Reset
              </button>
              <button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(30,136,229,0.35)]" style={{ backgroundColor: EZII_BRAND.primary }}>
                Apply
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {modalOpen && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-3 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95 dark:shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
              <div>
                <div className="text-base font-bold text-[#111827] dark:text-slate-100">{editOpen ? "Edit Execution Rule" : "Create New Execution Rule"}</div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Define logic parameters for systemic execution.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setEditOpen(false);
                }}
                className="rounded-lg p-2 text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2.5 p-4">
              {!isOrgScopedAdmin ? (
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">
                    Select Organization
                  </span>
                  <select
                    value={draft.orgId}
                    onChange={(e) => {
                      setDraft((d) => ({
                        ...d,
                        orgId: e.target.value,
                        productIds: [],
                        categoryIds: [],
                        subCategoryIds: [],
                        startLevel: "L1",
                      }));
                    }}
                    disabled={editOpen || draft.isGlobal}
                    className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-slate-800 disabled:opacity-70 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
                  >
                    <option value="">Select organization</option>
                    {modalOrgOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {isSystemAdminUser ? (
                <label className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={draft.isGlobal}
                    disabled={editOpen}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        isGlobal: e.target.checked,
                        orgId: e.target.checked ? "1" : d.orgId === "1" ? (shellOrgId ? String(shellOrgId) : "") : d.orgId,
                      }))
                    }
                    className="h-4 w-4 accent-[#1E88E5]"
                  />
                  Apply as global default rule (all organizations)
                </label>
              ) : null}

              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Rule Name</span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:placeholder:text-slate-400"
                    placeholder="e.g. Payroll to L2 Specialist"
                  />
                </label>
                <MultiSelectDropdown
                  label="Products"
                  placeholder="Select products"
                  options={products.map((p) => ({ id: String(p.id), label: p.name }))}
                  selectedIds={draft.productIds}
                  onChange={(next) =>
                    setDraft((d) => ({
                      ...d,
                      productIds: next,
                      categoryIds: [],
                      subCategoryIds: [],
                      categoryNamesFallback: [],
                      subCategoryNamesFallback: [],
                    }))
                  }
                />
              </div>

              <div className="mb-1.5 grid grid-cols-1 gap-2.5 rounded-xl border border-black/10 bg-black/[0.03] p-3.5 dark:border-white/10 dark:bg-white/[0.04] md:grid-cols-2">
                <MultiSelectDropdown
                  label="Categories"
                  placeholder="All categories"
                  disabled={draft.productIds.length === 0}
                  options={categoryDropdownOptions}
                  selectedIds={draft.categoryIds}
                  summaryOverride={categoriesSummaryIsAll ? "All" : null}
                  onChange={(next) =>
                    setDraft((d) => ({
                      ...d,
                      categoryIds: next,
                      subCategoryIds: [],
                      categoryNamesFallback: [],
                      subCategoryNamesFallback: [],
                    }))
                  }
                />
                <MultiSelectDropdown
                  label="Sub-categories"
                  placeholder="All sub-categories"
                  disabled={draft.productIds.length === 0}
                  options={subCategoryDropdownOptions}
                  selectedIds={draft.subCategoryIds}
                  summaryOverride={subsDisplayAll ? "All" : null}
                  onChange={(next) => setDraft((d) => ({ ...d, subCategoryIds: next, subCategoryNamesFallback: [] }))}
                />
              </div>

              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Start With Level</div>
                <div className="flex flex-wrap items-center gap-2">
                  {startLevelsOptions.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, startLevel: lvl }))}
                      className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                        draft.startLevel === lvl
                          ? "border-[#1E88E5] bg-[#1E88E5]/10 text-[#1E88E5]"
                          : "border-black/10 bg-white/70 text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 border-t border-black/10 bg-black/[0.02] px-5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setEditOpen(false);
                }}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateRuleClick()}
                disabled={saving}
                className="rounded-full px-6 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: EZII_BRAND.primary }}
              >
                {saving ? "Saving..." : editOpen ? "Save Rule" : "Create Rule"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {deleteConfirmOpen && deleteTargetRule && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm">
              <div className="w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95 dark:shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
                <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
                  <div className="text-base font-bold text-[#111827] dark:text-slate-100">
                    {deleteConfirmGlobalChoice ? "Delete Global Default Rule" : "Delete routing rule"}
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                    onClick={closeDeleteConfirm}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4">
                  {deleteConfirmGlobalChoice ? (
                    <div className="text-xs text-slate-700 dark:text-slate-200">
                      This is a <span className="font-semibold">GLOBAL DEFAULT</span> rule. Choose whether you want to delete it only for the
                      selected organisation (<span className="font-semibold">{selectedOrgId || "-"}</span>) or for all organisations.
                    </div>
                  ) : (
                    <div className="text-xs text-slate-700 dark:text-slate-200">
                      Delete <span className="font-semibold text-[#111827] dark:text-slate-100">&quot;{deleteTargetRule.name}&quot;</span>? This
                      cannot be undone.
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-1.5 border-t border-black/10 bg-black/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <button
                    type="button"
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                    onClick={closeDeleteConfirm}
                    disabled={deleteBusy}
                  >
                    Cancel
                  </button>
                  {deleteConfirmGlobalChoice ? (
                    <>
                      <button
                        type="button"
                        className="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(30,136,229,0.25)] disabled:opacity-60"
                        style={{ backgroundColor: EZII_BRAND.primary }}
                        onClick={() => void handleDeleteConfirmed(deleteTargetRule, "all")}
                        disabled={deleteBusy}
                      >
                        All org delete
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: "#EF4444" }}
                        onClick={() => void handleDeleteConfirmed(deleteTargetRule, "org")}
                        disabled={deleteBusy}
                      >
                        Selected Org Delete
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: "#EF4444" }}
                      onClick={() => void handleDeleteConfirmed(deleteTargetRule, "org")}
                      disabled={deleteBusy}
                    >
                      {deleteBusy ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {createConfirmOpen && createPendingPayload && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
              <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95 dark:shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
                <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                  <div>
                    <div className="text-lg font-bold text-[#111827] dark:text-slate-100">
                      {createPendingPayload.mode === "edit" ? "Confirm rule update" : "Confirm rule creation"}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {createPendingPayload.mode === "edit"
                        ? "This updated rule overlaps other rules. Only the overlapping sub-categories are removed from each other rule; a category or product block is dropped only when nothing remains there. A rule is deleted only if no scope is left."
                        : "This new rule overlaps existing rules. Only the overlapping sub-categories are removed from each other rule; a category or product block is dropped only when nothing remains there. A rule is deleted only if no scope is left."}
                    </p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      You will see this whenever the same product/category/sub-category tickets would match another rule—even if that other rule is wider (for example &quot;all categories&quot; or &quot;all sub-categories&quot; for the same product). Empty category or sub-category selection in the form means &quot;all&quot;, not none.
                    </p>
                    {createConflictItems.length > 1 ? (
                      <p className="mt-2 text-xs font-medium text-amber-800/95 dark:text-amber-200/90">
                        {createConflictItems.length} rules overlap with this save — each is updated separately: only overlapping sub-categories (then categories / products if nothing remains). A rule is removed only if its entire scope is consumed by this save.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                    onClick={() => {
                      setCreateConfirmOpen(false);
                      setCreatePendingPayload(null);
                      setCreateConflictItems([]);
                    }}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[min(52vh,420px)] space-y-3 overflow-y-auto px-5 py-4">
                  {createConflictItems.map(({ rule, overlapLines }) => (
                    <div
                      key={rule.id}
                      className="rounded-xl border border-black/10 bg-black/[0.03] p-3 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <div className="font-semibold text-[#111827] dark:text-slate-100">{rule.name}</div>
                      <div className="mt-1 text-slate-600 dark:text-slate-300">
                        <span className="font-medium text-slate-700 dark:text-slate-200">Overlapping scope</span>
                        <ul className="mt-1 list-inside list-disc space-y-0.5">
                          {overlapLines.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <button
                    type="button"
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                    onClick={() => {
                      setCreateConfirmOpen(false);
                      setCreatePendingPayload(null);
                      setCreateConflictItems([]);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-full px-6 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: EZII_BRAND.primary }}
                    onClick={() => void confirmCreateWithConflictResolution()}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : createPendingPayload.mode === "edit" ? "Confirm and save" : "Confirm and create"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

