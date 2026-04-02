import { env } from "../../config/env.js";
import { EXTERNAL_ORG_PATHS, getExternalOrgApiBaseUrlOptional } from "../../config/externalOrgApi.js";

/** Mirrors the external `/organization/email-status/:orgId` `data` payload. */
export type OrgEmailStatusData = {
  is_attendance?: boolean;
  is_leave?: boolean;
  is_expense?: boolean;
  is_ngo?: boolean;
  is_payroll?: boolean;
  /** Present when the platform exposes ticket routing for this org. */
  is_ticket?: boolean;
};

export type OrgEmailProduct =
  | "ticket"
  | "attendance"
  | "leave"
  | "expense"
  | "ngo"
  | "payroll";

const PRODUCT_TO_FLAG: Record<OrgEmailProduct, keyof OrgEmailStatusData> = {
  ticket: "is_ticket",
  attendance: "is_attendance",
  leave: "is_leave",
  expense: "is_expense",
  ngo: "is_ngo",
  payroll: "is_payroll",
};

const STATUS_CACHE_TTL_MS = 60_000;
const statusCache = new Map<number, { at: number; data: OrgEmailStatusData | null }>();

type EmailStatusApiBody = {
  data?: OrgEmailStatusData;
};

/**
 * When the external API says `is_* === false`, the product is not “live” for real inboxes:
 * send to the sandbox address instead. When `true`, or the flag is missing/undefined, use the
 * intended recipient (missing `is_ticket` keeps current behaviour until the API adds it).
 */
export function isProductLiveForRealEmail(data: OrgEmailStatusData, product: OrgEmailProduct): boolean {
  const key = PRODUCT_TO_FLAG[product];
  return data[key] !== false;
}

async function fetchOrgEmailStatusUncached(organisationId: number): Promise<OrgEmailStatusData | null> {
  const base = getExternalOrgApiBaseUrlOptional();
  if (!base) {
    console.warn(
      "[notifications] EXTERNAL_API_URL not set; cannot load org email-status — outbound mail will not be sent"
    );
    return null;
  }
  const url = `${base}${EXTERNAL_ORG_PATHS.emailStatus(organisationId)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(
        `[notifications] org email-status HTTP ${res.status} for org ${organisationId} — not sending email`
      );
      return null;
    }
    const json = (await res.json()) as EmailStatusApiBody;
    const data = json?.data;
    if (!data || typeof data !== "object") {
      console.warn(
        `[notifications] org email-status missing or invalid data for org ${organisationId} — not sending email`
      );
      return null;
    }
    return data as OrgEmailStatusData;
  } catch (err) {
    console.error(`[notifications] org email-status fetch failed for org ${organisationId} — not sending email`, err);
    return null;
  }
}

export async function getOrganizationEmailStatus(organisationId: number): Promise<OrgEmailStatusData | null> {
  const now = Date.now();
  const hit = statusCache.get(organisationId);
  if (hit && now - hit.at < STATUS_CACHE_TTL_MS) return hit.data;
  const data = await fetchOrgEmailStatusUncached(organisationId);
  statusCache.set(organisationId, { at: now, data });
  return data;
}

export type ResolveNotificationRecipientResult =
  | { ok: true; to: string }
  | { ok: false; reason: "email_status_unavailable" | "no_recipient" };

/**
 * Resolves the SMTP `to` address: sandbox when the org’s product flag is explicitly `false`,
 * otherwise the intended address. If the email-status API cannot be loaded, returns `ok: false`
 * so the caller must not send mail.
 */
export async function resolveNotificationRecipientEmail(args: {
  organisationId: number;
  intendedTo: string;
  product: OrgEmailProduct;
}): Promise<ResolveNotificationRecipientResult> {
  const intended = String(args.intendedTo ?? "").trim();
  if (!intended) return { ok: false, reason: "no_recipient" };

  const status = await getOrganizationEmailStatus(args.organisationId);
  if (!status) return { ok: false, reason: "email_status_unavailable" };

  if (isProductLiveForRealEmail(status, args.product)) return { ok: true, to: intended };
  return { ok: true, to: env.notificationSandboxEmail };
}
