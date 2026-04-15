import type { NextFunction, Request, Response } from "express";
import { decodeOrVerifyJwt } from "../auth/jwt.js";
import type { EziiJwtClaims } from "../types/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: EziiJwtClaims;
    }
  }
}

function getBearerToken(req: Request) {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export function normalizeRoleNameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing Bearer token" });
  }

  const result = decodeOrVerifyJwt(token);
  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

  req.user = result.claims;
  return next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const roleName = normalizeRoleNameKey(req.user?.role_name);
    if (!roleName) {
      return res.status(401).json({ ok: false, error: "Unauthenticated" });
    }
    const allowed = roles.map((r) => normalizeRoleNameKey(r));
    if (!allowed.includes(roleName)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    return next();
  };
}

