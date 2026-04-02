import cors from "cors";
import express from "express";
import morgan from "morgan";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerAdminRoutes } from "./routes/admin.routes.js";
import { registerTicketRoutes } from "./routes/tickets.routes.js";
import { assertPermissionKeyNamingConventions } from "./authz/permissionNaming.js";

export function createApp() {
  assertPermissionKeyNamingConventions();
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerTicketRoutes(app);
  registerAdminRoutes(app);

  return app;
}

