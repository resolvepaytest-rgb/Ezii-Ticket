import { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { applySamplePlaceholders } from "./notificationPreviewUtils";
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

export function NotificationTemplatePreview({ subject, body }: { subject: string; body: string }) {
  const previewSubject = useMemo(
    () => applySamplePlaceholders(subject.trim() || "(No subject)"),
    [subject]
  );
  const previewBody = useMemo(
    () => applySamplePlaceholders(body.trim() || "*No body content yet.*"),
    [body]
  );

  const iframeSrcDoc = useMemo(() => {
    if (!isEmailHtmlBody(previewBody)) return null;
    return buildEmailPreviewDocument(escapeHtml(previewSubject), previewBody);
  }, [previewSubject, previewBody]);

  return (
    <div className="rounded-2xl border border-black/10 bg-slate-50/80 p-4 sm:p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</div>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
        Email client view with sample data. Sent mail uses live values from your system.
      </p>

      <div className="mt-4 min-w-0">
        {iframeSrcDoc ? (
          <iframe
            title="Email preview"
            className="h-[min(720px,75vh)] w-full min-w-0 rounded-xl border border-black/10 bg-white dark:border-white/10"
            sandbox="allow-same-origin"
            srcDoc={iframeSrcDoc}
          />
        ) : (
          <EmailChromeFrame previewSubjectPlain={previewSubject}>
            <div className="max-h-[min(70vh,520px)] overflow-y-auto pr-1">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={bodyComponents}
              >
                {previewBody}
              </ReactMarkdown>
            </div>
          </EmailChromeFrame>
        )}
      </div>

    </div>
  );
}
