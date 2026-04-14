import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import {
  createKeywordRouting,
  deleteKeywordRouting,
  getExternalOrganizations,
  listKeywordRouting,
  listOrganisations,
  listProducts,
  updateKeywordRouting,
  type ExternalOrganization,
  type KeywordRoutingEntry,
  type Organisation,
  type Product,
} from "@api/adminApi";
import { useAuthStore } from "@store/useAuthStore";
import { EZII_BRAND } from "@/lib/eziiBrand";
import { Pencil, Plus, Trash2 } from "lucide-react";

export function KeywordsRoutingPage({ orgId }: { orgId: string }) {
  const authUser = useAuthStore((s) => s.user);
  const isSystemAdminUser =
    authUser?.role_name === "admin" &&
    authUser?.org_id === "1" &&
    authUser?.user_id === "1" &&
    authUser?.role_id === "1" &&
    authUser?.user_type_id === "1";

  const shellOrgId = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);

  const defaultSelectedOrgId = useMemo(() => {
    if (!isSystemAdminUser) return shellOrgId ? String(shellOrgId) : "1";
    return "1";
  }, [isSystemAdminUser, shellOrgId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [entries, setEntries] = useState<KeywordRoutingEntry[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(defaultSelectedOrgId);
  const [newPhrase, setNewPhrase] = useState("");
  const [newProductId, setNewProductId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<KeywordRoutingEntry | null>(null);
  const [editPhrase, setEditPhrase] = useState("");

  useEffect(() => {
    setSelectedOrgId(defaultSelectedOrgId);
  }, [defaultSelectedOrgId]);

  const load = useCallback(async () => {
    if (!shellOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const [plist, ext] = await Promise.all([listProducts(), getExternalOrganizations().catch(() => [])]);
      setProducts(plist);
      setExternalOrgs(ext);
      if (plist[0]) setNewProductId(String(plist[0].id));

      if (isSystemAdminUser) {
        const orgList = await listOrganisations();
        const hasGlobalOrg = orgList.some((o) => Number(o.id) === 1);
        const orgsWithGlobal = hasGlobalOrg
          ? orgList
          : ([{ id: 1, name: "Resolve Biz Services Pvt Ltd (Global Defaults)" } as Organisation, ...orgList]);
        setOrgs(orgsWithGlobal);
      } else {
        setOrgs([{ id: shellOrgId, name: `Organization ${shellOrgId}` } as Organisation]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [shellOrgId, isSystemAdminUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchEntries = useCallback(async () => {
    const n = Number(selectedOrgId);
    if (!Number.isFinite(n)) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listKeywordRouting(n);
      setEntries(rows);
    } catch (e) {
      setEntries([]);
      setError(e instanceof Error ? e.message : "Failed to load keywords");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  const orgDropdownOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const o of externalOrgs) {
      if (!o.id) continue;
      byId.set(String(o.id), o.organization_name || `Organization ${o.id}`);
    }
    if (!byId.has("1")) byId.set("1", "Resolve Biz Services Pvt Ltd");
    for (const o of orgs) {
      const id = String(o.id);
      if (!byId.has(id)) byId.set(id, o.name);
    }
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
  }, [externalOrgs, orgs]);

  const byProduct = useMemo(() => {
    const map = new Map<string, KeywordRoutingEntry[]>();
    for (const e of entries) {
      const key = e.product_name ?? `Product ${e.product_id}`;
      const cur = map.get(key) ?? [];
      cur.push(e);
      map.set(key, cur);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.phrase_normalized.localeCompare(b.phrase_normalized));
    }
    return map;
  }, [entries]);

  async function handleAdd() {
    const orgNum = Number(selectedOrgId);
    const pid = Number(newProductId);
    const phrase = newPhrase.trim();
    if (!Number.isFinite(orgNum) || !Number.isFinite(pid) || !phrase) {
      toast.error("Select a product and enter a keyword phrase.");
      return;
    }
    setSaving(true);
    try {
      await createKeywordRouting({ organisation_id: orgNum, product_id: pid, phrase });
      toast.success("Keyword added.");
      setNewPhrase("");
      await fetchEntries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add keyword");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: KeywordRoutingEntry) {
    if (!window.confirm(`Remove keyword "${row.phrase}"?`)) return;
    try {
      await deleteKeywordRouting(row.id);
      toast.success("Removed.");
      await fetchEntries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const phrase = editPhrase.trim();
    if (!phrase) {
      toast.error("Phrase cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await updateKeywordRouting(editing.id, { phrase });
      toast.success("Updated.");
      setEditing(null);
      await fetchEntries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">System Configuration</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-[#475569] dark:text-foreground">Keywords Routing</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            When a new ticket&apos;s subject or description contains a configured phrase (case-insensitive), priority is set
            to <strong className="font-semibold text-slate-800 dark:text-slate-100">P1</strong> and routing targets the{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-100">L3</strong> queue for that product when one
            exists (queue name or team name contains L3). Default phrases are created for every organization; you can add,
            edit, or remove.
          </p>
        </div>
        {isSystemAdminUser ? (
          <div className="min-w-[260px]">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Organization</div>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
            >
              {orgDropdownOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <GlassCard className="border-black/10 bg-white/40 p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="text-sm font-semibold text-[#111827] dark:text-slate-100">Add keyword</div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Product</div>
            <select
              value={newProductId}
              onChange={(e) => setNewProductId(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
            >
              {products.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px] flex-[2]">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Trigger phrase</div>
            <input
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
              placeholder="e.g. payroll sync failed"
              className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleAdd()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: EZII_BRAND.primary }}
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </GlassCard>

      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader label="Loading keywords…" />
        </div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : entries.length === 0 ? (
        <GlassCard className="border-black/10 bg-white/35 p-8 text-center text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
          No keyword phrases for this organization yet. New organizations receive default Payroll / Leave / Attendance /
          Expense phrases automatically. Run the latest database migration if this list should not be empty.
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from(byProduct.entries()).map(([productLabel, rows]) => (
            <GlassCard
              key={productLabel}
              className="min-w-0 border-black/10 bg-white/35 p-5 dark:border-white/10 dark:bg-white/[0.06]"
            >
              <div className="mb-3 text-sm font-bold text-[#1E88E5]">{productLabel}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/10 text-slate-500 dark:border-white/10">
                      <th className="pb-2 pr-2 font-semibold">Keyword / phrase</th>
                      <th className="pb-2 pr-2 font-semibold">Default</th>
                      <th className="pb-2 font-semibold w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-black/5 dark:border-white/5">
                        <td className="py-2 pr-2 align-middle text-slate-800 dark:text-slate-100">{row.phrase}</td>
                        <td className="py-2 pr-2 align-middle text-slate-600 dark:text-slate-400">
                          {row.is_system_default ? "Yes" : "—"}
                        </td>
                        <td className="py-2 align-middle">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                              title="Edit phrase"
                              onClick={() => {
                                setEditing(row);
                                setEditPhrase(row.phrase);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="rounded-lg p-1.5 text-red-600 hover:bg-red-500/10"
                              title="Delete"
                              onClick={() => void handleDelete(row)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <GlassCard className="w-full max-w-md border-black/10 bg-white/95 p-5 shadow-xl dark:border-white/15 dark:bg-[#0c1220]">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Edit phrase</div>
            <input
              value={editPhrase}
              onChange={(e) => setEditPhrase(e.target.value)}
              className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/10"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/15"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: EZII_BRAND.primary }}
                onClick={() => void saveEdit()}
              >
                Save
              </button>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
