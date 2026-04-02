import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { toast } from "sonner";
import {
  getOrganisation,
  getOrganisationRetention,
  getOrganisationSettings,
  updateOrganisation,
  updateOrganisationRetention,
  updateOrganisationSettings,
} from "@api/adminApi";

export function ResolveSetupPage({ orgId }: { orgId: string }) {
  const orgIdNum = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState({
    name: "",
    support_email: "",
    timezone: "",
    logo_url: "",
    portal_subdomain: "",
  });

  const [settings, setSettings] = useState({
    business_hours_definition: "",
    holiday_calendar: "",
  });

  const [retention, setRetention] = useState({
    closed_ticket_retention_months: 36,
    audit_log_retention_months: 24,
  });

  async function load() {
    if (!orgIdNum) return;
    setLoading(true);
    setError(null);
    try {
      const [org, orgSettings, orgRetention] = await Promise.all([
        getOrganisation(orgIdNum),
        getOrganisationSettings(orgIdNum),
        getOrganisationRetention(orgIdNum),
      ]);

      setProfile({
        name: org.name ?? "",
        support_email: org.support_email ?? "",
        timezone: org.timezone ?? "",
        logo_url: org.logo_url ?? "",
        portal_subdomain: org.portal_subdomain ?? "",
      });

      setSettings({
        business_hours_definition: orgSettings?.business_hours_definition ?? "",
        holiday_calendar: orgSettings?.holiday_calendar ?? "",
      });

      setRetention({
        closed_ticket_retention_months:
          orgRetention?.closed_ticket_retention_months ?? 36,
        audit_log_retention_months:
          orgRetention?.audit_log_retention_months ?? 24,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organisation");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdNum]);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingRetention, setSavingRetention] = useState(false);

  async function handleSaveProfile() {
    if (!orgIdNum) return;
    setSavingProfile(true);
    try {
      await updateOrganisation(orgIdNum, {
        name: profile.name,
        support_email: profile.support_email || null,
        timezone: profile.timezone,
        logo_url: profile.logo_url || null,
        portal_subdomain: profile.portal_subdomain || null,
      });
      toast.success("Organisation profile updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveSettings() {
    if (!orgIdNum) return;
    setSavingSettings(true);
    try {
      await updateOrganisationSettings(orgIdNum, {
        business_hours_definition: settings.business_hours_definition || null,
        holiday_calendar: settings.holiday_calendar || null,
      });
      toast.success("Organisation settings updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveRetention() {
    if (!orgIdNum) return;
    setSavingRetention(true);
    try {
      await updateOrganisationRetention(orgIdNum, {
        closed_ticket_retention_months: retention.closed_ticket_retention_months,
        audit_log_retention_months: retention.audit_log_retention_months,
      });
      toast.success("Retention policy updated.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to update retention policy"
      );
    } finally {
      setSavingRetention(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <div className="text-xl font-semibold tracking-tight">Resolve Setup</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Configure tenant profile, business hours and retention.
        </div>
      </div>

      {loading ? (
        <GlassCard className="p-6">
          <Loader className="min-h-[60vh]" label="Loading organisation..." size="sm" />
        </GlassCard>
      ) : null}

      {error ? (
        <GlassCard className="p-6">
          <div className="text-sm text-red-300">{error}</div>
        </GlassCard>
      ) : null}

      {!loading && !error ? (
        <>
          <GlassCard className="p-6">
            <div className="text-lg font-semibold">Organisation Profile</div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">name</span>
                <input
                  value={profile.name}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, name: e.target.value }))
                  }
                  className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  support_email
                </span>
                <input
                  value={profile.support_email}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      support_email: e.target.value,
                    }))
                  }
                  className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">timezone</span>
                <input
                  value={profile.timezone}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, timezone: e.target.value }))
                  }
                  className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">logo_url</span>
                <input
                  value={profile.logo_url}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, logo_url: e.target.value }))
                  }
                  className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                />
              </label>

              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-sm text-muted-foreground">
                  portal_subdomain
                </span>
                <input
                  value={profile.portal_subdomain}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      portal_subdomain: e.target.value,
                    }))
                  }
                  className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
              <button
                type="button"
                onClick={() => void handleSaveProfile()}
                disabled={savingProfile}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {savingProfile ? "Saving..." : "Update Profile"}
              </button>
            </div>
          </GlassCard>

          <div className="mt-5" />

          <GlassCard className="p-6">
            <div className="text-lg font-semibold">Organisation Settings</div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">
                  business_hours_definition (JSON/Text)
                </span>
                <textarea
                  value={settings.business_hours_definition}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      business_hours_definition: e.target.value,
                    }))
                  }
                  rows={7}
                  className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                  placeholder='e.g. { "mon": { "from": "09:00", "to": "18:00" } }'
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">
                  holiday_calendar (JSON/Text)
                </span>
                <textarea
                  value={settings.holiday_calendar}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      holiday_calendar: e.target.value,
                    }))
                  }
                  rows={6}
                  className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                  placeholder='e.g. [{ "date": "2026-01-26", "name": "Republic Day" }]'
                />
              </label>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => void handleSaveSettings()}
                disabled={savingSettings}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {savingSettings ? "Saving..." : "Update Settings"}
              </button>
            </div>
          </GlassCard>

          <div className="mt-5" />

          <GlassCard className="p-6">
            <div className="text-lg font-semibold">Data Retention Policy</div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  closed_ticket_retention_months
                </span>
                <input
                  type="number"
                  value={retention.closed_ticket_retention_months}
                  onChange={(e) =>
                    setRetention((r) => ({
                      ...r,
                      closed_ticket_retention_months: Number(e.target.value),
                    }))
                  }
                  className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  audit_log_retention_months
                </span>
                <input
                  type="number"
                  value={retention.audit_log_retention_months}
                  onChange={(e) =>
                    setRetention((r) => ({
                      ...r,
                      audit_log_retention_months: Number(e.target.value),
                    }))
                  }
                  className="rounded-xl border border-black/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl dark:border-white/10"
                />
              </label>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => void handleSaveRetention()}
                disabled={savingRetention}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {savingRetention ? "Saving..." : "Update Retention"}
              </button>
            </div>
          </GlassCard>
        </>
      ) : null}

    </div>
  );
}

