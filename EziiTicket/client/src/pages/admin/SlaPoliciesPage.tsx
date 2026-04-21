import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { InstantTooltip } from "@components/common/InstantTooltip";
import { useScreenModifyAccess } from "@hooks/useScreenModifyAccess";
import { useAuthStore } from "@store/useAuthStore";
import {
  createSlaPolicy,
  getExternalOrganizations,
  listSlaPolicies,
  listSlaTier1Bounds,
  putSlaTier1Bounds,
  upsertSlaPoliciesBatch,
  updateSlaPolicy,
  type ExternalOrganization,
  type SlaPolicy,
  type SlaTier1BoundRow,
} from "@api/adminApi";
import { Settings, X } from "lucide-react";

type PriorityKey = "P1" | "P2" | "P3" | "P4";
type TierKey = "tier1" | "tier2";
type AccessLevel = "none" | "view" | "edit";

/** Matches server `DEFAULT_TIER1_BOUNDS_FALLBACK` when API has no row yet. */
const FALLBACK_TIER1_BOUNDS: Record<
  PriorityKey,
  { minFirstResponseMins: number; maxFirstResponseMins: number; minResolutionMins: number; maxResolutionMins: number }
> = {
  P1: { minFirstResponseMins: 15, maxFirstResponseMins: 60, minResolutionMins: 120, maxResolutionMins: 480 },
  P2: { minFirstResponseMins: 60, maxFirstResponseMins: 240, minResolutionMins: 240, maxResolutionMins: 2880 },
  P3: { minFirstResponseMins: 120, maxFirstResponseMins: 480, minResolutionMins: 1440, maxResolutionMins: 7200 },
  P4: { minFirstResponseMins: 240, maxFirstResponseMins: 2880, minResolutionMins: 4320, maxResolutionMins: 20160 },
};

const TIER1_DEFINITIONS: Record<PriorityKey, string> = {
  P1: "System-wide outage or data corruption; payroll run or compliance at risk",
  P2: "Major feature broken; significant users impacted; no workaround",
  P3: "Feature impaired; moderate impact; workaround available",
  P4: "Minor issue, cosmetic defect, general query, or enhancement request",
};

const TIER1_CUSTOMER_DEFAULTS: Record<PriorityKey, { firstResponseMins: number; resolutionMins: number }> = {
  P1: { firstResponseMins: 30, resolutionMins: 240 },
  P2: { firstResponseMins: 120, resolutionMins: 1440 },
  P3: { firstResponseMins: 240, resolutionMins: 4320 },
  P4: { firstResponseMins: 1440, resolutionMins: 10080 },
};

/** PRD §3.3.2 — Internal Ezii SLA (L2 / L3 ladder), minutes. */
const TIER2_INTERNAL_PRESETS: Record<PriorityKey, { l2Ack: number; l2Pass: number; l3Ack: number; l3Res: number }> = {
  P1: { l2Ack: 15, l2Pass: 120, l3Ack: 30, l3Res: 240 },
  P2: { l2Ack: 60, l2Pass: 240, l3Ack: 120, l3Res: 1440 },
  P3: { l2Ack: 240, l2Pass: 2880, l3Ack: 1440, l3Res: 4320 },
  P4: { l2Ack: 1440, l2Pass: 7200, l3Ack: 2880, l3Res: 10080 },
};

function toPriority(value: string): PriorityKey {
  if (value === "P1" || value === "P2" || value === "P3" || value === "P4") return value;
  return "P3";
}

function toTier(value: string): TierKey {
  return value === "tier2" ? "tier2" : "tier1";
}

const PRIORITY_ORDER: PriorityKey[] = ["P1", "P2", "P3", "P4"];

const PRIORITY_META: Record<
  PriorityKey,
  { label: string; dotClass: string; badgeClass: string }
> = {
  P1: {
    label: "Critical",
    dotClass: "bg-red-500",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  },
  P2: {
    label: "High",
    dotClass: "bg-orange-500",
    badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  },
  P3: {
    label: "Medium",
    dotClass: "bg-blue-500",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  },
  P4: {
    label: "Low",
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  },
};

