import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import {
  createProductCategory,
  createProductSubcategory,
  deleteProductCategory,
  deleteProductSubcategory,
  getExternalOrganizations,
  listProductCategoriesTree,
  listProducts,
  listSubcategoryPriorityMaster,
  upsertSubcategoryPriorityMaster,
  type ProductCategoryTree,
} from "@api/adminApi";
import { EZII_BRAND } from "@/lib/eziiBrand";
import { useAuthStore } from "@store/useAuthStore";
import { Plus, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";

function isEziiSystemAdminUser(user: {
  org_id?: string;
  user_id?: string;
  role_id?: string;
  user_type_id?: string;
  role_name?: string;
} | null): boolean {
  if (!user) return false;
  return (
    user.role_name === "admin" &&
    user.org_id === "1" &&
    user.user_id === "1" &&
    user.role_id === "1" &&
    user.user_type_id === "1"
  );
}

const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
type PriorityValue = (typeof PRIORITIES)[number];

type PriorityRow = {
  key: string;
  productId: number;
  productName: string;
  categoryId: number;
  categoryName: string;
  subCategoryId: number;
  subCategoryName: string;
  isCustomCategory: boolean;
};

function parsePriorityValue(raw: string | undefined): PriorityValue {
  const p = String(raw ?? "P3").toUpperCase();
  return PRIORITIES.includes(p as PriorityValue) ? (p as PriorityValue) : "P3";
}

function parseMultiNames(raw: string): string[] {
  return raw
    .split(/[\n,]+/g)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function PriorityMasterPage({
  orgId,
  organizationName,
}: {
  orgId: string;
  /** Display label when the org picker is read-only (non–system-admin users). */
  organizationName?: string | null;
}) {
  const authUser = useAuthStore((s) => s.user);
  const canSwitchOrganization = useMemo(() => isEziiSystemAdminUser(authUser), [authUser]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState(orgId);
  const [orgOptions, setOrgOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<PriorityRow[]>([]);
  const [selectedProductFilters, setSelectedProductFilters] = useState<string[]>([]);
  const [selectedPriorityFilters, setSelectedPriorityFilters] = useState<PriorityValue[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageProductId, setManageProductId] = useState<string>("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSubCategoryNamesText, setNewSubCategoryNamesText] = useState("");
  const [existingCategoryForSubAdd, setExistingCategoryForSubAdd] = useState<string>("");
  const [manageBusy, setManageBusy] = useState(false);
  const [treeByProduct, setTreeByProduct] = useState<Record<number, ProductCategoryTree[]>>({});
  const [priorityByRowKey, setPriorityByRowKey] = useState<Record<string, PriorityValue>>({});
  const [savedPriorityByRowKey, setSavedPriorityByRowKey] = useState<Record<string, PriorityValue>>({});

  useEffect(() => {
    setSelectedOrgId(orgId);
  }, [orgId]);

  useEffect(() => {
    if (!canSwitchOrganization && selectedOrgId !== orgId) {
      setSelectedOrgId(orgId);
    }
  }, [canSwitchOrganization, orgId, selectedOrgId]);

  useEffect(() => {
    setSelectedProductFilters([]);
    setSelectedPriorityFilters([]);
  }, [selectedOrgId]);

  const load = useCallback(async () => {
    const orgNum = Number(selectedOrgId);
    if (!Number.isFinite(orgNum) || orgNum <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const [extOrgs, productList, pmRows] = await Promise.all([
        canSwitchOrganization ? getExternalOrganizations().catch(() => []) : Promise.resolve([]),
        listProducts(),
        listSubcategoryPriorityMaster(orgNum),
      ]);

      let nextOrgOptions: Array<{ id: string; name: string }>;
      if (canSwitchOrganization) {
        nextOrgOptions = extOrgs.map((o) => {
          const id = String(o.id);
          return {
            id,
            name: id === "1" ? "Resolve Biz Services Pvt Ltd" : o.organization_name || `Organization ${o.id}`,
          };
        });
        if (!nextOrgOptions.some((o) => o.id === "1")) {
          nextOrgOptions.unshift({ id: "1", name: "Resolve Biz Services Pvt Ltd" });
        }
        if (nextOrgOptions.length === 0) {
          nextOrgOptions.push({ id: String(orgNum), name: `Organization ${orgNum}` });
        }
        if (!nextOrgOptions.some((o) => o.id === String(orgNum))) {
          nextOrgOptions.push({
            id: String(orgNum),
            name: String(orgNum) === "1" ? "Resolve Biz Services Pvt Ltd" : `Organization ${orgNum}`,
          });
        }
      } else {
        const label =
          organizationName?.trim() ||
          (String(orgNum) === "1" ? "Resolve Biz Services Pvt Ltd" : `Organization ${orgNum}`);
        nextOrgOptions = [{ id: String(orgNum), name: label }];
      }
      setOrgOptions(nextOrgOptions);

      const treeEntries = await Promise.all(
        productList.map(async (p) => {
          const tree = await listProductCategoriesTree(orgNum, p.id).catch(() => []);
          return [p.id, tree as ProductCategoryTree[]] as const;
        })
      );
      const treeByProduct = new Map<number, ProductCategoryTree[]>(treeEntries);
      setTreeByProduct(Object.fromEntries(treeEntries));

      const nextRows: PriorityRow[] = [];
      for (const p of productList) {
        const categories = treeByProduct.get(p.id) ?? [];
        for (const c of categories) {
          if (!c.is_active) continue;
          for (const s of c.subcategories ?? []) {
            if (!s.is_active) continue;
            nextRows.push({
              key: `${p.id}:${c.id}:${s.id}`,
              productId: p.id,
              productName: p.name,
              categoryId: c.id,
              categoryName: c.name,
              subCategoryId: s.id,
              subCategoryName: s.name,
              isCustomCategory: !c.is_system_default,
            });
          }
        }
      }

      const priorityByKey: Record<string, PriorityValue> = {};
      for (const pr of pmRows) {
        const k = `${pr.product_id}:${pr.category_id}:${pr.sub_category_id}`;
        priorityByKey[k] = parsePriorityValue(pr.priority);
      }

      const nextPriorityMap: Record<string, PriorityValue> = {};
      for (const row of nextRows) {
        nextPriorityMap[row.key] = priorityByKey[row.key] ?? "P3";
      }

      setRows(nextRows);
      setPriorityByRowKey(nextPriorityMap);
      setSavedPriorityByRowKey(nextPriorityMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load priority master data");
      setRows([]);
      setPriorityByRowKey({});
      setSavedPriorityByRowKey({});
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, canSwitchOrganization, organizationName]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyCount = useMemo(() => {
    let count = 0;
    for (const row of rows) {
      if (priorityByRowKey[row.key] !== savedPriorityByRowKey[row.key]) count += 1;
    }
    return count;
  }, [rows, priorityByRowKey, savedPriorityByRowKey]);

  const productFilterDefs = useMemo(
    () => [
      { key: "payroll", label: "Payroll", match: (name: string) => name.toLowerCase().includes("payroll") },
      { key: "attendance", label: "Attendance", match: (name: string) => name.toLowerCase().includes("attendance") },
      { key: "leave", label: "Leave", match: (name: string) => name.toLowerCase().includes("leave") },
      { key: "expense", label: "Expense", match: (name: string) => name.toLowerCase().includes("expense") },
    ],
    []
  );

  const productFilteredRows = useMemo(() => {
    let next = rows;
    if (selectedProductFilters.length > 0) {
      const activeFilters = productFilterDefs.filter((f) => selectedProductFilters.includes(f.key));
      if (activeFilters.length > 0) {
        next = next.filter((r) => activeFilters.some((f) => f.match(r.productName)));
      }
    }
    return next;
  }, [rows, selectedProductFilters, productFilterDefs]);

  const filteredRows = useMemo(() => {
    let next = productFilteredRows;
    if (selectedPriorityFilters.length > 0) {
      next = next.filter((r) => selectedPriorityFilters.includes(priorityByRowKey[r.key] ?? "P3"));
    }
    return next;
  }, [productFilteredRows, selectedPriorityFilters, priorityByRowKey]);

  const productOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const row of rows) {
      if (!byId.has(row.productId)) byId.set(row.productId, row.productName);
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const selectedManageProductNum = Number(manageProductId);
  const manageCategories = useMemo(() => {
    if (!Number.isFinite(selectedManageProductNum)) return [];
    const list = treeByProduct[selectedManageProductNum] ?? [];
    const custom = list.filter((c) => !c.is_system_default);
    const systemDefault = list.filter((c) => c.is_system_default);
    const sortByName = (a: ProductCategoryTree, b: ProductCategoryTree) => a.name.localeCompare(b.name);
    return [...custom.sort(sortByName), ...systemDefault.sort(sortByName)];
  }, [selectedManageProductNum, treeByProduct]);

  useEffect(() => {
    if (manageCategories.length === 0) {
      setExistingCategoryForSubAdd("");
      return;
    }
    if (!existingCategoryForSubAdd) {
      setExistingCategoryForSubAdd(String(manageCategories[0]!.id));
      return;
    }
    if (!manageCategories.some((c) => String(c.id) === existingCategoryForSubAdd)) {
      setExistingCategoryForSubAdd(String(manageCategories[0]!.id));
    }
  }, [manageCategories, existingCategoryForSubAdd]);

  function toggleProductFilter(filterKey: string) {
    setSelectedProductFilters((prev) =>
      prev.includes(filterKey) ? prev.filter((x) => x !== filterKey) : [...prev, filterKey]
    );
  }

  function togglePriorityFilter(filterValue: PriorityValue) {
    setSelectedPriorityFilters((prev) =>
      prev.includes(filterValue) ? prev.filter((x) => x !== filterValue) : [...prev, filterValue]
    );
  }

  function setPriorityForRow(rowKey: string, value: PriorityValue) {
    setPriorityByRowKey((prev) => ({ ...prev, [rowKey]: value }));
  }

  function applyForAllSubCategories(row: PriorityRow) {
    const chosen = priorityByRowKey[row.key] ?? "P3";
    setPriorityByRowKey((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (r.productId === row.productId && r.categoryId === row.categoryId) {
          next[r.key] = chosen;
        }
      }
      return next;
    });
    toast.success(`Applied ${chosen} for all sub-categories in "${row.categoryName}".`);
  }

  function applyForProduct(row: PriorityRow) {
    const chosen = priorityByRowKey[row.key] ?? "P3";
    setPriorityByRowKey((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (r.productId === row.productId) {
          next[r.key] = chosen;
        }
      }
      return next;
    });
    toast.success(`Applied ${chosen} for all sub-categories in "${row.productName}".`);
  }

  async function saveChanges() {
    const orgNum = Number(selectedOrgId);
    if (!Number.isFinite(orgNum) || orgNum <= 0) return;
    const changedRows = rows.filter((r) => priorityByRowKey[r.key] !== savedPriorityByRowKey[r.key]);
    if (changedRows.length === 0) {
      toast.message("No changes to save.");
      return;
    }

    setSaving(true);
    try {
      const items = changedRows.map((row) => ({
        product_id: row.productId,
        category_id: row.categoryId,
        sub_category_id: row.subCategoryId,
        priority: priorityByRowKey[row.key] ?? "P3",
      }));
      await upsertSubcategoryPriorityMaster(orgNum, items);
      toast.success(`Saved ${changedRows.length} priority change(s).`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save priorities");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCustomCategoryAndSubCategory() {
    const orgNum = Number(selectedOrgId);
    const productId = Number(manageProductId);
    if (!Number.isFinite(orgNum) || orgNum <= 0) return;
    if (!Number.isFinite(productId) || productId <= 0) return toast.error("Select product");
    if (!newCategoryName.trim()) return toast.error("Category name is required");
    const subNames = parseMultiNames(newSubCategoryNamesText);
    if (subNames.length === 0) return toast.error("At least one sub-category name is required");

    setManageBusy(true);
    try {
      const createdCategory = await createProductCategory(orgNum, productId, { name: newCategoryName.trim() });
      for (const subName of subNames) {
        await createProductSubcategory(createdCategory.id, orgNum, { name: subName });
      }
      toast.success(`Custom category added with ${subNames.length} sub-categor${subNames.length > 1 ? "ies" : "y"}.`);
      setNewCategoryName("");
      setNewSubCategoryNamesText("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add custom category/sub-category");
    } finally {
      setManageBusy(false);
    }
  }

  async function handleAddSubCategoriesToExistingCategory() {
    const orgNum = Number(selectedOrgId);
    const categoryId = Number(existingCategoryForSubAdd);
    if (!Number.isFinite(orgNum) || orgNum <= 0) return;
    if (!Number.isFinite(categoryId) || categoryId <= 0) return toast.error("Select category");
    const subNames = parseMultiNames(newSubCategoryNamesText);
    if (subNames.length === 0) return toast.error("At least one sub-category name is required");

    setManageBusy(true);
    try {
      for (const subName of subNames) {
        await createProductSubcategory(categoryId, orgNum, { name: subName });
      }
      toast.success(`${subNames.length} sub-categor${subNames.length > 1 ? "ies" : "y"} added.`);
      setNewSubCategoryNamesText("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add sub-category");
    } finally {
      setManageBusy(false);
    }
  }

  async function handleDeleteSubCategory(subCategoryId: number) {
    const orgNum = Number(selectedOrgId);
    if (!Number.isFinite(orgNum) || orgNum <= 0) return;
    setManageBusy(true);
    try {
      await deleteProductSubcategory(subCategoryId, orgNum);
      toast.success("Sub-category removed.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove sub-category");
    } finally {
      setManageBusy(false);
    }
  }

  async function handleDeleteCategory(categoryId: number) {
    const orgNum = Number(selectedOrgId);
    if (!Number.isFinite(orgNum) || orgNum <= 0) return;
    setManageBusy(true);
    try {
      await deleteProductCategory(categoryId, orgNum);
      toast.success("Category removed.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove category");
    } finally {
      setManageBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">System Configuration</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-[#475569] dark:text-foreground">Priority Master</h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Set ticket priority by sub-category, with category and product-level quick actions.
          </p>
        </div>
        <div className="flex min-w-[260px] items-end gap-2">
          {canSwitchOrganization ? (
            <label className="min-w-[220px] flex-1">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Organization</div>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
              >
                {orgOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="min-w-[220px] flex-1">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Organization</div>
              <div className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-800 dark:border-white/15 dark:text-slate-100">
                {orgOptions[0]?.name ?? `Organization ${orgId}`}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setManageOpen(true);
              if (!manageProductId && productOptions.length > 0) {
                setManageProductId(String(productOptions[0]!.id));
              }
            }}
            className="rounded-lg border border-black/10 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-100"
          >
            Manage Categories
          </button>
          <button
            type="button"
            disabled={saving || dirtyCount === 0}
            onClick={() => void saveChanges()}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: EZII_BRAND.primary }}
          >
            {saving ? "Saving..." : `Save Changes${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </button>
        </div>
      </div>

      <GlassCard className="overflow-hidden border-black/10 bg-white/45 p-0 dark:border-white/10 dark:bg-white/[0.05]">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
          <div className="mr-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">Filters:</div>
          <button
            type="button"
            onClick={() => setSelectedProductFilters([])}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              selectedProductFilters.length === 0
                ? "bg-[#1E88E5] text-white"
                : "border border-black/10 bg-white/80 text-slate-700 dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-200"
            }`}
          >
            All products
          </button>
          {productFilterDefs.map((f) => {
            const active = selectedProductFilters.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleProductFilter(f.key)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  active
                    ? "bg-[#1E88E5] text-white"
                    : "border border-black/10 bg-white/80 text-slate-700 dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-200"
                }`}
              >
                {f.label}
              </button>
            );
          })}
          <div className="ml-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">Priority:</div>
          {PRIORITIES.map((p) => {
            const active = selectedPriorityFilters.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePriorityFilter(p)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  active
                    ? "bg-[#1E88E5] text-white"
                    : "border border-black/10 bg-white/80 text-slate-700 dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-200"
                }`}
              >
                {p}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setSelectedProductFilters([]);
              setSelectedPriorityFilters([]);
            }}
            className="ml-auto rounded-md border border-black/10 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-200"
          >
            clear
          </button>
        </div>
        {loading ? (
          <Loader className="min-h-[45vh]" label="Loading priority matrix..." size="sm" />
        ) : error ? (
          <div className="p-6 text-sm text-red-600 dark:text-red-300">{error}</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-6 text-sm text-slate-600 dark:text-slate-300">No product/category/sub-category rows found for this organization.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-black/[0.03] dark:bg-white/[0.04]">
                <tr className="text-slate-600 dark:text-slate-300">
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Sub-category</th>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  <th className="px-4 py-3 font-semibold">Quick Apply</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const current = priorityByRowKey[row.key] ?? "P3";
                  const isDirty = current !== (savedPriorityByRowKey[row.key] ?? "P3");
                  return (
                    <tr
                      key={row.key}
                      className={`border-t border-black/10 dark:border-white/10 ${
                        isDirty ? "bg-[#1E88E5]/[0.06] dark:bg-[#1E88E5]/[0.14]" : "bg-transparent"
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{row.productName}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        <div className="inline-flex items-center gap-2">
                          <span>{row.categoryName}</span>
                          {row.isCustomCategory ? (
                            <span className="rounded-full bg-[#1E88E5]/10 px-2 py-0.5 text-[10px] font-bold text-[#1E88E5]">
                              Custom
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.subCategoryName}</td>
                      <td className="px-4 py-3">
                        <select
                          value={current}
                          onChange={(e) => setPriorityForRow(row.key, e.target.value as PriorityValue)}
                          className="rounded-lg border border-black/10 bg-white/90 px-2.5 py-1.5 font-semibold text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => applyForAllSubCategories(row)}
                            className="rounded-md border border-black/10 bg-white/75 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-200"
                          >
                            Set for all sub-categories
                          </button>
                          <button
                            type="button"
                            onClick={() => applyForProduct(row)}
                            className="rounded-md border border-black/10 bg-white/75 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-200"
                          >
                            Set for product
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.isCustomCategory ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteCategory(row.categoryId)}
                            disabled={manageBusy}
                            className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-500/10"
                            aria-label={`Delete custom category ${row.categoryName}`}
                            title="Delete custom category"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {manageOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
              <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
                <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                  <div>
                    <div className="text-lg font-bold text-[#111827] dark:text-slate-100">Manage Custom Categories</div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Add custom category + sub-category for a product. Custom items are removable; default items are not.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManageOpen(false)}
                    className="rounded-lg p-2 text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 border-b border-black/10 p-5 dark:border-white/10 md:grid-cols-6">
                  <label className="md:col-span-2">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Product</div>
                    <select
                      value={manageProductId}
                      onChange={(e) => setManageProductId(e.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
                    >
                      <option value="">Select product</option>
                      {productOptions.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="md:col-span-2">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">New custom category</div>
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Custom category"
                      className="w-full rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
                    />
                  </label>
                  <label className="md:col-span-2">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">
                      Sub-categories (multiple)
                    </div>
                    <textarea
                      value={newSubCategoryNamesText}
                      onChange={(e) => setNewSubCategoryNamesText(e.target.value)}
                      placeholder="e.g. Late Salary, Incorrect Payslip"
                      className="w-full rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
                    />
                  </label>
                  <label className="md:col-span-3">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">
                      Existing category (default/custom)
                    </div>
                    <select
                      value={existingCategoryForSubAdd}
                      onChange={(e) => setExistingCategoryForSubAdd(e.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
                    >
                      <option value="">Select category</option>
                      {manageCategories.map((cat) => (
                        <option key={cat.id} value={String(cat.id)}>
                          {cat.name} {cat.is_system_default ? "(Default)" : "(Custom)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="md:col-span-3 flex justify-end gap-2 self-end">
                    <button
                      type="button"
                      onClick={() => void handleAddSubCategoriesToExistingCategory()}
                      disabled={manageBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-100"
                    >
                      <Plus className="h-4 w-4" />
                      Add to selected category
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAddCustomCategoryAndSubCategory()}
                      disabled={manageBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: EZII_BRAND.primary }}
                    >
                      <Plus className="h-4 w-4" />
                      Add new custom category
                    </button>
                  </div>
                </div>

                <div className="max-h-[50vh] overflow-y-auto p-5">
                  {manageProductId === "" ? (
                    <div className="text-xs text-slate-500 dark:text-slate-300">Select a product to view categories.</div>
                  ) : manageCategories.length === 0 ? (
                    <div className="text-xs text-slate-500 dark:text-slate-300">No categories found for selected product.</div>
                  ) : (
                    <div className="space-y-3">
                      {manageCategories.map((cat) => {
                        const subCustom = (cat.subcategories ?? []).filter((s) => !s.is_system_default);
                        const subDefault = (cat.subcategories ?? []).filter((s) => s.is_system_default);
                        const subs = [...subCustom, ...subDefault].sort((a, b) => a.name.localeCompare(b.name));
                        const isCustomCategory = !cat.is_system_default;
                        return (
                          <div
                            key={cat.id}
                            className="rounded-xl border border-black/10 bg-white/65 p-3 dark:border-white/10 dark:bg-white/[0.05]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {cat.name}{" "}
                                {cat.is_system_default ? (
                                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300">(Default)</span>
                                ) : (
                                  <span className="text-[10px] font-bold text-[#1E88E5]">(Custom)</span>
                                )}
                              </div>
                              {isCustomCategory ? (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteCategory(cat.id)}
                                  disabled={manageBusy}
                                  className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                                  aria-label={`Delete category ${cat.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                            <div className="mt-2 space-y-1.5">
                              {subs.map((sub) => (
                                <div
                                  key={sub.id}
                                  className="flex items-center justify-between rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                                >
                                  <div className="text-slate-700 dark:text-slate-200">
                                    {sub.name}{" "}
                                    {sub.is_system_default ? (
                                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300">(Default)</span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-[#1E88E5]">(Custom)</span>
                                    )}
                                  </div>
                                  {!sub.is_system_default ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteSubCategory(sub.id)}
                                      disabled={manageBusy}
                                      className="rounded-md p-1 text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                                      aria-label={`Delete sub-category ${sub.name}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
