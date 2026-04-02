/** Build a full HTML document for iframe email preview (light theme, like a real client). */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isEmailHtmlBody(body: string): boolean {
  const t = body.trim();
  if (!t.startsWith("<")) return false;
  const lower = t.slice(0, 80).toLowerCase();
  return (
    lower.includes("<div") ||
    lower.includes("<table") ||
    lower.includes("<p") ||
    lower.includes("<!doctype") ||
    lower.includes("<html")
  );
}

/**
 * Wraps substituted inner HTML (logo + body + footer inside the card) in client chrome.
 */
export function buildEmailPreviewDocument(escapedSubject: string, innerCardHtml: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f6; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .meta { max-width: 640px; margin: 0 auto; padding: 20px 20px 14px; display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 14px; }
  .meta-main { min-width: 0; flex: 1; }
  .meta-subject { font-size: 17px; font-weight: 700; color: #0f172a; line-height: 1.35; word-break: break-word; }
  .meta-from { margin-top: 6px; font-size: 13px; color: #64748b; }
  .badge { flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; color: #475569; background: #e2e8f0; padding: 7px 14px; border-radius: 999px; }
  .wrap { max-width: 640px; margin: 0 auto 48px; padding: 0 20px; }
  .card { background: #ffffff; border-radius: 14px; box-shadow: 0 12px 40px rgba(15, 23, 42, 0.1); border-top: 4px solid #1E88E5; overflow: hidden; }
  .card-inner { padding: 36px 32px 32px; }
</style></head><body>
  <div class="meta">
    <div class="meta-main">
      <div class="meta-subject">${escapedSubject}</div>
      <div class="meta-from">From: Ezii System Notifications &lt;no-reply@ezii.com&gt;</div>
    </div>
    <div class="badge">INTERNAL USE</div>
  </div>
  <div class="wrap">
    <div class="card">
      <div class="card-inner">${innerCardHtml}</div>
    </div>
  </div>
</body></html>`;
}
