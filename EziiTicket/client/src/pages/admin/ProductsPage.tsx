import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { toast } from "sonner";
import {
  getOrganisationProducts,
  listProductCategoriesTree,
  listQueues,
  listProducts,
  setOrganisationProduct,
  createProductCategory,
  createProductSubcategory,
  deleteProductCategory,
  deleteProductSubcategory,
  updateProductCategory,
  updateProductSubcategory,
  type Product,
  type ProductCategoryTree,
  type Queue,
} from "@api/adminApi";

function safeId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function ProductsPage({ orgId }: { orgId: string }) {
  const orgIdNum = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [categoryTreeByProduct, setCategoryTreeByProduct] = useState<Record<number, ProductCategoryTree[]>>({});
  const [loadingCats, setLoadingCats] = useState<Record<number, boolean>>({});

  const [draft, setDraft] = useState<
    Record<number, { enabled: boolean; default_routing_queue_id: number | null }>
  >({});

  const [newCategoryName, setNewCategoryName] = useState<Record<number, string>>({});
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});

  const loadBase = useCallback(async () => {
    if (!orgIdNum) return;
    setLoading(true);
    setError(null);
    try {
      const [p, op, q] = await Promise.all([
        listProducts(),
        getOrganisationProducts(orgIdNum),
        listQueues(orgIdNum),
      ]);
      setProducts(p);
      setQueues(q);
      const nextDraft: typeof draft = {};
      for (const prod of p) {
        const row = op.find((x) => x.product_id === prod.id);
        nextDraft[prod.id] = {
          enabled: row?.enabled ?? false,
          default_routing_queue_id: safeId(row?.default_routing_queue_id),
        };
      }
      setDraft(nextDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [orgIdNum]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  async function loadCategoriesForProduct(productId: number) {
    if (!orgIdNum) return;
    setLoadingCats((prev) => ({ ...prev, [productId]: true }));
    try {
      const tree = await listProductCategoriesTree(orgIdNum, productId);
      setCategoryTreeByProduct((prev) => ({ ...prev, [productId]: tree }));
    } catch {
      toast.error("Failed to load categories");
    } finally {
      setLoadingCats((prev) => ({ ...prev, [productId]: false }));
    }
  }

  useEffect(() => {
    if (expandedProductId != null) {
      void loadCategoriesForProduct(expandedProductId);
    }
  }, [expandedProductId, orgIdNum]);

  async function persistProductEnable(prod: Product, enabled: boolean, queueId: number | null) {
    if (!orgIdNum) return;
    try {
      await setOrganisationProduct(orgIdNum, prod.id, {
        enabled,
        default_routing_queue_id: queueId,
      });
      setDraft((d) => ({
        ...d,
        [prod.id]: { enabled, default_routing_queue_id: queueId },
      }));
      toast.success(enabled ? `Product ${prod.name} enabled` : `Product ${prod.name} disabled`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update product");
    }
  }

  const queuesForProduct = (productId: number) =>
    queues.filter((q) => q.product_id === productId || q.product_id == null);

  if (loading) {
    return (
      <div className="max-w-6xl">
        <GlassCard className="p-6">
          <Loader className="min-h-[50vh]" label="Loading products..." size="sm" />
        </GlassCard>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl text-sm text-red-300">{error}</div>
    );
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <div className="text-xl font-semibold tracking-tight">Products</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Enable products for this organisation and manage ticket categories and sub-categories per product.
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {products.map((prod) => {
          const d = draft[prod.id] ?? { enabled: false, default_routing_queue_id: null };
          const canManage = d.enabled;
          const expanded = expandedProductId === prod.id;
          const cats = categoryTreeByProduct[prod.id] ?? [];
          const catLoading = loadingCats[prod.id];

          return (
            <GlassCard key={prod.id} className="p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-lg font-semibold">{prod.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Code: <span className="font-mono">{prod.code}</span> · Prefix: {prod.default_ticket_prefix}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setDraft((prev) => ({
                          ...prev,
                          [prod.id]: { ...d, enabled: next },
                        }));
                        void persistProductEnable(prod, next, d.default_routing_queue_id);
                      }}
                    />
                    Enabled
                  </label>
                  <select
                    value={d.default_routing_queue_id ?? ""}
                    onChange={(e) => {
                      const qid = e.target.value ? Number(e.target.value) : null;
                      setDraft((prev) => ({
                        ...prev,
                        [prod.id]: { ...d, default_routing_queue_id: qid },
                      }));
                      if (d.enabled) {
                        void setOrganisationProduct(orgIdNum!, prod.id, {
                          enabled: true,
                          default_routing_queue_id: qid,
                        }).then(() => {
                          toast.success("Default routing queue updated");
                        }).catch((err) =>
                          toast.error(err instanceof Error ? err.message : "Update failed")
                        );
                      }
                    }}
                    className="min-w-[200px] rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm dark:border-white/10"
                  >
                    <option value="">Default queue (none)</option>
                    {queuesForProduct(prod.id).map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setExpandedProductId(expanded ? null : prod.id)}
                    className="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10"
                  >
                    {expanded ? "Hide categories" : "Manage categories"}
                  </button>
                </div>
              </div>

              {expanded ? (
                <div className="mt-5 border-t border-black/10 pt-5 dark:border-white/10">
                  {!canManage ? (
                    <div className="mb-3 text-sm text-muted-foreground">
                      This product is currently disabled. Default categories/sub-categories are shown below.
                      Enable the product to add, rename, toggle, or remove custom items.
                    </div>
                  ) : null}
                  {catLoading ? (
                    <Loader label="Loading categories..." size="sm" />
                  ) : (
                    <>
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <label className="flex flex-1 flex-col gap-1">
                          <span className="text-xs text-muted-foreground">New category name</span>
                          <input
                            value={newCategoryName[prod.id] ?? ""}
                            onChange={(e) =>
                              setNewCategoryName((prev) => ({ ...prev, [prod.id]: e.target.value }))
                            }
                            placeholder="e.g. Salary Discrepancy"
                            disabled={!canManage}
                            className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm dark:border-white/10"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={async () => {
                            const name = (newCategoryName[prod.id] ?? "").trim();
                            if (!name) return toast.error("Enter category name");
                            if (!orgIdNum) return;
                            await createProductCategory(orgIdNum, prod.id, { name });
                            setNewCategoryName((prev) => ({ ...prev, [prod.id]: "" }));
                            await loadCategoriesForProduct(prod.id);
                            toast.success("Category added");
                          }}
                          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                        >
                          Add category
                        </button>
                      </div>

                      {cats.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No categories yet. Add one above.</div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {cats.map((c) => (
                            <div
                              key={c.id}
                              className="rounded-xl border border-black/10 bg-white/5 p-4 dark:border-white/10"
                            >
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="min-w-0 flex flex-1 flex-col gap-1 sm:flex-row sm:items-center">
                                  <input
                                    defaultValue={c.name}
                                    key={c.id + c.name}
                                    disabled={!canManage || !c.is_active}
                                    onBlur={(e) => {
                                      const next = e.target.value.trim();
                                      if (!next || next === c.name) return;
                                      void updateProductCategory(c.id, orgIdNum!, { name: next }).then(() =>
                                        loadCategoriesForProduct(prod.id)
                                      );
                                    }}
                                    className="w-full max-w-md rounded-lg border border-black/10 bg-white/5 px-2 py-1 text-sm font-medium dark:border-white/10 disabled:opacity-50"
                                  />
                                  <span className="text-xs text-muted-foreground">sort {c.sort_order}</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={!canManage}
                                    onClick={() =>
                                      void updateProductCategory(c.id, orgIdNum!, { is_active: !c.is_active }).then(
                                        () => loadCategoriesForProduct(prod.id)
                                      )
                                    }
                                    className="rounded-lg border border-black/10 px-2 py-1 text-xs dark:border-white/10"
                                  >
                                    {c.is_active ? "Disable" : "Enable"}
                                  </button>
                                  {c.is_system_default ? (
                                    <span className="inline-flex items-center rounded-lg border border-amber-400/40 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
                                      Default (disable only)
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!canManage}
                                      onClick={async () => {
                                        if (!orgIdNum) return;
                                        if (!window.confirm(`Remove category "${c.name}" and all its sub-categories?`)) return;
                                        await deleteProductCategory(c.id, orgIdNum);
                                        await loadCategoriesForProduct(prod.id);
                                        toast.success("Category removed");
                                      }}
                                      className="rounded-lg border border-red-300/60 px-2 py-1 text-xs text-red-500"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 pl-3">
                                <div className="text-xs font-medium text-muted-foreground">Sub-categories</div>
                                <div className="mt-1 space-y-2 text-sm">
                                  {(c.subcategories ?? []).map((s) => (
                                    <div
                                      key={s.id}
                                      className={`flex flex-wrap items-center gap-2 ${!s.is_active ? "opacity-60" : ""}`}
                                    >
                                      <input
                                        defaultValue={s.name}
                                        key={`sub-${s.id}-${s.name}`}
                                        disabled={!canManage || !s.is_active}
                                        onBlur={(e) => {
                                          const next = e.target.value.trim();
                                          if (!next || next === s.name) return;
                                          void updateProductSubcategory(s.id, orgIdNum!, { name: next }).then(() =>
                                            loadCategoriesForProduct(prod.id)
                                          );
                                        }}
                                        className="min-w-[160px] max-w-md flex-1 rounded-lg border border-black/10 bg-white/5 px-2 py-1 text-sm dark:border-white/10 disabled:opacity-50"
                                      />
                                      <button
                                        type="button"
                                        className="text-xs text-primary"
                                        disabled={!canManage}
                                        onClick={() =>
                                          void updateProductSubcategory(s.id, orgIdNum!, {
                                            is_active: !s.is_active,
                                          }).then(() => loadCategoriesForProduct(prod.id))
                                        }
                                      >
                                        {s.is_active ? "Disable" : "Enable"}
                                      </button>
                                      {s.is_system_default ? (
                                        <span className="text-[11px] text-amber-700 dark:text-amber-400">Default</span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="text-xs text-red-500"
                                          disabled={!canManage}
                                          onClick={async () => {
                                            if (!orgIdNum) return;
                                            if (!window.confirm(`Remove sub-category "${s.name}"?`)) return;
                                            await deleteProductSubcategory(s.id, orgIdNum);
                                            await loadCategoriesForProduct(prod.id);
                                            toast.success("Sub-category removed");
                                          }}
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <input
                                    value={newSubName[`${prod.id}-${c.id}`] ?? ""}
                                    disabled={!canManage}
                                    onChange={(e) =>
                                      setNewSubName((prev) => ({
                                        ...prev,
                                        [`${prod.id}-${c.id}`]: e.target.value,
                                      }))
                                    }
                                    placeholder="New sub-category"
                                    className="max-w-xs flex-1 rounded-lg border border-black/10 bg-white/5 px-2 py-1 text-sm dark:border-white/10"
                                  />
                                  <button
                                    type="button"
                                    disabled={!canManage}
                                    onClick={async () => {
                                      const key = `${prod.id}-${c.id}`;
                                      const name = (newSubName[key] ?? "").trim();
                                      if (!name) return toast.error("Enter sub-category name");
                                      if (!orgIdNum) return;
                                      await createProductSubcategory(c.id, orgIdNum, { name });
                                      setNewSubName((prev) => ({ ...prev, [key]: "" }));
                                      await loadCategoriesForProduct(prod.id);
                                      toast.success("Sub-category added");
                                    }}
                                    className="rounded-lg bg-primary/90 px-3 py-1 text-xs text-primary-foreground"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
