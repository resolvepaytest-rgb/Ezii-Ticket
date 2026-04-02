import type { Request } from "express";

/**
 * Matches client `isSystemAdmin` gate: Ezii platform super-admin only.
 * Used for Tier 2 SLA mutations and other Ezii-only operations.
 */
function isPlatformAdminRoleName(roleName: string | undefined): boolean {
  const n = String(roleName ?? "").toLowerCase().trim();
  return n === "admin" || n === "administrator";
}

/**
 * Matches client `isSystemAdminIdentity` / strict platform JWT — not merely `user_id === 1`.
 */
export function isEziiSystemAdmin(req: Request): boolean {
  const u = req.user;
  if (!u) return false;
  return (
    isPlatformAdminRoleName(u.role_name) &&
    u.org_id === "1" &&
    u.user_id === "1" &&
    u.role_id === "1" &&
    String(u.user_type_id ?? "") === "1"
  );
}
