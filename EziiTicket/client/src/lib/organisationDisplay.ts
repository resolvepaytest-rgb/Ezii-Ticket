/** Names auto-created by ensureTenant / provisioning (see server ensureOrganisationRow). */
export function isSyntheticOrganisationName(name: string | null | undefined): boolean {
  const n = name?.trim();
  if (!n) return true;
  return /^Organisation \d+$/i.test(n) || /^Organization \d+$/i.test(n);
}

/** Prefer directory name when DB still has a synthetic placeholder. */
export function resolveOrganisationDisplayName(
  org: { id: number; name: string },
  externalNameById: Map<string, string>
): string {
  const ext = externalNameById.get(String(org.id));
  if (ext?.trim() && isSyntheticOrganisationName(org.name)) {
    return ext.trim();
  }
  return org.name;
}
