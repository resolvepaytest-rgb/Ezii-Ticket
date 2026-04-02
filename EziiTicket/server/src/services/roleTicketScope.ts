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
  apply_worker_type_id: number | null;
};

function metaStr(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  if (v == null) return null;
  return String(v).trim() || null;
}

export function ticketMatchesRoleApplyScope(
  ticketMetadata: Record<string, unknown>,
  role: RoleApplyRow,
  viewerUserId: number
): boolean {
  const mode = (role.apply_role_to ?? "all").toLowerCase();
  if (mode === "all") return true;

  if (mode === "reportees") {
    const mgr = metaStr(ticketMetadata, "reporting_manager_user_id");
    if (mgr != null && Number(mgr) === viewerUserId) return true;
    return false;
  }

  const attr =
    metaStr(ticketMetadata, "attribute_id") ??
    metaStr(ticketMetadata, "ezii_attribute_id") ??
    metaStr(ticketMetadata, "AttributeId");

  if (mode === "attribute") {
    if (!role.apply_attribute_id) return false;
    return attr != null && attr === String(role.apply_attribute_id).trim();
  }

  if (mode === "sub_attribute") {
    if (!role.apply_attribute_id || !role.apply_sub_attribute_id) return false;
    const sub =
      metaStr(ticketMetadata, "attribute_sub_id") ??
      metaStr(ticketMetadata, "ezii_attribute_sub_id") ??
      metaStr(ticketMetadata, "AttributeSubId");
    return (
      attr != null &&
      sub != null &&
      attr === String(role.apply_attribute_id).trim() &&
      sub === String(role.apply_sub_attribute_id).trim()
    );
  }

  return true;
}
