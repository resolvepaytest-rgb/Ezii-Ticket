import { Loader } from "@components/common/Loader";
import {
  getExternalOrganizations,
  getOrganisation,
  getOrganisationProducts,
  listProducts,
  setOrganisationProduct,
  updateOrganisation,
  type ExternalOrganization,
  type OrganisationProduct,
  type Product,
} from "@api/adminApi";
import { isSyntheticOrganisationName } from "@/lib/organisationDisplay";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

function safeId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type OrgProductAssignModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` when opening from “Add” (empty selection); org id when opening from edit */
  initialOrgId: string | null;
  /** Display name when `initialOrgId` is not yet in the external list */
  initialOrgName?: string | null;
  onSaved: () => void;
};

export function OrgProductAssignModal({
  open,
  onOpenChange,
  initialOrgId,
  initialOrgName = null,
  onSaved,
}: OrgProductAssignModalProps) {
  const [selectedValue, setSelectedValue] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [orgProducts, setOrgProducts] = useState<OrganisationProduct[]>([]);
  const [draft, setDraft] = useState<Record<number, { enabled: boolean }>>({});

  /** Customer orgs from external directory API (`getExternalOrganizations`). */
  const [externalOrgList, setExternalOrgList] = useState<ExternalOrganization[]>(
    []
  );
  const [orgsPickerLoading, setOrgsPickerLoading] = useState(false);
  const [orgsPickerError, setOrgsPickerError] = useState<string | null>(null);

  const selectedOrgNum = useMemo(() => {
    if (!selectedValue) return null;
    return safeId(selectedValue);
  }, [selectedValue]);

  const sortedExternalOrgs = useMemo(() => {
    return [...externalOrgList].sort((a, b) =>
      (a.organization_name ?? "").localeCompare(b.organization_name ?? "", undefined, {
        sensitivity: "base",
      })
    );
  }, [externalOrgList]);

  const selectedOrgLabel = useMemo(() => {
    if (initialOrgId) {
      return initialOrgName?.trim() || `Organization ${initialOrgId}`;
    }
    if (!selectedValue) return "";
    const ext = externalOrgList.find((x) => String(x.id) === selectedValue);
    const name = ext?.organization_name?.trim();
    if (name) return name;
    if (selectedOrgNum != null) return `Organization ${selectedOrgNum}`;
    return "";
  }, [initialOrgId, initialOrgName, selectedValue, selectedOrgNum, externalOrgList]);

  const resetWhenOpened = useCallback(() => {
    setSelectedValue(initialOrgId ?? "");
    setError(null);
    setOrgProducts([]);
    setDraft({});
  }, [initialOrgId]);

  useEffect(() => {
    if (!open) return;
    resetWhenOpened();
  }, [open, initialOrgId, resetWhenOpened]);

  useEffect(() => {
    if (!open || initialOrgId) return;
    let cancelled = false;
    setOrgsPickerLoading(true);
    setOrgsPickerError(null);
    void (async () => {
      try {
        const ext = await getExternalOrganizations();
        if (!cancelled) setExternalOrgList(ext);
      } catch (e) {
        if (!cancelled) {
          setExternalOrgList([]);
          setOrgsPickerError(
            e instanceof Error ? e.message : "Failed to load external organizations"
          );
        }
      } finally {
        if (!cancelled) setOrgsPickerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialOrgId]);

  const buildDraftFromProducts = useCallback(
    (prods: Product[], op: OrganisationProduct[]) => {
      const next: typeof draft = {};
      for (const prod of prods) {
        const row = op.find((x) => x.product_id === prod.id);
        next[prod.id] = {
          enabled: row?.enabled ?? false,
        };
      }
      return next;
    },
    []
  );

  useEffect(() => {
    if (!open) return;

    if (selectedOrgNum) {
      let cancelled = false;
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const [prods, op] = await Promise.all([
            listProducts(),
            getOrganisationProducts(selectedOrgNum),
          ]);
          if (cancelled) return;
          setProducts(prods);
          setOrgProducts(op);
          setDraft(buildDraftFromProducts(prods, op));
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Failed to load organization");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setProducts([]);
    setOrgProducts([]);
    setDraft({});
    setLoading(false);
    setError(null);
  }, [open, selectedOrgNum, buildDraftFromProducts]);

  const orgProductById = useMemo(() => {
    const m = new Map<number, OrganisationProduct>();
    for (const row of orgProducts) m.set(row.product_id, row);
    return m;
  }, [orgProducts]);

  async function handleSave() {
    if (!selectedOrgNum) {
      toast.error("Select an organization from the list.");
      return;
    }

    setSaving(true);
    try {
      const nameFromDirectory = selectedOrgLabel.trim();
      if (nameFromDirectory) {
        try {
          const profile = await getOrganisation(selectedOrgNum);
          if (isSyntheticOrganisationName(profile.name)) {
            await updateOrganisation(selectedOrgNum, { name: nameFromDirectory });
          }
        } catch {
          /* ignore profile sync errors; product save still attempted */
        }
      }

      for (const prod of products) {
        const d = draft[prod.id];
        if (!d) continue;
        await setOrganisationProduct(selectedOrgNum, prod.id, {
          enabled: d.enabled,
          default_routing_queue_id:
            orgProductById.get(prod.id)?.default_routing_queue_id ?? null,
        });
      }
      toast.success("Products saved.");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const showProductSection = selectedOrgNum !== null;
  const canSave =
    showProductSection && !loading && products.length > 0 && !error;

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/90 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-950/85"
        role="dialog"
        aria-labelledby="org-product-modal-title"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-5 py-4 dark:border-white/10">
          <div>
            <h2
              id="org-product-modal-title"
              className="text-lg font-semibold text-[#475569] dark:text-foreground"
            >
              Organization products
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {initialOrgId ? (
                <>
                  Configure products for the selected organization. Creating a queue with a
                  product sets the default routing queue for that product automatically.
                </>
              ) : (
                <>
                  Choose a customer organization from the external directory, then configure
                  products. Creating a queue with a product sets the default routing queue for
                  that product automatically.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-slim">
          {initialOrgId ? (
            selectedValue ? (
              <div className="rounded-xl border border-black/10 bg-white/40 px-4 py-3 text-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Organization
                </div>
                <div className="mt-1 font-semibold text-foreground">
                  {selectedOrgLabel}
                </div>
              </div>
            ) : null
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="org-product-assign-org-select"
                className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Organization
              </label>
              {orgsPickerLoading ? (
                <div className="py-6">
                  <Loader label="Loading directory organizations…" size="sm" />
                </div>
              ) : orgsPickerError ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {orgsPickerError}
                </div>
              ) : sortedExternalOrgs.length === 0 ? (
                <p className="rounded-xl border border-black/10 bg-white/40 px-3 py-2.5 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
                  No customer organizations were returned from the external directory.
                </p>
              ) : (
                <select
                  id="org-product-assign-org-select"
                  value={selectedValue}
                  onChange={(e) => setSelectedValue(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2.5 text-sm font-medium text-foreground backdrop-blur-sm dark:border-white/15 dark:bg-white/10"
                >
                  <option value="">Select an organization…</option>
                  {sortedExternalOrgs.map((org) => (
                    <option key={org.id} value={String(org.id)}>
                      {org.organization_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {!selectedValue ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              No organization selected.
            </p>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          ) : null}

          {selectedValue && loading ? (
            <div className="mt-8 py-12">
              <Loader label="Loading…" size="sm" />
            </div>
          ) : null}

          {showProductSection && !loading && !error ? (
            <div className="mt-5 space-y-3">
              <div className="text-sm font-semibold">Product enablement</div>
              <div className="grid gap-3">
                {products.map((prod) => {
                  const d = draft[prod.id];

                  return (
                    <div
                      key={prod.id}
                      className="rounded-xl border border-black/10 bg-white/40 p-4 backdrop-blur-sm dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-sm font-semibold">{prod.name}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            code:{" "}
                            <span className="font-mono">{prod.code}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 md:min-w-[240px]">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={Boolean(d?.enabled)}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [prod.id]: {
                                    enabled: e.target.checked,
                                  },
                                }))
                              }
                            />
                            Enabled
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-black/10 px-5 py-4 dark:border-white/10">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => void handleSave()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
