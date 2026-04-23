/**
 * Whether a ticket is visible for permission purposes given the viewer's primary role row
 * (apply_role_to + attribute / sub-attribute / reportees).
 *
 * Ticket routing metadata is expected under tickets.metadata_json, e.g.:
 * { "attribute_id": "0", "attribute_sub_id": "49", "reporting_manager_user_id": "123" }
 */
export type RoleApplyRow = {
  apply_role_to: string;
  apply_attribute_id: string | null;
  apply_sub_attribute_id: string | null;
  apply_worker_type_id: string | null;
};

function metaStr(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  if (v == null) return null;
  return String(v).trim() || null;
}

function splitCsvIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function ticketMatchesRoleApplyScope(
  ticketMetadata: Record<string, unknown>,
  role: RoleApplyRow,
  viewerUserId: number,
  ticketOrganisationId?: number | null
): boolean {
  const mode = (role.apply_role_to ?? "all").toLowerCase();
  if (mode === "all") return true;

  if (mode === "reportees") {
    const mgr = metaStr(ticketMetadata, "reporting_manager_user_id");
    if (mgr != null && Number(mgr) === viewerUserId) return true;
    return false;
  }

  if (mode === "worker_type") {
    const allowedWorkerTypes = splitCsvIds(role.apply_worker_type_id);
    if (!allowedWorkerTypes.length) return false;
    const workerTypeId =
      metaStr(ticketMetadata, "worker_type_id") ??
      metaStr(ticketMetadata, "ezii_worker_type_id") ??
      metaStr(ticketMetadata, "WorkerTypeId");
    return workerTypeId != null && allowedWorkerTypes.includes(workerTypeId);
  }

  const attr =
    metaStr(ticketMetadata, "attribute_id") ??
    metaStr(ticketMetadata, "ezii_attribute_id") ??
    metaStr(ticketMetadata, "AttributeId");

  if (mode === "attribute") {
    const allowedAttrs = splitCsvIds(role.apply_attribute_id);
    if (!allowedAttrs.length || attr == null || !allowedAttrs.includes(attr)) return false;

    const workerTypeId =
      metaStr(ticketMetadata, "worker_type_id") ??
      metaStr(ticketMetadata, "ezii_worker_type_id") ??
      metaStr(ticketMetadata, "WorkerTypeId");
    const allowedWorkerTypes = splitCsvIds(role.apply_worker_type_id);
    if (allowedWorkerTypes.length) {
      if (workerTypeId == null || !allowedWorkerTypes.includes(workerTypeId)) return false;
    }

    const allowedSubs = splitCsvIds(role.apply_sub_attribute_id);
    if (!allowedSubs.length) return true;

    const sub =
      metaStr(ticketMetadata, "attribute_sub_id") ??
      metaStr(ticketMetadata, "ezii_attribute_sub_id") ??
      metaStr(ticketMetadata, "AttributeSubId");
    return sub != null && allowedSubs.includes(sub);
  }

  return true;
}
