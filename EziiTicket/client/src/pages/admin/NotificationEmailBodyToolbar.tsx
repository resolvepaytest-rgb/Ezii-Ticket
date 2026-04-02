import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";
import {
  ALargeSmall,
  Bold,
  Code2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Paperclip,
  Palette,
  Quote,
  Strikethrough,
  Table2,
  Underline,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function applyTextareaTransform(
  textarea: HTMLTextAreaElement | null,
  body: string,
  setBody: (next: string) => void,
  transform: (selected: string) => string,
  fallback = ""
) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = body.slice(start, end) || fallback;
  const replacement = transform(selected);
  const nextBody = `${body.slice(0, start)}${replacement}${body.slice(end)}`;
  setBody(nextBody);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + replacement.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}

function mapSelectedLines(selected: string, mapLine: (line: string) => string) {
  const lines = selected.split("\n");
  return lines.map(mapLine).join("\n");
}

function prefixLines(selected: string, prefix: string) {
  return mapSelectedLines(selected, (line) => (line.startsWith(prefix) ? line : `${prefix}${line}`));
}

function prefixNumberedLines(selected: string) {
  const raw = selected.trim() ? selected : "List item";
  const lines = raw.split("\n");
  return lines
    .map((line, i) => {
      const stripped = line.replace(/^\d+\.\s*/, "");
      return `${i + 1}. ${stripped}`;
    })
    .join("\n");
}

function stripLinePrefix(selected: string, prefix: string) {
  return mapSelectedLines(selected, (line) =>
    line.startsWith(prefix) ? line.slice(prefix.length) : line
  );
}

function stripFormatting(text: string) {
  let t = text;
  t = t.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, "$1");
  t = t.replace(/<u>([\s\S]*?)<\/u>/gi, "$1");
  t = t.replace(/<mark>([\s\S]*?)<\/mark>/gi, "$1");
  t = t.replace(/\*\*([\s\S]+?)\*\*/g, "$1");
  t = t.replace(/~~([\s\S]+?)~~/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  return t;
}

const INDENT = "    ";

function insertBlock(body: string, textarea: HTMLTextAreaElement | null, setBody: (s: string) => void, block: string) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const prefix = body.slice(0, start).endsWith("\n") || start === 0 ? "" : "\n";
  const suffix = body.slice(end).startsWith("\n") || end >= body.length ? "" : "\n";
  const insert = `${prefix}${block}${suffix}`;
  const next = `${body.slice(0, start)}${insert}${body.slice(end)}`;
  setBody(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + insert.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}

const TABLE_MD = `| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |
`;

type ToolbarProps = {
  body: string;
  setBody: (next: string) => void;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPickAttachment: () => void;
  onFilesSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  /** e.g. INSERT {{}} button */
  rightSlot?: ReactNode;
  compact?: boolean;
};