function safeParseMeta(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function tier2Resolved(row: SlaPolicy | undefined, p: PriorityKey) {
  const pr = TIER2_INTERNAL_PRESETS[p];
  if (!row) return pr;
  const m = safeParseMeta(row.metadata_json);
  return {
    l2Ack:
      typeof m.l2_acknowledgement_mins === "number" ? (m.l2_acknowledgement_mins as number) : row.first_response_mins,
    l2Pass: typeof m.l2_resolution_pass_mins === "number" ? (m.l2_resolution_pass_mins as number) : pr.l2Pass,
    l3Ack: typeof m.l3_acknowledgement_mins === "number" ? (m.l3_acknowledgement_mins as number) : pr.l3Ack,
    l3Res: typeof m.l3_resolution_mins === "number" ? (m.l3_resolution_mins as number) : row.resolution_mins,
  };
}

function tier1CustomerVisible(row: SlaPolicy | undefined): boolean {
  const m = safeParseMeta(row?.metadata_json);
  if (typeof m.visible_to_customer === "boolean") return m.visible_to_customer;
  return true;
}

function tier1DefinitionLine(row: SlaPolicy | undefined, p: PriorityKey): string {
  const m = safeParseMeta(row?.metadata_json);
  if (typeof m.definition === "string") return m.definition;
  return TIER1_DEFINITIONS[p];
}

function minutesLabel(mins: number) {
  if (!Number.isFinite(mins) || mins < 1) return "-";
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}

function policyMapByPriority(rows: SlaPolicy[], tier: TierKey) {
  const out: Partial<Record<PriorityKey, SlaPolicy>> = {};
  rows
    .filter((r) => toTier(r.tier) === tier)
    .forEach((r) => {
      out[toPriority(r.priority)] = r;
    });
  return out;
}

function boundsMapFromRows(
  rows: SlaTier1BoundRow[] | undefined
): Partial<Record<PriorityKey, (typeof FALLBACK_TIER1_BOUNDS)[PriorityKey]>> {
  const out: Partial<Record<PriorityKey, (typeof FALLBACK_TIER1_BOUNDS)[PriorityKey]>> = {};
  if (!rows?.length) return out;
  for (const r of rows) {
    const p = toPriority(r.priority);
    out[p] = {
      minFirstResponseMins: r.min_first_response_mins,
      maxFirstResponseMins: r.max_first_response_mins,
      minResolutionMins: r.min_resolution_mins,
      maxResolutionMins: r.max_resolution_mins,
    };
  }
  return out;
}

function isEziiSystemAdminUser(user: {
  org_id?: string;
  user_id?: string;
  role_id?: string;
  user_type_id?: string;
  role_name?: string;
} | null): boolean {
  if (!user) return false;
  const rn = String(user.role_name ?? "").toLowerCase().trim();
  return (
    (rn === "admin" || rn === "administrator") &&
    user.org_id === "1" &&
    user.user_id === "1" &&
    user.role_id === "1" &&
    String(user.user_type_id ?? "") === "1"
  );
}

type BoundsDraftRow = {
  minFirstResponseMins: number;
  maxFirstResponseMins: number;
  minResolutionMins: number;
  maxResolutionMins: number;
};

export function SlaPoliciesPage({
  orgId,
  organizationName,
  tier1Access: tier1AccessProp,
  tier2Access: tier2AccessProp,
}: {
  orgId: string;
  organizationName?: string;
  tier1Access?: AccessLevel;
  tier2Access?: AccessLevel;
}) {
  const authUser = useAuthStore((s) => s.user);
  const orgIdNum = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);
  const isSystemAdmin = useMemo(() => isEziiSystemAdminUser(authUser), [authUser]);
  const canModifySlaScreen = useScreenModifyAccess("sla_policies");
  const canEditTier1 = isSystemAdmin || tier1AccessProp === "edit" || canModifySlaScreen;
  const canEditTier2 = isSystemAdmin || tier2AccessProp === "edit" || canModifySlaScreen;
  const canEdit = canEditTier1 || canEditTier2;
  const modifyAccessMessage = "You don't have modify access";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [rowsByOrg, setRowsByOrg] = useState<Record<number, SlaPolicy[]>>({});
  const [boundsByOrg, setBoundsByOrg] = useState<Record<number, SlaTier1BoundRow[]>>({});
  const [searchOrg, setSearchOrg] = useState("");
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  const [globalEditMode, setGlobalEditMode] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [overrideDraft, setOverrideDraft] = useState<
    Record<PriorityKey, { first_response_mins: number; resolution_mins: number; sourceId: number | null }>
  >({
    P1: { first_response_mins: 0, resolution_mins: 0, sourceId: null },
    P2: { first_response_mins: 0, resolution_mins: 0, sourceId: null },
    P3: { first_response_mins: 0, resolution_mins: 0, sourceId: null },
    P4: { first_response_mins: 0, resolution_mins: 0, sourceId: null },
  });
  const [boundsDraft, setBoundsDraft] = useState<Record<PriorityKey, BoundsDraftRow> | null>(null);

  async function load() {
    if (!orgIdNum) return;
    setLoading(true);
    setError(null);
    try {
      if (isSystemAdmin) {
        const orgs = await getExternalOrganizations().catch(() => []);
        const ids = Array.from(
          new Set([1, ...orgs.map((o) => Number(o.id)).filter((id) => Number.isFinite(id))])
        );
        const results = await Promise.all(
          ids.map(async (id) => ({ id, rows: await listSlaPolicies(id).catch(() => [] as SlaPolicy[]) }))
        );
        const boundsResults = await Promise.all(
          ids.map(async (id) => ({ id, rows: await listSlaTier1Bounds(id).catch(() => [] as SlaTier1BoundRow[]) }))
        );
        setExternalOrgs(orgs);
        setRowsByOrg(Object.fromEntries(results.map((r) => [r.id, r.rows])));
        setBoundsByOrg(Object.fromEntries(boundsResults.map((b) => [b.id, b.rows])));
      } else {
        // Non-system-admin users can still have SLA modify access; always load org 1
        // so Global Tier 1/2 tables render persisted global values instead of fallback constants.
        const [own, globalRows, ownBounds, globalBounds] = await Promise.all([
          listSlaPolicies(orgIdNum).catch(() => [] as SlaPolicy[]),
          listSlaPolicies(1).catch(() => [] as SlaPolicy[]),
          listSlaTier1Bounds(orgIdNum).catch(() => [] as SlaTier1BoundRow[]),
          listSlaTier1Bounds(1).catch(() => [] as SlaTier1BoundRow[]),
        ]);
        setRowsByOrg({ [orgIdNum]: own, 1: globalRows });
        setBoundsByOrg({ [orgIdNum]: ownBounds, 1: globalBounds });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load SLA policies");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdNum, isSystemAdmin]);

  const globalRows = useMemo(() => rowsByOrg[1] ?? [], [rowsByOrg]);
  const globalTier1 = useMemo(() => policyMapByPriority(globalRows, "tier1"), [globalRows]);
  const globalTier2 = useMemo(() => policyMapByPriority(globalRows, "tier2"), [globalRows]);
  const [globalTier1Draft, setGlobalTier1Draft] = useState<
    Record<PriorityKey, { first_response_mins: number; resolution_mins: number }>
  >({
    P1: { first_response_mins: TIER1_CUSTOMER_DEFAULTS.P1.firstResponseMins, resolution_mins: TIER1_CUSTOMER_DEFAULTS.P1.resolutionMins },
    P2: { first_response_mins: TIER1_CUSTOMER_DEFAULTS.P2.firstResponseMins, resolution_mins: TIER1_CUSTOMER_DEFAULTS.P2.resolutionMins },
    P3: { first_response_mins: TIER1_CUSTOMER_DEFAULTS.P3.firstResponseMins, resolution_mins: TIER1_CUSTOMER_DEFAULTS.P3.resolutionMins },
    P4: { first_response_mins: TIER1_CUSTOMER_DEFAULTS.P4.firstResponseMins, resolution_mins: TIER1_CUSTOMER_DEFAULTS.P4.resolutionMins },
  });
  const [globalTier2Draft, setGlobalTier2Draft] = useState<
    Record<PriorityKey, { l2Ack: number; l2Pass: number; l3Ack: number; l3Res: number }>
  >({
    P1: { ...TIER2_INTERNAL_PRESETS.P1 },
    P2: { ...TIER2_INTERNAL_PRESETS.P2 },
    P3: { ...TIER2_INTERNAL_PRESETS.P3 },
    P4: { ...TIER2_INTERNAL_PRESETS.P4 },
  });

  useEffect(() => {
    setGlobalTier1Draft({
      P1: {
        first_response_mins: globalTier1.P1?.first_response_mins ?? TIER1_CUSTOMER_DEFAULTS.P1.firstResponseMins,
        resolution_mins: globalTier1.P1?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P1.resolutionMins,
      },
      P2: {
        first_response_mins: globalTier1.P2?.first_response_mins ?? TIER1_CUSTOMER_DEFAULTS.P2.firstResponseMins,
        resolution_mins: globalTier1.P2?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P2.resolutionMins,
      },
      P3: {
        first_response_mins: globalTier1.P3?.first_response_mins ?? TIER1_CUSTOMER_DEFAULTS.P3.firstResponseMins,
        resolution_mins: globalTier1.P3?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P3.resolutionMins,
      },
      P4: {
        first_response_mins: globalTier1.P4?.first_response_mins ?? TIER1_CUSTOMER_DEFAULTS.P4.firstResponseMins,
        resolution_mins: globalTier1.P4?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P4.resolutionMins,
      },
    });
    setGlobalTier2Draft({
      P1: tier2Resolved(globalTier2.P1, "P1"),
      P2: tier2Resolved(globalTier2.P2, "P2"),
      P3: tier2Resolved(globalTier2.P3, "P3"),
      P4: tier2Resolved(globalTier2.P4, "P4"),
    });
  }, [globalTier1, globalTier2]);

  const overrideOrgCards = useMemo(() => {
    const ownOrgLabel = organizationName?.trim() || `Organization ${orgIdNum ?? "-"}`;
    const source = isSystemAdmin
      ? externalOrgs.map((o) => ({ id: Number(o.id), name: o.organization_name }))
      : [{ id: orgIdNum ?? 0, name: ownOrgLabel }];
    const q = searchOrg.trim().toLowerCase();
    return source
      .filter((o) => Number.isFinite(o.id) && o.id > 0)
      .filter((o) => (q ? o.name.toLowerCase().includes(q) : true))
      .map((o) => {
        const rows = rowsByOrg[o.id] ?? [];
        const tier1 = policyMapByPriority(rows, "tier1");
        const bm = boundsMapFromRows(boundsByOrg[o.id]);
        const compliant = PRIORITY_ORDER.every((p) => {
          const row = tier1[p];
          if (!row) return true;
          const bounds = bm[p] ?? FALLBACK_TIER1_BOUNDS[p];
          const t2 = tier2Resolved(globalTier2[p], p);
          const inRange =
            row.first_response_mins >= bounds.minFirstResponseMins &&
            row.first_response_mins <= bounds.maxFirstResponseMins &&
            row.resolution_mins >= bounds.minResolutionMins &&
            row.resolution_mins <= bounds.maxResolutionMins;
          const respectsInternal =
            row.first_response_mins >= t2.l2Ack && row.resolution_mins >= t2.l3Res;
          return inRange && respectsInternal;
        });
        return { ...o, compliant };
      });
  }, [externalOrgs, isSystemAdmin, orgIdNum, organizationName, rowsByOrg, boundsByOrg, searchOrg, globalTier2]);

  const editingOrgName =
    overrideOrgCards.find((o) => o.id === editingOrgId)?.name ??
    externalOrgs.find((o) => Number(o.id) === editingOrgId)?.organization_name ??
    (editingOrgId ? `Organization ${editingOrgId}` : "Organization");

  function openOverrideEditor(orgIdValue: number) {
    const orgRows = rowsByOrg[orgIdValue] ?? [];
    const tier1 = policyMapByPriority(orgRows, "tier1");
    const bm = boundsMapFromRows(boundsByOrg[orgIdValue]);
    setEditingOrgId(orgIdValue);
    setBoundsDraft({
      P1: { ...(bm.P1 ?? FALLBACK_TIER1_BOUNDS.P1) },
      P2: { ...(bm.P2 ?? FALLBACK_TIER1_BOUNDS.P2) },
      P3: { ...(bm.P3 ?? FALLBACK_TIER1_BOUNDS.P3) },
      P4: { ...(bm.P4 ?? FALLBACK_TIER1_BOUNDS.P4) },
    });
    setOverrideDraft({
      P1: {
        first_response_mins:
          tier1.P1?.first_response_mins ??
          globalTier1.P1?.first_response_mins ??
          TIER1_CUSTOMER_DEFAULTS.P1.firstResponseMins,
        resolution_mins:
          tier1.P1?.resolution_mins ?? globalTier1.P1?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P1.resolutionMins,
        sourceId: tier1.P1?.id ?? null,
      },
      P2: {
        first_response_mins:
          tier1.P2?.first_response_mins ??
          globalTier1.P2?.first_response_mins ??
          TIER1_CUSTOMER_DEFAULTS.P2.firstResponseMins,
        resolution_mins:
          tier1.P2?.resolution_mins ?? globalTier1.P2?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P2.resolutionMins,
        sourceId: tier1.P2?.id ?? null,
      },
      P3: {
        first_response_mins:
          tier1.P3?.first_response_mins ??
          globalTier1.P3?.first_response_mins ??
          TIER1_CUSTOMER_DEFAULTS.P3.firstResponseMins,
        resolution_mins:
          tier1.P3?.resolution_mins ?? globalTier1.P3?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P3.resolutionMins,
        sourceId: tier1.P3?.id ?? null,
      },
      P4: {
        first_response_mins:
          tier1.P4?.first_response_mins ??
          globalTier1.P4?.first_response_mins ??
          TIER1_CUSTOMER_DEFAULTS.P4.firstResponseMins,
        resolution_mins:
          tier1.P4?.resolution_mins ?? globalTier1.P4?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P4.resolutionMins,
        sourceId: tier1.P4?.id ?? null,
      },
    });
  }

  function resetOverrideDefaults() {
    setOverrideDraft((prev) => ({
      ...prev,
      P1: {
        ...prev.P1,
        first_response_mins: globalTier1.P1?.first_response_mins ?? TIER1_CUSTOMER_DEFAULTS.P1.firstResponseMins,
        resolution_mins: globalTier1.P1?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P1.resolutionMins,
      },
      P2: {
        ...prev.P2,
        first_response_mins: globalTier1.P2?.first_response_mins ?? TIER1_CUSTOMER_DEFAULTS.P2.firstResponseMins,
        resolution_mins: globalTier1.P2?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P2.resolutionMins,
      },
      P3: {
        ...prev.P3,
        first_response_mins: globalTier1.P3?.first_response_mins ?? TIER1_CUSTOMER_DEFAULTS.P3.firstResponseMins,
        resolution_mins: globalTier1.P3?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P3.resolutionMins,
      },
      P4: {
        ...prev.P4,
        first_response_mins: globalTier1.P4?.first_response_mins ?? TIER1_CUSTOMER_DEFAULTS.P4.firstResponseMins,
        resolution_mins: globalTier1.P4?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS.P4.resolutionMins,
      },
    }));
  }

  async function saveOverride() {
    if (!editingOrgId || !boundsDraft) return;
    if (!canEdit) return toast.error("You do not have modify access for SLA settings");
    setSavingOverride(true);
    try {
      await putSlaTier1Bounds(
        editingOrgId,
        PRIORITY_ORDER.map((p) => ({
          priority: p,
          min_first_response_mins: boundsDraft[p].minFirstResponseMins,
          max_first_response_mins: boundsDraft[p].maxFirstResponseMins,
          min_resolution_mins: boundsDraft[p].minResolutionMins,
          max_resolution_mins: boundsDraft[p].maxResolutionMins,
        }))
      );
      for (const p of PRIORITY_ORDER) {
        const d = overrideDraft[p];
        if (!d) continue;
        if (d.sourceId) {
          await updateSlaPolicy(d.sourceId, {
            first_response_mins: d.first_response_mins,
            resolution_mins: d.resolution_mins,
            warning_percent: 75,
            is_active: true,
          });
        } else {
          await createSlaPolicy({
            organisation_id: editingOrgId,
            name: `${editingOrgName} ${p} Tier1`,
            tier: "tier1",
            priority: p,
            first_response_mins: d.first_response_mins,
            resolution_mins: d.resolution_mins,
            warning_percent: 75,
            is_active: true,
          });
        }
      }
      toast.success("Overrides saved.");
      setEditingOrgId(null);
      setBoundsDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save overrides");
    } finally {
      setSavingOverride(false);
    }
  }

  async function saveGlobalChangesForAllOrgs() {
    if (!canEdit) return toast.error("You do not have modify access for SLA settings");
    setSavingGlobal(true);
    try {
      const orgs = await getExternalOrganizations().catch(() => []);
      const targetOrgIds = Array.from(
        new Set([1, ...orgs.map((o) => Number(o.id)).filter((id) => Number.isFinite(id) && id > 0)])
      );
      for (const organisation_id of targetOrgIds) {
        const orgRows = rowsByOrg[organisation_id] ?? [];
        const orgTier1 = policyMapByPriority(orgRows, "tier1");
        const orgTier2 = policyMapByPriority(orgRows, "tier2");
        const policiesPayload: Array<{
          tier: "tier1" | "tier2";
          priority: PriorityKey;
          name: string;
          first_response_mins: number;
          resolution_mins: number;
          warning_percent: number;
          is_active: boolean;
          metadata_json: string;
        }> = [];
        for (const p of PRIORITY_ORDER) {
          if (canEditTier1) {
            const existingTier1 = orgTier1[p];
            const metadata = safeParseMeta(existingTier1?.metadata_json);
            const metadata_json = JSON.stringify({
              ...metadata,
              definition: tier1DefinitionLine(globalTier1[p], p),
              visible_to_customer: tier1CustomerVisible(globalTier1[p]),
            });
            policiesPayload.push({
              tier: "tier1",
              priority: p,
              name: existingTier1?.name ?? `Org ${organisation_id} ${p} Tier1`,
              first_response_mins: globalTier1Draft[p].first_response_mins,
              resolution_mins: globalTier1Draft[p].resolution_mins,
              warning_percent: existingTier1?.warning_percent ?? 75,
              is_active: true,
              metadata_json,
            });
          }
          if (canEditTier2) {
            const existingTier2 = orgTier2[p];
            const metadata = safeParseMeta(existingTier2?.metadata_json);
            const draft = globalTier2Draft[p];
            const metadata_json = JSON.stringify({
              ...metadata,
              l2_acknowledgement_mins: draft.l2Ack,
              l2_resolution_pass_mins: draft.l2Pass,
              l3_acknowledgement_mins: draft.l3Ack,
              l3_resolution_mins: draft.l3Res,
            });
            policiesPayload.push({
              tier: "tier2",
              priority: p,
              name: existingTier2?.name ?? `Org ${organisation_id} ${p} Tier2`,
              first_response_mins: draft.l2Ack,
              resolution_mins: draft.l3Res,
              warning_percent: existingTier2?.warning_percent ?? 75,
              is_active: true,
              metadata_json,
            });
          }
        }
        if (policiesPayload.length) {
          await upsertSlaPoliciesBatch(organisation_id, policiesPayload);
        }
      }
      toast.success("Tier 1 and Tier 2 SLA updates applied to all organizations.");
      setGlobalEditMode(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save global SLA changes");
    } finally {
      setSavingGlobal(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1300px] space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Policy Management</div>
          <h1 className="text-xl font-semibold text-[#111827] dark:text-slate-100">Global SLA Standards</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setGlobalEditMode((prev) => !prev)}
                className="rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-[#114d87] dark:border-white/15 dark:bg-white/10 dark:text-blue-200"
              >
                {globalEditMode ? "Cancel Edit" : "Edit Tier 1/2"}
              </button>
              {globalEditMode ? (
                <button
                  type="button"
                  onClick={() => void saveGlobalChangesForAllOrgs()}
                  disabled={savingGlobal}
                  className="rounded-lg bg-[#1E88E5] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                >
                  {savingGlobal ? "Saving..." : "Save for All Orgs"}
                </button>
              ) : null}
            </>
          ) : null}
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          Last Updated: {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {loading ? (
        <GlassCard className="p-6">
          <Loader className="min-h-[40vh]" label="Loading SLA policies..." size="sm" />
        </GlassCard>
      ) : null}

      {error ? (
        <GlassCard className="p-6">
          <div className="text-xs text-red-600 dark:text-red-300">{error}</div>
        </GlassCard>
      ) : null}

      {!loading && !error ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <GlassCard className="border-black/10 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[#111827] dark:text-slate-100">
                  Tier 1 — Customer-facing SLA (configurable)
                </div>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                  Default global
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-black/10 text-[10px] uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400">
                      <th className="py-2 pr-2">Priority</th>
                      <th className="py-2 pr-2">Definition</th>
                      <th className="py-2 pr-2">L1 first response</th>
                      <th className="py-2 pr-2">L1 resolution</th>
                      <th className="py-2">Visible to customer?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRIORITY_ORDER.map((p) => (
                      <tr key={p} className="border-b border-black/5 align-top dark:border-white/5">
                        <td className="py-2 pr-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITY_META[p].badgeClass}`}>
                            {p} — {PRIORITY_META[p].label}
                          </span>
                        </td>
                        <td className="max-w-[220px] py-2 pr-2 text-slate-600 dark:text-slate-300">
                          {tier1DefinitionLine(globalTier1[p], p)}
                        </td>
                        <td className="py-2 pr-2">
                          {globalEditMode && canEditTier1 ? (
                            <input
                              type="number"
                              value={globalTier1Draft[p].first_response_mins}
                              onChange={(e) =>
                                setGlobalTier1Draft((prev) => ({
                                  ...prev,
                                  [p]: { ...prev[p], first_response_mins: Number(e.target.value) },
                                }))
                              }
                              className="w-24 rounded-lg border border-black/10 bg-white/90 px-2 py-1 text-xs dark:border-white/15 dark:bg-white/10"
                            />
                          ) : (
                            minutesLabel(
                              globalTier1[p]?.first_response_mins ?? TIER1_CUSTOMER_DEFAULTS[p].firstResponseMins
                            )
                          )}
                        </td>
                        <td className="py-2 pr-2 font-semibold text-[#111827] dark:text-slate-100">
                          {globalEditMode && canEditTier1 ? (
                            <input
                              type="number"
                              value={globalTier1Draft[p].resolution_mins}
                              onChange={(e) =>
                                setGlobalTier1Draft((prev) => ({
                                  ...prev,
                                  [p]: { ...prev[p], resolution_mins: Number(e.target.value) },
                                }))
                              }
                              className="w-24 rounded-lg border border-black/10 bg-white/90 px-2 py-1 text-xs dark:border-white/15 dark:bg-white/10"
                            />
                          ) : (
                            minutesLabel(
                              globalTier1[p]?.resolution_mins ?? TIER1_CUSTOMER_DEFAULTS[p].resolutionMins
                            )
                          )}
                        </td>
                        <td className="py-2">{tier1CustomerVisible(globalTier1[p]) ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>

            <GlassCard className="border-black/10 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[#111827] dark:text-slate-100">
                  Tier 2 — Internal Ezii SLA (fixed targets)
                </div>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
                  Global editable (screen access)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-black/10 text-[10px] uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400">
                      <th className="py-2 pr-2">Priority</th>
                      <th className="py-2 pr-2">L2 acknowledgement</th>
                      <th className="py-2 pr-2">L2 resolution / pass to L3</th>
                      <th className="py-2 pr-2">L3 acknowledgement</th>
                      <th className="py-2">L3 resolution target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRIORITY_ORDER.map((p) => {
                      const t = tier2Resolved(globalTier2[p], p);
                      return (
                        <tr key={p} className="border-b border-black/5 dark:border-white/5">
                          <td className="py-2 pr-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITY_META[p].badgeClass}`}>
                              {p} — {PRIORITY_META[p].label}
                            </span>
                          </td>
                          <td className="py-2 pr-2">
                            {globalEditMode && canEditTier2 ? (
                              <input
                                type="number"
                                value={globalTier2Draft[p].l2Ack}
                                onChange={(e) =>
                                  setGlobalTier2Draft((prev) => ({
                                    ...prev,
                                    [p]: { ...prev[p], l2Ack: Number(e.target.value) },
                                  }))
                                }
                                className="w-20 rounded-lg border border-black/10 bg-white/90 px-2 py-1 text-xs dark:border-white/15 dark:bg-white/10"
                              />
                            ) : (
                              minutesLabel(t.l2Ack)
                            )}
                          </td>
                          <td className="py-2 pr-2">
                            {globalEditMode && canEditTier2 ? (
                              <input
                                type="number"
                                value={globalTier2Draft[p].l2Pass}
                                onChange={(e) =>
                                  setGlobalTier2Draft((prev) => ({
                                    ...prev,
                                    [p]: { ...prev[p], l2Pass: Number(e.target.value) },
                                  }))
                                }
                                className="w-20 rounded-lg border border-black/10 bg-white/90 px-2 py-1 text-xs dark:border-white/15 dark:bg-white/10"
                              />
                            ) : (
                              minutesLabel(t.l2Pass)
                            )}
                          </td>
                          <td className="py-2 pr-2">
                            {globalEditMode && canEditTier2 ? (
                              <input
                                type="number"
                                value={globalTier2Draft[p].l3Ack}
                                onChange={(e) =>
                                  setGlobalTier2Draft((prev) => ({
                                    ...prev,
                                    [p]: { ...prev[p], l3Ack: Number(e.target.value) },
                                  }))
                                }
                                className="w-20 rounded-lg border border-black/10 bg-white/90 px-2 py-1 text-xs dark:border-white/15 dark:bg-white/10"
                              />
                            ) : (
                              minutesLabel(t.l3Ack)
                            )}
                          </td>
                          <td className="py-2 font-semibold text-[#111827] dark:text-slate-100">
                            {globalEditMode && canEditTier2 ? (
                              <input
                                type="number"
                                value={globalTier2Draft[p].l3Res}
                                onChange={(e) =>
                                  setGlobalTier2Draft((prev) => ({
                                    ...prev,
                                    [p]: { ...prev[p], l3Res: Number(e.target.value) },
                                  }))
                                }
                                className="w-20 rounded-lg border border-black/10 bg-white/90 px-2 py-1 text-xs dark:border-white/15 dark:bg-white/10"
                              />
                            ) : (
                              minutesLabel(t.l3Res)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>

            <GlassCard className="border-black/10 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[#111827] dark:text-slate-100">Organization Overrides</div>
                <input
                  value={searchOrg}
                  onChange={(e) => setSearchOrg(e.target.value)}
                  placeholder="Filter orgs..."
                  className="w-[180px] rounded-lg border border-black/10 bg-white/85 px-3 py-1.5 text-xs dark:border-white/15 dark:bg-white/10"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {overrideOrgCards.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => openOverrideEditor(org.id)}
                    className="flex items-center justify-between rounded-xl border border-black/10 bg-white/70 p-3 text-left hover:bg-white/90 dark:border-white/15 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1E88E5]/12 text-xs font-bold text-[#1E88E5]">
                        {org.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[#111827] dark:text-slate-100">{org.name}</div>
                        <div className={`text-[10px] font-bold uppercase ${org.compliant ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
                          {org.compliant ? "Compliant" : "Risk"}
                        </div>
                      </div>
                    </div>
                    <Settings className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                ))}
                {!overrideOrgCards.length ? (
                  <div className="text-xs text-slate-500 dark:text-slate-300">No organizations found.</div>
                ) : null}
              </div>
            </GlassCard>
          </div>

        </div>
      ) : null}

      {editingOrgId && boundsDraft && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="max-h-[95vh] w-full max-w-6xl overflow-y-auto overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div className="text-base font-semibold text-[#111827] dark:text-slate-100">{editingOrgName} Override</div>
                <button type="button" onClick={() => { setEditingOrgId(null); setBoundsDraft(null); }} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[2fr]">
                <div className="space-y-4">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-base font-semibold text-[#115ca8] dark:text-blue-300">Editable Tier 1 targets</div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={resetOverrideDefaults} className="rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold dark:border-white/15 dark:bg-white/10">Reset to global defaults</button>
                        <InstantTooltip disabled={!canEdit} message={modifyAccessMessage}>
                          <button type="button" onClick={() => void saveOverride()} disabled={savingOverride || !canEdit} className="rounded-lg bg-[#1E88E5] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{savingOverride ? "Saving..." : "Save"}</button>
                        </InstantTooltip>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-black/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]">
                      <table className="w-full min-w-[760px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-black/10 text-[10px] uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400">
                            <th className="px-4 py-3">Priority</th>
                            <th className="px-4 py-3">L1 first response (mins)</th>
                            <th className="px-4 py-3">L1 resolution (mins)</th>
                            <th className="px-4 py-3">Compliance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {PRIORITY_ORDER.map((p) => {
                            const d = overrideDraft[p];
                            const bounds = boundsDraft[p] ?? FALLBACK_TIER1_BOUNDS[p];
                            const t2 = tier2Resolved(globalTier2[p], p);
                            const inRange =
                              d.first_response_mins >= bounds.minFirstResponseMins &&
                              d.first_response_mins <= bounds.maxFirstResponseMins &&
                              d.resolution_mins >= bounds.minResolutionMins &&
                              d.resolution_mins <= bounds.maxResolutionMins;
                            const respectsInternal =
                              d.first_response_mins >= t2.l2Ack && d.resolution_mins >= t2.l3Res;
                            const ok = inRange && respectsInternal;
                            return (
                              <tr key={p} className="border-b border-black/5 dark:border-white/5">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full ${PRIORITY_META[p].dotClass}`} />
                                    <div className="font-semibold text-[#114d87] dark:text-blue-300">{p} - {PRIORITY_META[p].label}</div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      value={d.first_response_mins}
                                      onChange={(e) => setOverrideDraft((prev) => ({ ...prev, [p]: { ...prev[p], first_response_mins: Number(e.target.value) } }))}
                                      className="w-24 rounded-lg border border-black/10 bg-white/90 px-2 py-1.5 text-xs dark:border-white/15 dark:bg-white/10"
                                    />
                                    <span className="text-[10px] font-bold uppercase text-slate-500">mins</span>
                                  </div>
                                  <div className="mt-1 text-[10px] italic text-slate-500">Allowed {bounds.minFirstResponseMins}–{bounds.maxFirstResponseMins}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      value={d.resolution_mins}
                                      onChange={(e) => setOverrideDraft((prev) => ({ ...prev, [p]: { ...prev[p], resolution_mins: Number(e.target.value) } }))}
                                      className={`w-24 rounded-lg border px-2 py-1.5 text-xs dark:bg-white/10 ${ok ? "border-black/10 bg-white/90 dark:border-white/15" : "border-red-400 bg-red-50 dark:border-red-400/50 dark:bg-red-500/10"}`}
                                    />
                                    <span className="text-[10px] font-bold uppercase text-slate-500">mins</span>
                                  </div>
                                  <div className="mt-1 text-[10px] italic text-slate-500">Allowed {bounds.minResolutionMins}–{bounds.maxResolutionMins}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"}`}>
                                    {ok ? "OK" : "Violates band / internal floor"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Tier 1 allowed min/max (this org)</div>
                    <p className="mb-3 text-[10px] text-slate-500 dark:text-slate-400">System Admin adjusts valid ranges per customer organization. Targets above must fall within these bands.</p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-[10px]">
                        <thead>
                          <tr className="border-b border-black/10 text-[9px] uppercase tracking-wide text-slate-500 dark:border-white/10">
                            <th className="py-2 pr-2">Pri</th>
                            <th className="py-2 pr-2">Min FR</th>
                            <th className="py-2 pr-2">Max FR</th>
                            <th className="py-2 pr-2">Min res</th>
                            <th className="py-2">Max res</th>
                          </tr>
                        </thead>
                        <tbody>
                          {PRIORITY_ORDER.map((p) => (
                            <tr key={p} className="border-b border-black/5 dark:border-white/5">
                              <td className="py-2 pr-2 font-semibold">{p}</td>
                              {(["minFirstResponseMins", "maxFirstResponseMins", "minResolutionMins", "maxResolutionMins"] as const).map((key) => (
                                <td key={key} className="py-2 pr-2">
                                  <input
                                    type="number"
                                    value={boundsDraft[p][key]}
                                    onChange={(e) =>
                                      setBoundsDraft((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              [p]: { ...prev[p], [key]: Number(e.target.value) },
                                            }
                                          : prev
                                      )
                                    }
                                    className="w-20 rounded border border-black/10 bg-white/90 px-1.5 py-1 dark:border-white/15 dark:bg-white/10"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        ) : null}
    </div>
  );
}
