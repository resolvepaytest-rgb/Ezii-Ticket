import type { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { ticketAttachmentUploader, TICKET_ATTACHMENT_MAX_BYTES } from "../middleware/ticketAttachmentUpload.js";

export function registerTicketRoutes(router: Router) {
  router.get("/notifications", requireAuth, async (req, res) => {
    const mod = await import("../controllers/notifications.controller.js");
    return mod.listMyNotifications(req, res);
  });
  router.post("/notifications/read-all", requireAuth, async (req, res) => {
    const mod = await import("../controllers/notifications.controller.js");
    return mod.markAllNotificationsRead(req, res);
  });
  router.post("/notifications/:id/read", requireAuth, async (req, res) => {
    const mod = await import("../controllers/notifications.controller.js");
    return mod.markNotificationRead(req, res);
  });

  router.get("/tickets/form/products", requireAuth, async (req, res) => {
    const mod = await import("../controllers/ticketsFormMeta.controller.js");
    return mod.listTicketFormProducts(req, res);
  });
  router.get("/tickets/form/products/:productId/categories", requireAuth, async (req, res) => {
    const mod = await import("../controllers/ticketsFormMeta.controller.js");
    return mod.listTicketFormCategories(req, res);
  });

  router.get("/tickets", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.listTickets(req, res);
  });

  router.post("/tickets", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.createTicket(req, res);
  });

  router.get("/tickets/my", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.listMyTickets(req, res);
  });

  router.get("/tickets/:id", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.getTicketById(req, res);
  });

  router.post("/tickets/:id/messages", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.addTicketMessage(req, res);
  });

  router.post(
    "/tickets/:id/attachments",
    requireAuth,
    (req, res, next) => {
      ticketAttachmentUploader.single("file")(req, res, (err: unknown) => {
        if (err) {
          const code = (err as { code?: string }).code;
          if (code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
              ok: false,
              error: `file exceeds maximum size (${TICKET_ATTACHMENT_MAX_BYTES} bytes)`,
            });
          }
          return res.status(400).json({
            ok: false,
            error: err instanceof Error ? err.message : "upload failed",
          });
        }
        next();
      });
    },
    async (req, res) => {
      const mod = await import("../controllers/ticketAttachments.controller.js");
      return mod.uploadTicketAttachment(req, res);
    }
  );

  router.get("/tickets/:ticketId/attachments/:attachmentId/download", requireAuth, async (req, res) => {
    const mod = await import("../controllers/ticketAttachments.controller.js");
    return mod.downloadTicketAttachment(req, res);
  });

  router.post("/tickets/:id/status", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.changeTicketStatus(req, res);
  });

  router.post("/tickets/:id/escalate", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.escalateTicket(req, res);
  });

  router.post("/tickets/:id/request-escalation", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.requestCustomerEscalation(req, res);
  });

  router.post("/tickets/:id/reopen", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.reopenTicket(req, res);
  });

  router.post("/tickets/:id/assign", requireAuth, async (req, res) => {
    const mod = await import("../controllers/tickets.controller.js");
    return mod.assignTicket(req, res);
  });
}

