import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GlassCard } from "@components/common/GlassCard";
import {
  createCustomField,
  listCustomFields,
  listProducts,
  updateCustomField,
  type CustomField,
  type Product,
} from "@api/adminApi";
import { EZII_BRAND } from "@/lib/eziiBrand";
import {
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Circle,
  CirclePlus,
  Eye,
  Hash,
  Lock,
  Pencil,
  Plus,
  Type,
} from "lucide-react";

type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "dropdown_single"
  | "dropdown_multi"
  | "checkbox"
  | "file";

type VisibilityMode = "agent_only" | "customer_and_agent";

type FieldLibraryItem = {
  key: CustomFieldType;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
};

const FIELD_LIBRARY: FieldLibraryItem[] = [
  { key: "text", label: "Text Input", subtitle: "Single line text entries", icon: Type },
  { key: "number", label: "Number", subtitle: "Integer or decimal values", icon: Hash },
  { key: "date", label: "Date Picker", subtitle: "Date or timestamp fields", icon: CalendarDays },
  { key: "dropdown_single", label: "Dropdown", subtitle: "Multi-option select list", icon: ChevronRight },
  { key: "checkbox", label: "Checkbox", subtitle: "Boolean toggle selection", icon: CheckSquare },
];

function toFieldKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function prettyTypeName(type: string) {
  switch (type) {
    case "text":
      return "Text";
    case "textarea":
      return "Text Area";
    case "number":
      return "Number";
    case "date":
      return "Date";
    case "datetime":
      return "Date-Time";
    case "dropdown_single":
      return "Dropdown";
    case "dropdown_multi":
      return "Multi Dropdown";
    case "checkbox":
      return "Checkbox";
    case "file":
      return "File Upload";
    default:
      return type;
  }
}

function optionsJsonToCsv(options_json: string | null) {
  if (!options_json) return "";
  try {
    const parsed = JSON.parse(options_json);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).join(", ");
  } catch {
    // ignore parse errors and fallback empty
  }
  return "";
}

function csvToOptionsJson(csv: string) {
  const options = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return JSON.stringify(options);
}