function ToolbarBtn({
  title,
  onClick,
  children,
  className,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-200/90 dark:text-slate-300 dark:hover:bg-white/15",
        className
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-300 dark:bg-slate-600" aria-hidden />;
}

export function EmailBodyRichToolbar({
  body,
  setBody,
  editorRef,
  fileInputRef,
  onPickAttachment,
  onFilesSelected,
  rightSlot,
  compact,
}: ToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const apply = (t: (s: string) => string, fb = "") =>
    applyTextareaTransform(editorRef.current, body, setBody, t, fb);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen]);

  useEffect(() => {
    if (!colorOpen && !sizeOpen) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setColorOpen(false);
      setSizeOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [colorOpen, sizeOpen]);

  const iconClass = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-wrap items-center gap-0.5 border-b border-slate-200/90 bg-slate-100/80 px-2 py-1 dark:border-white/10 dark:bg-white/[0.06]",
        compact && "py-0.5"
      )}
    >
      <ToolbarBtn title="Bold" onClick={() => apply((s) => `**${s || "bold"}**`, "bold")}>
        <Bold className={iconClass} strokeWidth={2.5} />
      </ToolbarBtn>
      <ToolbarBtn title="Italic" onClick={() => apply((s) => `*${s || "italic"}*`, "italic")}>
        <Italic className={iconClass} />
      </ToolbarBtn>
      <ToolbarBtn title="Underline" onClick={() => apply((s) => `<u>${s || "underlined"}</u>`, "underlined")}>
        <Underline className={iconClass} />
      </ToolbarBtn>
      <ToolbarBtn title="Strikethrough" onClick={() => apply((s) => `~~${s || "strikethrough"}~~`, "strikethrough")}>
        <Strikethrough className={iconClass} />
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn title="Bulleted list" onClick={() => apply((s) => prefixLines(s || "List item", "- "), "List item")}>
        <List className={iconClass} />
      </ToolbarBtn>
      <ToolbarBtn title="Numbered list" onClick={() => apply((s) => prefixNumberedLines(s), "List item")}>
        <ListOrdered className={iconClass} />
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn title="Highlight" onClick={() => apply((s) => `<mark>${s || "highlighted"}</mark>`, "highlighted")}>
        <Highlighter className={iconClass} />
      </ToolbarBtn>
      <div className="relative">
        <ToolbarBtn title="Text color" onClick={() => setColorOpen((o) => !o)}>
          <Palette className={iconClass} />
        </ToolbarBtn>
        {colorOpen ? (
          <div className="absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-lg border border-black/10 bg-white p-1.5 shadow-lg dark:border-white/15 dark:bg-[#121826]">
            {["#111827", "#1E88E5", "#16A34A", "#CA8A04", "#DC2626", "#9333EA"].map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                className="h-6 w-6 rounded border border-black/10 dark:border-white/20"
                style={{ backgroundColor: c }}
                onClick={() => {
                  setColorOpen(false);
                  apply((s) => `<span style="color:${c}">${s || "text"}</span>`, "text");
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="relative">
        <ToolbarBtn title="Font size" onClick={() => setSizeOpen((o) => !o)}>
          <ALargeSmall className={iconClass} />
        </ToolbarBtn>
        {sizeOpen ? (
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-black/10 bg-white py-1 text-xs shadow-lg dark:border-white/15 dark:bg-[#121826]">
            {[
              { label: "Small", px: "13px" },
              { label: "Normal", px: "16px" },
              { label: "Large", px: "20px" },
              { label: "Heading", px: "24px" },
            ].map(({ label, px }) => (
              <button
                key={label}
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => {
                  setSizeOpen(false);
                  apply((s) => `<span style="font-size:${px}">${s || label}</span>`, label);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <Divider />

      <ToolbarBtn title="Blockquote" onClick={() => apply((s) => prefixLines(s || "Quote", "> "), "Quote")}>
        <Quote className={iconClass} />
      </ToolbarBtn>
      <ToolbarBtn title="Insert link" onClick={() => apply((s) => `[${s || "link text"}](https://example.com)`, "link text")}>
        <Link2 className={iconClass} />
      </ToolbarBtn>
      <ToolbarBtn title="Code" onClick={() => apply((s) => (s.includes("\n") ? `\`\`\`\n${s || "code"}\n\`\`\`` : `\`${s || "code"}\``), "code")}>
        <Code2 className={iconClass} />
      </ToolbarBtn>

      <div className="relative" ref={moreRef}>
        <ToolbarBtn title="More" onClick={() => setMoreOpen((o) => !o)}>
          <MoreHorizontal className={iconClass} />
        </ToolbarBtn>
        {moreOpen ? (
          <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-black/10 bg-white py-1 text-xs shadow-xl dark:border-white/15 dark:bg-[#121826]">
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                setMoreOpen(false);
                insertBlock(body, editorRef.current, setBody, "\n\n");
              }}
            >
              Paragraph break
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                setMoreOpen(false);
                apply((s) => `\`\`\`\n${s || "code block"}\n\`\`\``, "code block");
              }}
            >
              Code block
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                setMoreOpen(false);
                apply((s) => stripFormatting(s), "");
              }}
            >
              Clear all formatting
            </button>
            <div className="my-1 border-t border-black/10 dark:border-white/10" />
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                setMoreOpen(false);
                apply((s) => stripLinePrefix(s, INDENT), "");
              }}
            >
              Decrease indent
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                setMoreOpen(false);
                apply((s) => prefixLines(s || " ", INDENT), " ");
              }}
            >
              Increase indent
            </button>
            <div className="my-1 border-t border-black/10 dark:border-white/10" />
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                setMoreOpen(false);
                insertBlock(body, editorRef.current, setBody, "---");
              }}
            >
              Horizontal rule
            </button>
            <div className="my-1 border-t border-black/10 dark:border-white/10" />
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                setMoreOpen(false);
                insertBlock(body, editorRef.current, setBody, TABLE_MD.trimEnd());
              }}
            >
              Insert table
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                setMoreOpen(false);
                insertBlock(body, editorRef.current, setBody, "| New col | New col |\n| --- | --- |");
              }}
            >
              Insert table row
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-red-600 hover:bg-black/5 dark:text-red-400 dark:hover:bg-white/10"
              onClick={() => {
                setMoreOpen(false);
                apply(() => "", "");
              }}
            >
              Remove selected text
            </button>
          </div>
        ) : null}
      </div>

      <Divider />

      <ToolbarBtn title="Attach file" onClick={onPickAttachment}>
        <Paperclip className={iconClass} />
      </ToolbarBtn>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFilesSelected} />

      <ToolbarBtn
        title="Insert table (quick)"
        onClick={() => insertBlock(body, editorRef.current, setBody, TABLE_MD.trimEnd())}
        className="hidden sm:inline-flex"
      >
        <Table2 className={iconClass} />
      </ToolbarBtn>

      {rightSlot ? <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">{rightSlot}</div> : null}
    </div>
  );
}
