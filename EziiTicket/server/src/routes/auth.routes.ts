import type { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { decodeOrVerifyJwt } from "../auth/jwt.js";
import { ensureTenantAndDefaultsByOrgId } from "../services/provisioning/ensureTenantAndDefaults.js";
import { getAuthMePermissions } from "../controllers/auth/mePermissions.controller.js";

export function registerAuthRoutes(router: Router) {
  router.get("/auth/login/:token", (req, res) => {
    const { token } = req.params;

    const result = decodeOrVerifyJwt(token);
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

    // Provision tenant + defaults if this organisation doesn't exist yet.
    Promise.resolve()
      .then(() => ensureTenantAndDefaultsByOrgId(result.claims.org_id))
      .catch(() => null)
      .finally(() => {
        res.json({ ok: true, token: result.token, user: result.claims });
      });
  });

  // Validate current token / get claims
  router.get("/auth/me", requireAuth, (req, res) => {
    // Provision tenant + defaults for the decoded token's organisation.
    Promise.resolve()
      .then(() => ensureTenantAndDefaultsByOrgId(req.user?.org_id))
      .catch(() => null)
      .finally(() => {
        res.json({ ok: true, user: req.user });
      });
  });

  router.get("/auth/me/permissions", requireAuth, (req, res, next) => {
    Promise.resolve()
      .then(() => ensureTenantAndDefaultsByOrgId(req.user?.org_id))
      .catch(() => null)
      .then(() => getAuthMePermissions(req, res))
      .catch(next);
  });
}

