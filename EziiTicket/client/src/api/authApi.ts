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

export type AuthMePermissionsData = {
  role_id: string | null;
  role_name: string | null;
  /** All roles assigned to the user for this org (merge order matches server). Used for shell routing when primary row is not the elevated role. */
  access_roles?: Array<{ role_id: string; role_name: string }>;
  permissions_json: {
    screen_access?: Record<string, { view: boolean; modify: boolean }>;
    actions?: Record<string, boolean>;
    [key: string]: unknown;
  };
  support_level?: { support_level_id: string; support_level_name: string } | null;
};

export function getAuthMePermissions() {
  return http<{ ok: boolean; data: AuthMePermissionsData }>("/auth/me/permissions").then((r) => r.data);
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

  const req = http<{ ok: boolean; user: unknown }>("/auth/me")
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

const authMeCache = new Map<string, { ts: number; value: { ok: boolean; user: unknown } }>();
const authMeInFlight = new Map<string, Promise<{ ok: boolean; user: unknown }>>();

