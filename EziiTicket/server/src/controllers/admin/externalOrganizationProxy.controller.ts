import type { Request, Response } from "express";
import { EXTERNAL_ORG_PATHS, getExternalOrgApiBaseUrl } from "../../config/externalOrgApi.js";
import { fetchExternalOrgGet } from "../../services/externalOrgApiClient.js";

function forwardAuth(req: Request): string | undefined {
  return req.headers.authorization;
}

export async function proxyWorkerTypeList(req: Request, res: Response) {
  try {
    getExternalOrgApiBaseUrl();
  } catch (e) {
    return res.status(503).json({
      ok: false,
      error: e instanceof Error ? e.message : "External API not configured",
    });
  }
  const { status, json } = await fetchExternalOrgGet(EXTERNAL_ORG_PATHS.workerTypeList, forwardAuth(req));
  if (status >= 400) return res.status(status).json(json);
  return res.json({ ok: true, data: json });
}

export async function proxyAttributeList(req: Request, res: Response) {
  try {
    getExternalOrgApiBaseUrl();
  } catch (e) {
    return res.status(503).json({
      ok: false,
      error: e instanceof Error ? e.message : "External API not configured",
    });
  }
  const { status, json } = await fetchExternalOrgGet(EXTERNAL_ORG_PATHS.attributeList, forwardAuth(req));
  if (status >= 400) return res.status(status).json(json);
  return res.json({ ok: true, data: json });
}

export async function proxyAttributeDetails(req: Request, res: Response) {
  const id = String(req.params.attributeId ?? "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "attributeId is required" });
  try {
    getExternalOrgApiBaseUrl();
  } catch (e) {
    return res.status(503).json({
      ok: false,
      error: e instanceof Error ? e.message : "External API not configured",
    });
  }
  const { status, json } = await fetchExternalOrgGet(EXTERNAL_ORG_PATHS.attributeDetails(id), forwardAuth(req));
  if (status >= 400) return res.status(status).json(json);
  return res.json({ ok: true, data: json });
}
