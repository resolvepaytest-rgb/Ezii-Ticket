import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { EziiJwtClaims } from "../types/auth.js";

type JwtDecodeResult = {
  ok: true;
  token: string;
  claims: EziiJwtClaims;
};

type JwtDecodeError = {
  ok: false;
  status: 401 | 500;
  error: string;
};

function isClaimsShape(x: unknown): x is Partial<EziiJwtClaims> {
  return !!x && typeof x === "object";
}

function toClaimsOrError(decoded: unknown): JwtDecodeResult | JwtDecodeError {
  if (!isClaimsShape(decoded)) return { ok: false, status: 401, error: "Invalid token" };
  const c = decoded as Partial<EziiJwtClaims>;
  if (!c.org_id || !c.user_id) return { ok: false, status: 401, error: "Invalid token" };
  return { ok: true, token: "", claims: c as EziiJwtClaims };
}

export function decodeOrVerifyJwt(token: string): JwtDecodeResult | JwtDecodeError {
  try {
    if (env.nodeEnv === "development") {
      if (token === "dev-token") {
        return {
          ok: true,
          token,
          claims: {
            org_id: "13",
            user_id: "12345",
            role_id: "admin",
            user_type_id: "1",
            role_name: "Administrator",
          },
        };
      }

      const decoded = jwt.decode(token);
      const shaped = toClaimsOrError(decoded);
      return shaped.ok ? { ...shaped, token } : shaped;
    }

    if (!env.jwtSecret) {
      return { ok: false, status: 500, error: "JWT_SECRET not configured" };
    }

    const decoded = jwt.verify(token, env.jwtSecret, {
      issuer: env.jwtIssuer || undefined,
      audience: env.jwtAudience || undefined,
    });

    const shaped = toClaimsOrError(decoded);
    return shaped.ok ? { ...shaped, token } : shaped;
  } catch (err) {
    return { ok: false, status: 401, error: (err as Error).message };
  }
}

