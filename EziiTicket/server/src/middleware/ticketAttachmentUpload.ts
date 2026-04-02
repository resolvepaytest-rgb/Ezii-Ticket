import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import multer from "multer";
import type { Request } from "express";

/** Max 10 MB per file (First Cut). */
export const TICKET_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Disk storage under `src/storage/uploads/{orgId}/{ticketId}/`.
 * Route must be `.../tickets/:id/attachments`.
 */
export const ticketAttachmentUploader = multer({
  storage: multer.diskStorage({
    destination(req: Request, _file, cb) {
      const orgId = Number((req as { user?: { org_id?: unknown } }).user?.org_id);
      const ticketId = Number(req.params.id);
      if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(ticketId) || ticketId <= 0) {
        cb(new Error("invalid upload context"), "");
        return;
      }
      const dir = path.resolve(process.cwd(), "src", "storage", "uploads", String(orgId), String(ticketId));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const safe = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      cb(null, `${Date.now()}_${randomBytes(4).toString("hex")}_${safe}`);
    },
  }),
  limits: { fileSize: TICKET_ATTACHMENT_MAX_BYTES },
});
