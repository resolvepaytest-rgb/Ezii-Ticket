import type { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { decodeOrVerifyJwt } from "../auth/jwt.js";
import { ensureTenantAndDefaultsByOrgId } from "../services/provisioning/ensureTenantAndDefaults.js";
import { getAuthMePermissions } from "../controllers/auth/mePermissions.controller.js";
import { sendAuthMeWithIsNgo } from "../controllers/auth/authMe.controller.js";

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

  router.get("/auth/me", requireAuth, async (req, res, next) => {
    try {
      await Promise.resolve(ensureTenantAndDefaultsByOrgId(req.user?.org_id)).catch(() => null);
      await sendAuthMeWithIsNgo(req, res);
    } catch (e) {
      next(e);
    }
  });

  /**
   * System admin: GET `/reports/get-client-products` (no token) → all orgs.
   * Others: GET `/organization/get-client-products` (Bearer) → JWT org only.
   */
  router.post("/auth/sync-client-products", requireAuth, async (req, res, next) => {
    try {
      const mod = await import("../controllers/admin/clientProductsSync.controller.js");
      await mod.syncClientProducts(req, res);
    } catch (e) {
      next(e);
    }
  });

  router.get("/auth/me/permissions", requireAuth, (req, res, next) => {
    Promise.resolve()
      .then(() => ensureTenantAndDefaultsByOrgId(req.user?.org_id))
      .catch(() => null)
      .then(() => getAuthMePermissions(req, res))
      .catch(next);
  });
}
