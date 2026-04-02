import type { Request, Response } from "express";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { pool } from "../db/pool.js";
import { asInt } from "./admin/adminUtils.js";
import { assertAgentCanAccessTicketOrThrow } from "./tickets/ticketRoleAccess.js";

function currentOrgId(req: Request): number | null {
  return asInt(req.user?.org_id);
}

function currentUserId(req: Request): number | null {
  return asInt(req.user?.user_id);
}

function currentRole(req: Request): string {
  return String(req.user?.role_name ?? "").toLowerCase();
}

function isAgentLikeRole(role: string): boolean {
  return (
    role === "admin" ||
    role === "system_admin" ||
    role === "team_lead" ||
    role.includes("agent") ||
    role.includes("l1") ||
    role.includes("l2") ||
    role.includes("l3")
  );
}

const UPLOADS_BASE = path.resolve(process.cwd(), "src", "storage", "uploads");

/** `storedPath` is relative to UPLOADS_BASE, e.g. `12/34/filename.pdf` */
export function resolveStoredUploadPath(storedPath: string): string | null {
  const normalized = storedPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const full = path.resolve(UPLOADS_BASE, normalized);
  if (!full.startsWith(UPLOADS_BASE)) return null;
  return full;
}

async function assertCanAccessTicket(req: Request, ticketId: number): Promise<void> {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  if (!orgId || !userId) {
    const err = new Error("bad_request");
    (err as { name?: string }).name = "BadRequest";
    throw err;
  }

  const role = currentRole(req);
  const canViewAll =
    role === "admin" ||
    role === "system_admin" ||
    role === "team_lead" ||
    role.includes("agent") ||
    role.includes("l1") ||
    role.includes("l2") ||
    role.includes("l3");

  const ticketRes = await pool.query<{
    reporter_user_id: number;
    status: string;
  }>(
    `select reporter_user_id, status from tickets where id = $1 and organisation_id = $2`,
    [ticketId, orgId]
  );
  if (ticketRes.rowCount === 0) {
    const err = new Error("not_found");
    (err as { name?: string }).name = "TicketNotFound";
    throw err;
  }
  const ticket = ticketRes.rows[0]!;

  if (!canViewAll && Number(ticket.reporter_user_id) !== userId) {
    const err = new Error("forbidden");
    (err as { name?: string }).name = "Forbidden";
    throw err;
  }

  if (canViewAll && isAgentLikeRole(role)) {
    await assertAgentCanAccessTicketOrThrow(userId, orgId, ticketId);
  }
}

const ALLOWED_UPLOAD_STATUSES = new Set(["new", "open", "pending", "escalated", "reopened", "resolved"]);

export async function uploadTicketAttachment(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  const ticketId = asInt(req.params.id);
  const file = req.file;

  if (!orgId || !userId || !ticketId) {
    return res.status(400).json({ ok: false, error: "invalid request" });
  }
  if (!file) {
    return res.status(400).json({ ok: false, error: "file is required (multipart field name: file)" });
  }

  try {
    await assertCanAccessTicket(req, ticketId);
  } catch (e) {
    const n = (e as Error).name;
    if (n === "TicketNotFound") return res.status(404).json({ ok: false, error: "ticket not found" });
    if (n === "Forbidden") return res.status(403).json({ ok: false, error: "forbidden" });
    return res.status(400).json({ ok: false, error: "invalid request" });
  }

  const st = await pool.query<{ status: string }>(
    `select status from tickets where id = $1 and organisation_id = $2`,
    [ticketId, orgId]
  );
  const status = st.rows[0]?.status?.toLowerCase() ?? "";
  if (!ALLOWED_UPLOAD_STATUSES.has(status)) {
    return res.status(400).json({ ok: false, error: "attachments are not allowed for this ticket status" });
  }

  const relativePath = path.relative(UPLOADS_BASE, file.path).split(path.sep).join("/");

  const ins = await pool.query<{
    id: number;
    ticket_id: number;
    uploader_user_id: number;
    file_name: string;
    file_url: string;
    mime_type: string | null;
    size_bytes: string | null;
    created_at: string;
  }>(
    `insert into ticket_attachments
      (ticket_id, organisation_id, uploader_user_id, file_name, file_url, mime_type, size_bytes, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,now())
     returning id, ticket_id, uploader_user_id, file_name, file_url, mime_type, size_bytes, created_at`,
    [
      ticketId,
      orgId,
      userId,
      file.originalname || file.filename,
      relativePath,
      file.mimetype || null,
      file.size,
    ]
  );

  const row = ins.rows[0]!;
  await pool.query(
    `insert into ticket_events (ticket_id, organisation_id, event_type, actor_user_id, metadata_json, created_at)
     values ($1,$2,'attachment_added',$3,$4::jsonb,now())`,
    [ticketId, orgId, userId, JSON.stringify({ attachment_id: row.id, file_name: row.file_name })]
  );

  return res.status(201).json({
    ok: true,
    data: {
      id: row.id,
      ticket_id: row.ticket_id,
      uploader_user_id: row.uploader_user_id,
      file_name: row.file_name,
      file_url: row.file_url,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes ? Number(row.size_bytes) : null,
      created_at: row.created_at,
    },
  });
}

export async function downloadTicketAttachment(req: Request, res: Response) {
  const orgId = currentOrgId(req);
  const userId = currentUserId(req);
  const ticketId = asInt(req.params.ticketId);
  const attachmentId = asInt(req.params.attachmentId);

  if (!orgId || !userId || !ticketId || !attachmentId) {
    return res.status(400).json({ ok: false, error: "invalid request" });
  }

  try {
    await assertCanAccessTicket(req, ticketId);
  } catch (e) {
    const n = (e as Error).name;
    if (n === "TicketNotFound") return res.status(404).json({ ok: false, error: "ticket not found" });
    if (n === "Forbidden") return res.status(403).json({ ok: false, error: "forbidden" });
    return res.status(400).json({ ok: false, error: "invalid request" });
  }

  const row = await pool.query<{
    file_url: string;
    file_name: string;
    mime_type: string | null;
  }>(
    `select file_url, file_name, mime_type
     from ticket_attachments
     where id = $1 and ticket_id = $2 and organisation_id = $3`,
    [attachmentId, ticketId, orgId]
  );
  if (row.rowCount === 0) return res.status(404).json({ ok: false, error: "attachment not found" });

  const abs = resolveStoredUploadPath(row.rows[0]!.file_url);
  if (!abs) return res.status(500).json({ ok: false, error: "invalid stored path" });

  try {
    await stat(abs);
  } catch {
    return res.status(404).json({ ok: false, error: "file missing on disk" });
  }

  const downloadName = row.rows[0]!.file_name || "download";
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);
  if (row.rows[0]!.mime_type) {
    res.setHeader("Content-Type", row.rows[0]!.mime_type);
  }

  const stream = createReadStream(abs);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
}
