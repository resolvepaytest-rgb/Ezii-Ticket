import type { Router } from "express";
import { healthController } from "../controllers/HealthController.js";

export function registerHealthRoutes(router: Router) {
  router.get("/health", healthController);
}

