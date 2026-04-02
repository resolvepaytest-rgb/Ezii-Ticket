import { useEffect, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { toast } from "sonner";
import {
  createApiToken,
  createWebhook,
  listApiTokens,
  listWebhooks,
  updateApiToken,
  updateWebhook,
  type ApiToken,
  type Webhook,
} from "@api/adminApi";

const EVENT_OPTIONS = [
  "ticket_created",
  "ticket_assigned",
  "ticket_status_changed",
  "sla_warning",
  "sla_breached",
];

export function ApiWebhooksPage({ orgId }: { orgId: string }) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [hookForm, setHookForm] = useState({
    name: "",
    endpoint: "",
    events: [] as string[],
  });

  useEffect(() => {
    const orgIdNum = Number(orgId);
    if (!Number.isFinite(orgIdNum)) return;
    void Promise.all([listApiTokens(orgIdNum), listWebhooks(orgIdNum)])
      .then(([t, w]) => {
        setTokens(t);
        setHooks(w);
      })
      .catch(() => {
        setTokens([]);
        setHooks([]);
      });
  }, [orgId]);

  async function reload() {
    const orgIdNum = Number(orgId);
    if (!Number.isFinite(orgIdNum)) return;
    const [t, w] = await Promise.all([listApiTokens(orgIdNum), listWebhooks(orgIdNum)]);
    setTokens(t);
    setHooks(w);
  }

  async function createToken() {
    if (!tokenName.trim()) return toast.error("Token name is required");
    const orgIdNum = Number(orgId);
    if (!Number.isFinite(orgIdNum)) return;
    const row = await createApiToken({
      organisation_id: orgIdNum,
      token_name: tokenName.trim(),
      is_active: true,
    });
    await reload();
    toast.success(row.token_raw ? `Token created: ${row.token_raw}` : "Token created.");
    setTokenName("");
  }

  async function createWebhookRow() {
    if (!hookForm.name.trim()) return toast.error("Webhook name is required");
    if (!hookForm.endpoint.trim()) return toast.error("Webhook endpoint is required");
    if (hookForm.events.length === 0) return toast.error("Select at least one event");
    const orgIdNum = Number(orgId);
    if (!Number.isFinite(orgIdNum)) return;
    await createWebhook({
      organisation_id: orgIdNum,
      webhook_name: hookForm.name.trim(),
      endpoint: hookForm.endpoint.trim(),
      events_json: JSON.stringify(hookForm.events),
      is_active: true,
    });
    await reload();
    toast.success("Webhook saved.");
    setHookForm({ name: "", endpoint: "", events: [] });
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <div className="text-xl font-semibold tracking-tight">API & Webhooks</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Generate API tokens; configure outbound webhook endpoints.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <GlassCard className="p-6">
          <div className="text-lg font-semibold">API Tokens</div>
          <div className="mt-3 flex gap-2">
            <input
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="Token name"
              className="flex-1 rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm dark:border-white/10"
            />
            <button
              type="button"
              onClick={createToken}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Generate
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {tokens.length === 0 ? <div className="text-sm text-muted-foreground">No tokens yet.</div> : null}
            {tokens.map((t) => (
              <div key={t.id} className="rounded-xl border border-black/10 bg-white/5 p-3 text-sm dark:border-white/10">
                <div className="font-semibold">{t.token_name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.token_masked} · {t.created_at ? new Date(t.created_at).toLocaleString() : "—"} · {t.is_active ? "Active" : "Revoked"}
                </div>
                <button
                  type="button"
                  onClick={() => void updateApiToken(t.id, { is_active: !t.is_active }).then(reload)}
                  className="mt-2 rounded-lg border border-black/10 px-2 py-1 text-xs dark:border-white/10"
                >
                  {t.is_active ? "Revoke" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <div className="text-lg font-semibold">Outbound Webhooks</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <input
              value={hookForm.name}
              onChange={(e) => setHookForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Webhook name"
              className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm dark:border-white/10"
            />
            <input
              value={hookForm.endpoint}
              onChange={(e) => setHookForm((f) => ({ ...f, endpoint: e.target.value }))}
              placeholder="https://example.com/webhooks/ets"
              className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm dark:border-white/10"
            />
            <div className="rounded-xl border border-black/10 bg-white/5 p-3 dark:border-white/10">
              <div className="mb-2 text-xs text-muted-foreground">Events</div>
              <div className="grid grid-cols-1 gap-1 text-sm">
                {EVENT_OPTIONS.map((ev) => (
                  <label key={ev} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hookForm.events.includes(ev)}
                      onChange={(e) =>
                        setHookForm((f) => ({
                          ...f,
                          events: e.target.checked
                            ? [...f.events, ev]
                            : f.events.filter((x) => x !== ev),
                        }))
                      }
                    />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void createWebhookRow()}
              className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Save Webhook
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {hooks.length === 0 ? <div className="text-sm text-muted-foreground">No webhook endpoints yet.</div> : null}
            {hooks.map((h) => (
              <div key={h.id} className="rounded-xl border border-black/10 bg-white/5 p-3 text-sm dark:border-white/10">
                <div className="font-semibold">{h.webhook_name}</div>
                <div className="text-xs text-muted-foreground">{h.endpoint}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {(() => {
                    try {
                      const parsed = JSON.parse(h.events_json);
                      return Array.isArray(parsed) ? parsed.join(" | ") : "-";
                    } catch {
                      return "-";
                    }
                  })()}{" "}
                  · {h.is_active ? "Active" : "Disabled"}
                </div>
                <button
                  type="button"
                  onClick={() => void updateWebhook(h.id, { is_active: !h.is_active }).then(reload)}
                  className="mt-2 rounded-lg border border-black/10 px-2 py-1 text-xs dark:border-white/10"
                >
                  {h.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
