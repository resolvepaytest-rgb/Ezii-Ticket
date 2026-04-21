import { useMemo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { buildEmailPreviewDocument, escapeHtml, isEmailHtmlBody } from "./emailPreviewDocument";

const bodyComponents: Components = {
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed text-slate-700 last:mb-0 dark:text-slate-300">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900 dark:text-slate-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href ?? "#"}
      className="font-medium text-[#1E88E5] underline decoration-[#1E88E5]/40 underline-offset-2 dark:text-[#64B5F6]"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-[#1E88E5]/50 py-0.5 pl-3 text-sm italic text-slate-600 dark:text-slate-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-slate-200 dark:border-white/10" />,
  h1: ({ children }) => (
    <h1 className="mb-2 text-base font-bold text-slate-900 dark:text-slate-100">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">{children}</h3>
  ),
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-800 dark:bg-black/30 dark:text-slate-200">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    if (className?.includes("language-")) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800 dark:bg-white/10 dark:text-slate-200">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="mb-3 max-w-full overflow-x-auto">
      <table className="w-full min-w-0 border-collapse border border-slate-200 text-left text-xs dark:border-white/15">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50 dark:bg-white/5">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-slate-200 px-2 py-1.5 font-semibold dark:border-white/15">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-200 px-2 py-1.5 dark:border-white/15">{children}</td>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  u: ({ children }) => <u className="underline decoration-slate-600 dark:decoration-slate-400">{children}</u>,
  mark: ({ children }) => (
    <mark className="rounded-sm bg-yellow-200/90 px-0.5 text-slate-900 dark:bg-yellow-900/45 dark:text-slate-100">
      {children}
    </mark>
  ),
  span: ({ children, ...props }) => <span {...props}>{children}</span>,
  br: () => <br />,
};

function EmailChromeFrame({
  previewSubjectPlain,
  children,
}: {
  previewSubjectPlain: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-[#eef2f6] dark:bg-slate-900/50">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold leading-snug text-[#0f172a] dark:text-slate-100">{previewSubjectPlain}</div>
          <div className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            From: Ezii System Notifications &lt;no-reply@ezii.co.in&gt;
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-slate-200 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          Internal use
        </span>
      </div>
      <div className="px-4 pb-5 sm:px-5">
        <div className="overflow-hidden rounded-xl border-t-4 border-[#1E88E5] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.1)] dark:border-[#1E88E5] dark:bg-[#0c1018] dark:shadow-none">
          <div className="px-5 py-7 sm:px-8 sm:py-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

function normalizeToken(raw: string): string | null {
  const cleaned = raw.trim().replace(/^\{\{\s*|\s*\}\}$/g, "").trim();
  if (!cleaned) return null;
  if (!/^[a-zA-Z0-9_.-]+$/.test(cleaned)) return null;
  return `{{${cleaned}}}`;
}

function htmlToPlainText(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

type NotificationTemplatePreviewProps = {
  subject: string;
  body: string;
  onChangeSubject?: (next: string) => void;
  onChangeBody?: (next: string) => void;
  insertOptions?: Array<{ token: string; label: string }>;
};

export function NotificationTemplatePreview({
  subject,
  body,
  onChangeSubject,
  onChangeBody,
  insertOptions = [],
}: NotificationTemplatePreviewProps): React.JSX.Element {
  const sourceSubject = subject.trim() || "(No subject)";
  const sourceBody = body.trim() || "*No body content yet.*";
  const canEditSource = Boolean(onChangeSubject && onChangeBody);
  const isHtmlSource = useMemo(() => isEmailHtmlBody(body), [body]);
  const bodyCodeText = useMemo(
    () => (isHtmlSource ? htmlToPlainText(body) : body),
    [body, isHtmlSource]
  );

  const placeholderTokens = useMemo(() => {
    const matches = `${sourceSubject}\n${sourceBody}`.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];
    return Array.from(new Set(matches.map((t) => t.trim())));
  }, [sourceSubject, sourceBody]);

  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [manualTokens, setManualTokens] = useState<string[]>([]);
  const [selectedInsertToken, setSelectedInsertToken] = useState<string>(insertOptions[0]?.token ?? "{{ticket_id}}");

  const allTokens = useMemo(
    () => Array.from(new Set([...placeholderTokens, ...manualTokens])),
    [placeholderTokens, manualTokens]
  );

  const previewSubject = useMemo(() => {
    let rendered = sourceSubject;
    for (const token of allTokens) {
      rendered = rendered.split(token).join(previewValues[token] ?? token);
    }
    return rendered;
  }, [sourceSubject, allTokens, previewValues]);

  const previewBody = useMemo(() => {
    let rendered = sourceBody;
    for (const token of allTokens) {
      rendered = rendered.split(token).join(previewValues[token] ?? token);
    }
    return rendered;
  }, [sourceBody, allTokens, previewValues]);

  function insertSelectedToken() {
    const token = normalizeToken(selectedInsertToken) ?? selectedInsertToken;
    if (!token) return;
    if (onChangeBody) onChangeBody(`${body}${body ? "\n" : ""}${token}`);
    setPreviewValues((prev) => ({ ...prev, [token]: prev[token] ?? token }));
    setManualTokens((prev) => (prev.includes(token) ? prev : [...prev, token]));
  }

  const iframeSrcDoc = useMemo(() => {
    if (!isEmailHtmlBody(previewBody)) return null;
    return buildEmailPreviewDocument(escapeHtml(previewSubject), previewBody);
  }, [previewSubject, previewBody]);

  return (
    <div className="rounded-2xl border border-black/10 bg-slate-50/80 p-4 sm:p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</div>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
        Email client preview. Variables use token names by default and are editable below.
      </p>

      <div className="mt-3 grid gap-2 rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Preview Text
        </div>
        <label className="grid gap-1">
          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">Subject</span>
          <input
            value={subject}
            onChange={(e) => onChangeSubject?.(e.target.value)}
            disabled={!canEditSource}
            className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-[#1E88E5]/40 disabled:opacity-70 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">Body Code</span>
              <div className="inline-flex items-center gap-1">
                <select
                  value={selectedInsertToken}
                  onChange={(e) => setSelectedInsertToken(e.target.value)}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] dark:border-white/15 dark:bg-white/10"
                >
                  {(insertOptions.length > 0 ? insertOptions : allTokens.map((t) => ({ token: t, label: t }))).map((item) => (
                    <option key={item.token} value={item.token}>
                      {item.label} ({item.token})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={insertSelectedToken}
                  className="rounded-lg bg-[#1E88E5] px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  Insert Variable
                </button>
              </div>
            </div>
            <textarea
              value={isHtmlSource ? bodyCodeText : body}
              onChange={(e) => onChangeBody?.(e.target.value)}
              disabled={!canEditSource}
              rows={12}
              className="min-h-[280px] resize-y rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-[#1E88E5]/40 disabled:opacity-70 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
            />
          </label>

          <div className="grid gap-1">
            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">Body Preview</span>
            {iframeSrcDoc ? (
              <iframe
                title="Email preview"
                className="h-[420px] w-full min-w-0 rounded-xl border border-black/10 bg-white dark:border-white/10"
                sandbox="allow-same-origin"
                srcDoc={iframeSrcDoc}
              />
            ) : (
              <div className="h-[420px] overflow-auto rounded-xl border border-black/10 dark:border-white/10">
                <EmailChromeFrame previewSubjectPlain={previewSubject}>
                  <div className="max-h-full overflow-y-auto pr-1">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={bodyComponents}
                    >
                      {previewBody}
                    </ReactMarkdown>
                  </div>
                </EmailChromeFrame>
              </div>
            )}
          </div>
        </div>
      </div>


    </div>
  );
}
