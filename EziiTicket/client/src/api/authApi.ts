import { http } from "./httpClient";

export type AuthLoginResponse = {
  ok: boolean;
  token: string;
  user: unknown;
};

export function login(token: string) {
  return http<AuthLoginResponse>(`/auth/login/${encodeURIComponent(token)}`);
}

export function loginByLink(_orgId: string, token: string) {
  return login(token);
}

export function loginByToken(token: string) {
  return login(token);
}

export type AuthMeResponse = {
  ok: boolean;
  user: unknown;
  /** From `organisations.is_ngo` for the JWT org — drives NGO theme. */
  is_ngo?: boolean;
};

export type AuthMePermissionsData = {
  role_id: string | null;
  role_name: string | null;
  /** All roles assigned to the user for this org (merge order matches server). Used for shell routing when primary row is not system_admin. */
  access_roles?: Array<{ role_id: string; role_name: string }>;
  permissions_json: {
    screen_access?: Record<string, { view: boolean; modify: boolean }>;
    actions?: Record<string, boolean>;
    [key: string]: unknown;
  };
  support_level?: { support_level_id: string; support_level_name: string } | null;
};

export function getAuthMePermissions() {
  const key = "auth:me:permissions";
  const now = Date.now();
  const cached = authMePermissionsCache.get(key);
  if (cached && now - cached.ts < 3000) {
    return Promise.resolve(cached.value);
  }
  const inflight = authMePermissionsInFlight.get(key);
  if (inflight) return inflight;

  const req = http<{ ok: boolean; data: AuthMePermissionsData }>("/auth/me/permissions")
    .then((r) => {
      authMePermissionsCache.set(key, { ts: Date.now(), value: r.data });
      return r.data;
    })
    .finally(() => {
      authMePermissionsInFlight.delete(key);
    });

  authMePermissionsInFlight.set(key, req);
  return req;
}

export function clearAuthMeCache() {
  authMeCache.clear();
  authMeInFlight.clear();
  authMePermissionsCache.clear();
  authMePermissionsInFlight.clear();
}

export function authMe() {
  const key = "auth:me";
  const now = Date.now();
  const cached = authMeCache.get(key);
  if (cached && now - cached.ts < 3000) {
    return Promise.resolve(cached.value);
  }
  const inflight = authMeInFlight.get(key);
  if (inflight) return inflight;

  const req = http<AuthMeResponse>("/auth/me")
    .then((res) => {
      authMeCache.set(key, { ts: Date.now(), value: res });
      return res;
    })
    .finally(() => {
      authMeInFlight.delete(key);
    });

  authMeInFlight.set(key, req);
  return req;
}

const authMeCache = new Map<string, { ts: number; value: AuthMeResponse }>();
const authMeInFlight = new Map<string, Promise<AuthMeResponse>>();
const authMePermissionsCache = new Map<string, { ts: number; value: AuthMePermissionsData }>();
const authMePermissionsInFlight = new Map<string, Promise<AuthMePermissionsData>>();

export type SyncClientProductsData =
  | {
      mode: "reports_all_orgs";
      organisations_processed: number;
      product_updates: number;
      ngo_updates: number;
      is_ngo: boolean;
    }
  | {
      mode: "organization_current_org";
      organisation_id: number;
      product_updates: number;
      ngo_updated: boolean;
      is_ngo: boolean;
    };

/** Single sync: server picks reports (system admin) vs organization+token (others). */
export function syncClientProductsFromExternal() {
  return http<{ ok: boolean; data: SyncClientProductsData }>("/auth/sync-client-products", {
    method: "POST",
  }).then((r) => r.data);
}
