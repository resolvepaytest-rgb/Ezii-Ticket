/**
 * External HR / org directory API (Resolve worker master, attributes, etc.).
 * Base URL from env — never hardcode hostnames in business logic.
 */
export function getExternalOrgApiBaseUrl(): string {
  const raw = process.env.EXTERNAL_API_URL;
  if (raw == null || String(raw).trim() === "") {
    throw new Error("EXTERNAL_API_URL is not configured");
  }
  return String(raw).replace(/\/+$/, "");
}

/** Paths are relative to EXTERNAL_API_URL (e.g. "/organization/attribute-list"). */
export const EXTERNAL_ORG_PATHS = {
  workerTypeList: "/organization/customer/worker-type-list",
  reportingManagerReportees: (userId: number | string) =>
    `/organization/reporting-manager/${encodeURIComponent(String(userId))}/reportees`,
  attributeList: "/organization/attribute-list",
  attributeDetails: (attributeId: string) => `/organization/attribute-details/${encodeURIComponent(attributeId)}`,
  /** GET, no auth — per-org product email routing (`is_ticket`, `is_leave`, …). */
  emailStatus: (organisationId: number | string) =>
    `/organization/email-status/${encodeURIComponent(String(organisationId))}`,
  /** GET, no auth — all orgs’ product flags (Resolve reports). */
  reportsClientProducts: "/reports/get-client-products",
  /** GET, Bearer required — current org’s product flags. */
  organizationClientProducts: "/organization/get-client-products",
} as const;

/** Base URL for optional callers (e.g. notifications); returns null if unset. */
export function getExternalOrgApiBaseUrlOptional(): string | null {
  const raw = process.env.EXTERNAL_API_URL;
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).replace(/\/+$/, "");
}
