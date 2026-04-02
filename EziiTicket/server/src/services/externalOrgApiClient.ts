import { getExternalOrgApiBaseUrl } from "../config/externalOrgApi.js";

/**
 * Server-side GET to external org API using the same Bearer token as the incoming admin request.
 */
export async function fetchExternalOrgGet(
  path: string,
  authorizationHeader: string | undefined
): Promise<{ status: number; json: unknown }> {
  const base = getExternalOrgApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
      Accept: "application/json",
    },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
