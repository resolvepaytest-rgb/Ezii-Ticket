import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { toast } from "sonner";
import {
  getExternalOrganizations,
  listProducts,
  listQueues,
  getOrganisationProducts,
  setOrganisationProduct,
  type ExternalOrganization,
  type Product,
  type Queue,
  type OrganisationProduct,
} from "@api/adminApi";

function safeId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function PartnerSetupPage({
  orgId,
  onOrgChange,
}: {
  orgId: string;
  onOrgChange?: (orgId: string) => void;
}) {
  const [selectedOrgId, setSelectedOrgId] = useState(orgId || "");

  const selectedOrgIdNum = useMemo(() => {
    const n = Number(selectedOrgId);
    return Number.isFinite(n) ? n : null;
  }, [selectedOrgId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [orgProducts, setOrgProducts] = useState<OrganisationProduct[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);

  const [draft, setDraft] = useState<
    Record<number, { enabled: boolean; default_routing_queue_id: number | null }>
  >({});

  async function load() {
    if (!selectedOrgIdNum) return;
    setLoading(true);
    setError(null);
    try {
      const [p, op, q] = await Promise.all([
        listProducts(),
        getOrganisationProducts(selectedOrgIdNum),
        listQueues(selectedOrgIdNum),
      ]);

      setProducts(p);
      setOrgProducts(op);
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
      setError(e instanceof Error ? e.message : "Failed to load partner setup");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedOrgId(orgId || "");
  }, [orgId]);

  useEffect(() => {
    if (!selectedOrgIdNum) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgIdNum]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await getExternalOrganizations();
        setExternalOrgs(list);
      } catch {
        setExternalOrgs([]);
      }
    })();
  }, []);

  const [saving, setSaving] = useState(false);

  async function saveAll() {
    if (!selectedOrgIdNum) return;
    setSaving(true);
    try {
      for (const prod of products) {
        const d = draft[prod.id];
        if (!d) continue;
        await setOrganisationProduct(selectedOrgIdNum, prod.id, {
          enabled: d.enabled,
          default_routing_queue_id: d.default_routing_queue_id,
        });
      }
      toast.success("Partner setup saved.");
      await load();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to save partner setup"
      );
    } finally {
      setSaving(false);
    }
  }

  const orgProductById = useMemo(() => {
    const m = new Map<number, OrganisationProduct>();
    for (const row of orgProducts) m.set(row.product_id, row);
    return m;
  }, [orgProducts]);

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <div className="text-xl font-semibold tracking-tight">Partner Setup</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Enable products for this tenant and set default routing queues.
        </div>
      </div>

      <GlassCard className="mb-4 p-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">
            Organisation
          </label>
          <select
            value={selectedOrgId}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedOrgId(v);
              if (v) onOrgChange?.(v);
            }}
            className="w-full rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm text-foreground backdrop-blur-xl dark:border-white/10"
          >
            <option value="">Select</option>
            {externalOrgs.length > 0 ? (
              externalOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.organization_name}
                </option>
              ))
            ) : null}
          </select>
        </div>
      </GlassCard>

      {!selectedOrgId ? (
        <GlassCard className="p-6">
          <div className="text-sm text-muted-foreground">
            Select an organisation to view and update partner setup.
          </div>
        </GlassCard>
      ) : null}

      {selectedOrgId && loading ? (
        <GlassCard className="p-6">
          <Loader className="min-h-[60vh]" label="Loading products..." size="sm" />
        </GlassCard>
      ) : null}

      {error ? (
        <GlassCard className="p-6">
          <div className="text-sm text-red-300">{error}</div>
        </GlassCard>
      ) : null}

      {selectedOrgId && !loading && !error ? (
        <>
          <GlassCard className="p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-lg font-semibold">Product enablement</div>
              <button
                type="button"
                onClick={() => void saveAll()}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4">
              {products.map((prod) => {
                const d = draft[prod.id];
                const defaultQueueId = d?.default_routing_queue_id ?? null;
                const productQueues = queues.filter(
                  (q) => q.product_id === prod.id
                );
                const currentDefaultName =
                  orgProductById.get(prod.id)?.default_routing_queue_name ?? null;

                return (
                  <div
                    key={prod.id}
                    className="rounded-xl border border-black/10 bg-white/5 p-4 dark:border-white/10"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold">{prod.name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          code: <span className="font-mono">{prod.code}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Current default queue:{" "}
                          {currentDefaultName ? currentDefaultName : "None"}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:min-w-[260px]">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(d?.enabled)}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                [prod.id]: {
                                  enabled: e.target.checked,
                                  default_routing_queue_id:
                                    prev[prod.id]?.default_routing_queue_id ?? null,
                                },
                              }))
                            }
                          />
                          Enabled
                        </label>

                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">
                            Default routing queue
                          </span>
                          <select
                            value={defaultQueueId ?? ""}
                            onChange={(e) => {
                              const next = e.target.value
                                ? Number(e.target.value)
                                : null;
                              setDraft((prev) => ({
                                ...prev,
                                [prod.id]: {
                                  enabled: prev[prod.id]?.enabled ?? false,
                                  default_routing_queue_id: next,
                                },
                              }));
                            }}
                            className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                            disabled={!productQueues.length}
                          >
                            <option value="">None</option>
                            {productQueues.map((q) => (
                              <option key={q.id} value={q.id}>
                                {q.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}

              {products.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No products found.
                </div>
              ) : null}
            </div>
          </GlassCard>
        </>
      ) : null}

    </div>
  );
}

