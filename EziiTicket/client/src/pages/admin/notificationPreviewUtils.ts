/** Sample values for preview mode (not sent in real notifications). */

const SAMPLE_BY_KEY: Record<string, string> = {
  ticket_id: "TK-8821",
  customer_name: "Jordan Lee",
  ticket_subject: "Cloud database latency spike in EU-West-1",
  agent_name: "Alex",
  product: "Ezii Cloud",
  sla_deadline: "Mar 25, 2025 · 4:30 PM",
  priority: "URGENT",
  csat_link: "https://support.ezii.com/csat/TK-8821",
  ticket_url: "https://tickets.ezii.com/t/TK-8821",
  latest_message:
    "Thanks — I’ve attached the PDF from our accounting system. Please confirm receipt.",
  user_name: "Jordan Lee",
};

/**
 * Replaces `{{ token }}` with sample data. Unknown tokens become a readable sample label.
 */
export function applySamplePlaceholders(content: string): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_full, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    const hit = SAMPLE_BY_KEY[key];
    if (hit !== undefined) return hit;
    return `Sample (${rawKey})`;
  });
}
