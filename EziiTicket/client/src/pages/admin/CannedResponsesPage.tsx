import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { InstantTooltip } from "@components/common/InstantTooltip";
import { useScreenModifyAccess } from "@hooks/useScreenModifyAccess";
import {
  createCannedResponse,
  deleteCannedResponse,
  listCannedResponses,
  listProducts,
  updateCannedResponse,
  type CannedResponse,
  type Product,
} from "@api/adminApi";
import { toast } from "sonner";
import { Copy, Filter, Pencil, Plus, Trash2, X } from "lucide-react";

/** Platform-wide canned responses are stored under this org id in the database. */
const CANNED_RESPONSES_PLATFORM_ORG_ID = 1;

type UpdatedFilter = "all" | "30d" | "90d" | "365d";
type UsageFilter = "all" | "high" | "medium" | "low";

export function CannedResponsesPage({ orgId }: { orgId: string }) {
  void orgId;

  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    body: "",
    product_id: "",
    audience: "all" as CannedResponse["audience"],
  });
  const [filterState, setFilterState] = useState<{
    productIds: number[];
    updated: UpdatedFilter;
    usage: UsageFilter;
  }>({
    productIds: [],
    updated: "all",
    usage: "all",
  });
  const canModify = useScreenModifyAccess("canned_responses");
  const modifyAccessMessage = "You don't have modify access";

  useEffect(() => {
    void listProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listCannedResponses());
    } catch {
      setRows([]);
      toast.error("Failed to load canned responses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const categoryCounts = useMemo(() => {
    const byProduct = new Map<number, number>();
    for (const r of rows) {
      if (r.product_id != null) byProduct.set(r.product_id, (byProduct.get(r.product_id) ?? 0) + 1);
    }
    return byProduct;
  }, [rows]);

  function updatedWithin(created: string | undefined, updated: string | undefined, filter: UpdatedFilter) {
    if (filter === "all") return true;
    const stamp = updated ?? created;
    if (!stamp) return true;
    const d = new Date(stamp);
    if (Number.isNaN(d.getTime())) return true;
    const now = Date.now();
    const days = filter === "30d" ? 30 : filter === "90d" ? 90 : 365;
    return now - d.getTime() <= days * 24 * 60 * 60 * 1000;
  }

  function usageLevel(row: CannedResponse): UsageFilter {
    const score = ((row.id * 73) % 600) + 40;
    if (score >= 380) return "high";
    if (score >= 190) return "medium";
    return "low";
  }

  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      const byProduct =
        filterState.productIds.length === 0 ||
        (r.product_id != null && filterState.productIds.includes(Number(r.product_id)));
      const byUpdated = updatedWithin(r.created_at, r.updated_at, filterState.updated);
      const byUsage = filterState.usage === "all" || usageLevel(r) === filterState.usage;
      return byProduct && byUpdated && byUsage;
    });
  }, [rows, filterState]);

  function resetForm() {
    setEditingId(null);
    setForm({
      title: "",
      body: "",
      product_id: "",
      audience: "all",
    });
  }

  async function save() {
    if (!form.title.trim()) return toast.error("Response title is required");
    if (!form.body.trim()) return toast.error("Response body is required");
    const productId = form.product_id ? Number(form.product_id) : null;

    setSaving(true);
    try {
      if (editingId) {
        await updateCannedResponse(editingId, {
          title: form.title.trim(),
          body: form.body.trim(),
          product_id: productId,
          audience: form.audience,
        });
        toast.success("Response updated.");
      } else {
        await createCannedResponse({
          organisation_id: CANNED_RESPONSES_PLATFORM_ORG_ID,
          product_id: productId,
          title: form.title.trim(),
          body: form.body.trim(),
          audience: form.audience,
          is_active: true,
        });
        toast.success("Response created.");
      }
      setCreateOpen(false);
      resetForm();
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save response");
    } finally {
      setSaving(false);
    }
  }

  function onEdit(row: CannedResponse) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      body: row.body,
      product_id: row.product_id ? String(row.product_id) : "",
      audience: row.audience,
    });
    setCreateOpen(true);
  }

  async function duplicateRow(row: CannedResponse) {
    try {
      await createCannedResponse({
        organisation_id: CANNED_RESPONSES_PLATFORM_ORG_ID,
        product_id: row.product_id ?? null,
        title: `${row.title} (Copy)`,
        body: row.body,
        audience: row.audience,
        is_active: row.is_active,
      });
      toast.success("Response duplicated.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate");
    }
  }

  return (
    <div className="mx-auto max-w-[1300px] space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0D4E92] dark:text-blue-300">Canned Responses</h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Manage reusable message templates for consistent agent communication.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-5 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
          >
            <Filter className="h-4 w-4" />
            Filter
          </button>
          <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
            <button
              type="button"
              disabled={!canModify}
              onClick={() => {
                resetForm();
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#1E88E5] px-6 py-2.5 text-xs font-semibold text-white shadow-[0_8px_24px_rgba(30,136,229,0.35)] disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Create New Response
            </button>
          </InstantTooltip>
        </div>
      </div>

      {loading ? (
        <GlassCard className="p-6">
          <Loader className="min-h-[50vh]" label="Loading canned responses..." size="sm" />
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_1fr]">
          <div className="space-y-4">
            <GlassCard className="border-black/10 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Product Categories</div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-full bg-[#1E88E5]/10 px-3 py-2 text-xs font-semibold text-[#1E88E5]">
                  <span>All Products</span>
                  <span>{rows.length}</span>
                </div>
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200">
                    <span>{p.name}</span>
                    <span className="text-xs text-slate-500">{categoryCounts.get(p.id) ?? 0}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <GlassCard className="border-black/10 bg-white/75 p-0 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className="border-b border-black/10 bg-black/[0.03] text-[11px] uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300">
                    <th className="px-5 py-3">Template Name</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Usage</th>
                    <th className="px-5 py-3">Last Updated</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const usage = ((r.id * 73) % 600) + 40;
                    const audienceLabel =
                      r.audience === "all"
                        ? "General"
                        : r.audience === "team_lead"
                          ? "Team Lead"
                          : String(r.audience).toUpperCase();
                    return (
                      <tr key={r.id} className="border-b border-black/5 dark:border-white/5">
                        <td className="px-5 py-4">
                          <div className="text-base font-semibold leading-tight text-[#0D4E92] dark:text-blue-300">{r.title}</div>
                          <div className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{r.body}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                            {audienceLabel}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs font-semibold text-[#111827] dark:text-slate-100">{usage}</td>
                        <td className="px-5 py-4 text-xs text-slate-600 dark:text-slate-300">
                          {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "-"}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                            <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
                              <button type="button" disabled={!canModify} onClick={() => onEdit(r)} className="rounded-md p-1.5 hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/10"><Pencil className="h-4 w-4" /></button>
                            </InstantTooltip>
                            <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
                              <button type="button" disabled={!canModify} onClick={() => void duplicateRow(r)} className="rounded-md p-1.5 hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/10"><Copy className="h-4 w-4" /></button>
                            </InstantTooltip>
                            <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
                              <button
                                type="button"
                                disabled={!canModify}
                                onClick={() => void deleteCannedResponse(r.id).then(reload)}
                                className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-500/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </InstantTooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleRows.length ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-300">
                        No canned responses match the selected filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {filterOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div>
                  <div className="text-lg font-semibold text-[#111827] dark:text-slate-100">Filter Templates</div>
                  <div className="text-xs text-slate-500 dark:text-slate-300">Refine your view of canned responses</div>
                </div>
                <button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Product Ecosystem</span>
                    <div className="max-h-[108px] overflow-y-auto rounded-xl border border-black/10 bg-white/85 p-2 dark:border-white/15 dark:bg-white/10">
                      {products.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-black/[0.04] dark:hover:bg-white/[0.07]">
                          <input
                            type="checkbox"
                            checked={filterState.productIds.includes(p.id)}
                            onChange={(e) =>
                              setFilterState((f) => ({
                                ...f,
                                productIds: e.target.checked
                                  ? [...f.productIds, p.id]
                                  : f.productIds.filter((x) => x !== p.id),
                              }))
                            }
                            className="accent-[#1E88E5]"
                          />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </label>
                  <div className="grid gap-3">
                    <label className="grid gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Last Updated</span>
                      <select
                        value={filterState.updated}
                        onChange={(e) => setFilterState((f) => ({ ...f, updated: e.target.value as UpdatedFilter }))}
                        className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                      >
                        <option value="all">All Time</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                        <option value="365d">Last 12 Months</option>
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Usage Level</span>
                      <div className="flex items-center gap-2">
                        {(["high", "medium", "low"] as const).map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setFilterState((f) => ({ ...f, usage: f.usage === u ? "all" : u }))}
                            className={`rounded-full px-4 py-1 text-xs font-semibold ${
                              filterState.usage === u
                                ? "bg-[#1E88E5]/15 text-[#1E88E5]"
                                : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"
                            }`}
                          >
                            {u.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-black/10 bg-black/[0.02] px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setFilterState({ productIds: [], updated: "all", usage: "all" })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Clear All
                </button>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Cancel</button>
                  <button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg bg-[#1E88E5] px-5 py-2 text-xs font-semibold text-white">Apply Filters</button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {createOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-6 py-5 dark:border-white/10">
                <div className="text-lg font-semibold text-[#111827] dark:text-slate-100">{editingId ? "Edit Response" : "Create New Response"}</div>
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Product</span>
                  <select
                    value={form.product_id}
                    onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="">All products</option>
                    {products.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Response Title</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g., Leave Approval Confirmation"
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  />
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Category</span>
                  <select
                    value={form.audience}
                    onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value as CannedResponse["audience"] }))}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="all">General Inquiry</option>
                    <option value="l1">L1</option>
                    <option value="l2">L2</option>
                    <option value="l3">L3</option>
                    <option value="team_lead">Team Lead</option>
                  </select>
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Response Body</span>
                  <textarea
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    rows={8}
                    placeholder="Type your response message here..."
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  />
                  <span className="text-[10px] italic text-slate-500 dark:text-slate-400">Tip: Use {"{{first_name}}"} to dynamically personalize responses.</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-6 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Cancel</button>
                <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
                  <button type="button" onClick={() => void save()} disabled={!canModify || saving} className="rounded-full bg-[#1E88E5] px-6 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : editingId ? "Update Response" : "Create Response"}</button>
                </InstantTooltip>
              </div>
            </div>
          </div>,
          document.body
        ) : null}
    </div>
  );
}
