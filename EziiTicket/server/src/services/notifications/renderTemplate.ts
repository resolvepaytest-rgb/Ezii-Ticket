/** Replace `{{key}}` placeholders (non-regex, predictable for HTML bodies). */
export function renderNotificationPlaceholders(
  template: string,
  vars: Record<string, string | number | undefined | null>
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined || v === null) continue;
    const needle = `{{${k}}}`;
    if (!out.includes(needle)) continue;
    out = out.split(needle).join(String(v));
  }
  return out;
}