export function CustomFieldsPage({ orgId }: { orgId: string }) {
  const orgIdNum = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);

  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    product_id: "",
    label: "",
    field_type: "text" as CustomFieldType,
    is_required: true,
    visibility: "customer_and_agent" as VisibilityMode,
    options_csv: "",
    is_active: true,
  });

  const activeLibraryItem = useMemo(
    () => FIELD_LIBRARY.find((x) => x.key === form.field_type) ?? FIELD_LIBRARY[0],
    [form.field_type]
  );

  const fieldKeyPreview = useMemo(() => toFieldKey(form.label), [form.label]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.label.localeCompare(b.label)),
    [rows]
  );

  async function load() {
    if (!orgIdNum) return;
    setLoading(true);
    try {
      const [p, c] = await Promise.all([listProducts(), listCustomFields(orgIdNum)]);
      setProducts(p);
      setRows(c);
    } catch {
      setProducts([]);
      setRows([]);
      toast.error("Failed to load custom fields.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdNum]);

  useEffect(() => {
    if (products.length === 0) return;
    setForm((f) => (f.product_id ? f : { ...f, product_id: String(products[0]!.id) }));
  }, [products]);

  function startEdit(row: CustomField) {
    setEditingId(row.id);
    setForm({
      product_id: String(row.product_id),
      label: row.label ?? "",
      field_type: row.field_type as CustomFieldType,
      is_required: Boolean(row.is_required),
      visibility: (row.visibility as VisibilityMode) ?? "agent_only",
      options_csv: optionsJsonToCsv(row.options_json ?? null),
      is_active: Boolean(row.is_active),
    });
  }

  function clearDraft() {
    setEditingId(null);
    setForm({
      product_id: "",
      label: "",
      field_type: "text",
      is_required: true,
      visibility: "customer_and_agent",
      options_csv: "",
      is_active: true,
    });
  }

  async function saveDraft() {
    if (!orgIdNum) return;
    if (!form.product_id) return toast.error("Select product.");
    if (!form.label.trim()) return toast.error("Field label is required.");

    const payload = {
      label: form.label.trim(),
      field_type: form.field_type,
      is_required: form.is_required,
      visibility: form.visibility,
      options_json: form.options_csv ? csvToOptionsJson(form.options_csv) : JSON.stringify([]),
      is_active: form.is_active,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateCustomField(editingId, payload);
        toast.success("Custom field updated.");
      } else {
        await createCustomField({
          organisation_id: orgIdNum,
          product_id: Number(form.product_id),
          field_key: toFieldKey(form.label),
          ...payload,
        });
        toast.success("Custom field created.");
      }
      await load();
      clearDraft();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save custom field.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: CustomField) {
    try {
      await updateCustomField(row.id, { is_active: !row.is_active });
      await load();
      toast.success(row.is_active ? "Field disabled." : "Field enabled.");
    } catch {
      toast.error("Failed to update field status.");
    }
  }

  return (
    <div className="mx-auto max-w-[1300px] min-w-0 space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Settings <span className="px-1 text-slate-300 dark:text-slate-600">›</span>
            <span style={{ color: EZII_BRAND.primary }}>Custom Fields</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Custom Fields Management</h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-600 dark:text-slate-300">
            Define and manage product-specific metadata to capture granular ticket data across teams.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-2xl border border-black/10 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => {
              clearDraft();
              setForm((f) => ({ ...f, field_type: "text" }));
            }}
            className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-semibold text-white"
            style={{ backgroundColor: EZII_BRAND.primary }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add New Field
          </button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <GlassCard className="border-black/10 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Field Library</div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {FIELD_LIBRARY.length} types
              </span>
            </div>
            <div className="space-y-1.5">
              {FIELD_LIBRARY.map((item) => {
                const Icon = item.icon;
                const active = form.field_type === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, field_type: item.key }))}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${
                      active
                        ? "border-[#1E88E5]/45 bg-[#1E88E5]/10"
                        : "border-transparent bg-black/[0.02] hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        active ? "bg-[#1E88E5]/15 text-[#1E88E5]" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{item.label}</div>
                      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{item.subtitle}</div>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </GlassCard>

          <div className="rounded-2xl bg-gradient-to-b from-[#0F5EA8] to-[#0B4F92] px-4 py-4 text-white shadow-[0_10px_24px_rgba(15,94,168,0.35)]">
            <div className="text-sm font-semibold">Operational Insight</div>
            <p className="mt-2 text-xs leading-relaxed text-blue-100">
              Tickets with 3+ custom fields typically reach faster first-response and better routing accuracy.
            </p>
            <button className="mt-3 rounded-xl bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white">
              Publish Configuration
            </button>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <GlassCard className="min-w-0 overflow-hidden border-black/10 bg-white/75 p-0 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="border-b border-black/10 px-4 py-3 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  <Circle className="h-2.5 w-2.5 fill-[#1E88E5] text-[#1E88E5]" />
                  Active Configuration
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <button type="button" onClick={clearDraft} className="font-semibold text-slate-500 dark:text-slate-300">
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={saving}
                    className="font-semibold"
                    style={{ color: EZII_BRAND.primary }}
                  >
                    {saving ? "Saving..." : "Save Draft"}
                  </button>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-4 p-4">
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="grid min-w-0 gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Field Label</span>
                <input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder={activeLibraryItem?.label === "Text Input" ? "e.g., Software Version" : `e.g., ${activeLibraryItem?.label}`}
                  className="min-w-0 w-full rounded-xl border-0 bg-slate-100 px-3 py-2.5 text-xs text-slate-800 outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-[#1E88E5]/40 dark:bg-white/[0.08] dark:text-slate-100 dark:ring-white/10"
                />
              </label>
              <div className="grid min-w-0 gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Internal ID</span>
                <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2.5 text-xs text-slate-500 ring-1 ring-black/5 dark:bg-white/[0.08] dark:text-slate-300 dark:ring-white/10">
                  <span className="truncate">{fieldKeyPreview || "software_version"}</span>
                  <Lock className="h-3.5 w-3.5 shrink-0 opacity-65" />
                </div>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              <label className="grid min-w-0 gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Product</span>
                <select
                  value={form.product_id}
                  onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                  className="min-w-0 w-full rounded-xl border-0 bg-slate-100 px-3 py-2.5 text-xs text-slate-800 outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-[#1E88E5]/40 dark:bg-white/[0.08] dark:text-slate-100 dark:ring-white/10"
                >
                  <option value="">Select product</option>
                  {products.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Field Type</span>
                <select
                  value={form.field_type}
                  onChange={(e) => setForm((f) => ({ ...f, field_type: e.target.value as CustomFieldType }))}
                  className="min-w-0 w-full rounded-xl border-0 bg-slate-100 px-3 py-2.5 text-xs text-slate-800 outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-[#1E88E5]/40 dark:bg-white/[0.08] dark:text-slate-100 dark:ring-white/10"
                >
                  <option value="text">Text</option>
                  <option value="textarea">Text Area</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="datetime">Date-Time</option>
                  <option value="dropdown_single">Dropdown (single)</option>
                  <option value="dropdown_multi">Dropdown (multi)</option>
                  <option value="checkbox">Checkbox</option>
                  <option value="file">File Upload</option>
                </select>
              </label>
            </div>

            {(form.field_type === "dropdown_single" || form.field_type === "dropdown_multi") ? (
              <label className="grid min-w-0 gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Dropdown Options</span>
                <input
                  value={form.options_csv}
                  onChange={(e) => setForm((f) => ({ ...f, options_csv: e.target.value }))}
                  placeholder="e.g., Finance, Operations, Technical"
                  className="min-w-0 w-full rounded-xl border-0 bg-slate-100 px-3 py-2.5 text-xs text-slate-800 outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-[#1E88E5]/40 dark:bg-white/[0.08] dark:text-slate-100 dark:ring-white/10"
                />
              </label>
            ) : null}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#1E88E5]">Visibility & Permissions</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-black/5 dark:bg-white/[0.05] dark:ring-white/10">
                  <button
                    type="button"
                    aria-label="Customer visible toggle"
                    onClick={() => setForm((f) => ({ ...f, visibility: "customer_and_agent" }))}
                    className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
                      form.visibility === "customer_and_agent" ? "bg-[#1E88E5]" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                        form.visibility === "customer_and_agent" ? "left-[calc(100%-1.1rem)]" : "left-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="block font-semibold text-slate-800 dark:text-slate-100">Customer Visible</span>
                    Allow users to see this field in the support portal.
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-black/5 dark:bg-white/[0.05] dark:ring-white/10">
                  <button
                    type="button"
                    aria-label="Agent editable toggle"
                    onClick={() => setForm((f) => ({ ...f, visibility: "agent_only" }))}
                    className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
                      form.visibility === "agent_only" ? "bg-[#1E88E5]" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                        form.visibility === "agent_only" ? "left-[calc(100%-1.1rem)]" : "left-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="block font-semibold text-slate-800 dark:text-slate-100">Agent Editable</span>
                    Allow agents to modify values during ticket lifecycle.
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#1E88E5]">Validation Logic</div>
              <label className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-black/5 dark:bg-white/[0.05] dark:ring-white/10">
                <input
                  type="checkbox"
                  checked={form.is_required}
                  onChange={(e) => setForm((f) => ({ ...f, is_required: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-[#1E88E5]"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="block font-semibold text-slate-800 dark:text-slate-100">Mandatory Field</span>
                  Prevent ticket submission if this field is empty.
                </span>
                {form.is_required ? (
                  <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-500/20 dark:text-red-300">
                    HIGH PRIORITY
                  </span>
                ) : null}
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] text-slate-400 ring-1 ring-black/5 dark:bg-white/[0.05] dark:text-slate-500 dark:ring-white/10">
                <CirclePlus className="h-3.5 w-3.5" />
                Add custom Regex validation...
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={clearDraft}
                className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving}
                className="rounded-xl px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: EZII_BRAND.primary }}
              >
                {editingId ? (saving ? "Updating..." : "Update Field") : saving ? "Deploying..." : "Deploy to Production"}
              </button>
            </div>
            </div>
          </GlassCard>

          <div className="relative">
            <GlassCard className="min-w-0 overflow-hidden border-black/10 bg-white/75 p-0 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="border-b border-black/10 px-4 py-3 dark:border-white/10">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Existing Product Fields</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-50/90 dark:bg-white/[0.03]">
                    <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-2.5 font-semibold">Field Name</th>
                      <th className="px-4 py-2.5 font-semibold">Type</th>
                      <th className="px-4 py-2.5 font-semibold">Access</th>
                      <th className="px-4 py-2.5 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                          Loading fields...
                        </td>
                      </tr>
                    ) : sortedRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                          No custom fields configured yet.
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-black/5 align-top dark:border-white/10"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              <Circle
                                className={`mt-1 h-2.5 w-2.5 ${r.is_active ? "fill-emerald-500 text-emerald-500" : "fill-amber-500 text-amber-500"}`}
                              />
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-slate-100">{r.label}</div>
                                <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">{r.field_key}</div>
                                {r.options_json ? (
                                  <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                                    {optionsJsonToCsv(r.options_json)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold dark:bg-white/10">
                              {prettyTypeName(r.field_type)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            <Eye className="h-3.5 w-3.5" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleActive(r)}
                                className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-[11px] dark:border-white/10"
                                title={r.is_active ? "Disable field" : "Enable field"}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => startEdit(r)}
                                className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-[11px] dark:border-white/10"
                                title="Edit field"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
            <button
              type="button"
              className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#1E88E5] px-4 py-1.5 text-[10px] font-semibold text-white shadow-[0_8px_20px_rgba(30,136,229,0.35)]"
            >
              Publish Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

