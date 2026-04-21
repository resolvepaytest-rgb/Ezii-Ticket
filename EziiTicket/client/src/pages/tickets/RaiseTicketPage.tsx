import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { InstantTooltip } from "@components/common/InstantTooltip";
import { useScreenModifyAccess } from "@hooks/useScreenModifyAccess";
import {
  createTicket,
  listTicketFormCategories,
  listTicketFormProducts,
  uploadTicketAttachment,
  type TicketFormCategory,
  type TicketFormProduct,
} from "@api/ticketApi";
import { toast } from "sonner";
import { Loader } from "@components/common/Loader";

type RaiseTicketPageProps = {
  onCreated?: (ticketId: number) => void;
};

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".csv", ".docx"] as const;
const TABLE_PREVIEW_MAX_ROWS = 5;
const TABLE_PREVIEW_MAX_COLS = 4;

type ParsedFilePreview =
  | { kind: "table"; rows: string[][] }
  | { kind: "text"; text: string }
  | { kind: "none" };

export function RaiseTicketPage({ onCreated }: RaiseTicketPageProps) {
  const [products, setProducts] = useState<TicketFormProduct[]>([]);
  const [categories, setCategories] = useState<TicketFormCategory[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [productId, setProductId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [subcategoryId, setSubcategoryId] = useState<number | "">("");
  const [affectedUsers, setAffectedUsers] = useState<number | "">("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [parsedPreviews, setParsedPreviews] = useState<Record<string, ParsedFilePreview>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canModify = useScreenModifyAccess("raise_a_ticket");
  const modifyAccessMessage = "You don't have modify access";

  useEffect(() => {
    let cancelled = false;
    setLoadingProducts(true);
    void listTicketFormProducts()
      .then((data) => {
        if (cancelled) return;
        setProducts(data);
        if (data.length > 0) {
          setProductId((prev) => (prev === "" ? data[0]!.id : prev));
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load products");
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (productId === "") {
      setCategories([]);
      setCategoryId("");
      setSubcategoryId("");
      return;
    }
    let cancelled = false;
    setLoadingCategories(true);
    setCategoryId("");
    setSubcategoryId("");
    void listTicketFormCategories(productId)
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load categories");
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const selectedCategory =
    categoryId === "" ? undefined : categories.find((c) => Number(c.id) === Number(categoryId));
  const filePreviews = useMemo(() => {
    return pendingFiles.map((f, idx) => {
      const isImage = f.type.startsWith("image/");
      const ext = f.name.includes(".") ? f.name.split(".").pop() ?? "" : "";
      return {
        key: `${f.name}-${f.size}-${f.lastModified}-${idx}`,
        file: f,
        isImage,
        label: (ext || f.name).toUpperCase(),
        url: isImage ? URL.createObjectURL(f) : null,
      };
    });
  }, [pendingFiles]);

  useEffect(() => {
    return () => {
      for (const p of filePreviews) {
        if (p.url) URL.revokeObjectURL(p.url);
      }
    };
  }, [filePreviews]);

  useEffect(() => {
    let cancelled = false;

    const parseFileForPreview = async (file: File): Promise<ParsedFilePreview> => {
      const lowerName = file.name.toLowerCase();
      try {
        if (lowerName.endsWith(".csv")) {
          const XLSX = await import("xlsx");
          const text = await file.text();
          const workbook = XLSX.read(text, { type: "string" });
          const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
          if (!sheet) return { kind: "none" };
          const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
            header: 1,
            defval: "",
            raw: false,
          });
          const tableRows = rows
            .slice(0, TABLE_PREVIEW_MAX_ROWS)
            .map((r) => r.slice(0, TABLE_PREVIEW_MAX_COLS).map((cell) => String(cell ?? "")));
          return tableRows.length > 0 ? { kind: "table", rows: tableRows } : { kind: "none" };
        }

        if (lowerName.endsWith(".xlsx")) {
          const XLSX = await import("xlsx");
          const buf = await file.arrayBuffer();
          const workbook = XLSX.read(buf, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
          if (!sheet) return { kind: "none" };
          const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
            header: 1,
            defval: "",
            raw: false,
          });
          const tableRows = rows
            .slice(0, TABLE_PREVIEW_MAX_ROWS)
            .map((r) => r.slice(0, TABLE_PREVIEW_MAX_COLS).map((cell) => String(cell ?? "")));
          return tableRows.length > 0 ? { kind: "table", rows: tableRows } : { kind: "none" };
        }

        if (lowerName.endsWith(".docx")) {
          const { extractRawText } = await import("mammoth");
          const arrayBuffer = await file.arrayBuffer();
          const result = await extractRawText({ arrayBuffer });
          const text = result.value.replace(/\s+/g, " ").trim();
          return text ? { kind: "text", text: text.slice(0, 350) } : { kind: "none" };
        }

        return { kind: "none" };
      } catch {
        return { kind: "none" };
      }
    };

    void (async () => {
      const entries = await Promise.all(
        pendingFiles.map(async (f) => {
          const key = `${f.name}::${f.size}::${f.lastModified}`;
          const parsed = await parseFileForPreview(f);
          return [key, parsed] as const;
        })
      );
      if (!cancelled) {
        setParsedPreviews(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingFiles]);

  const isAllowedExtension = (fileName: string) => {
    const lower = fileName.toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  };

  const handlePickFiles = (files: File[] | null) => {
    if (!files || files.length === 0) return;

    setPendingFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}::${f.size}::${f.lastModified}`));
      const next = [...prev];

      for (const f of files) {
        if (!isAllowedExtension(f.name)) {
          toast.error(`Unsupported file type: ${f.name}`);
          continue;
        }
        if (f.size > MAX_FILE_SIZE_BYTES) {
          toast.error(`${f.name} exceeds 20 MB`);
          continue;
        }
        if (next.length >= MAX_FILES) {
          toast.error(`Maximum ${MAX_FILES} files allowed`);
          break;
        }
        const key = `${f.name}::${f.size}::${f.lastModified}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        next.push(f);
      }
      return next;
    });
  };

  const removePendingFileAt = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (productId === "") {
      toast.error("Select a product");
      return;
    }
    if (categories.length > 0 && categoryId === "") {
      toast.error("Select a category");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (description.trim().length < 20) {
      toast.error("Description must be at least 20 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createTicket({
        product_id: productId,
        category_id: categoryId === "" ? null : categoryId,
        subcategory_id: subcategoryId === "" ? null : subcategoryId,
        subject: subject.trim(),
        description: description.trim(),
        channel: "portal",
        affected_users: affectedUsers === "" ? undefined : affectedUsers,
        metadata_json: { source: "portal_raise_ticket" },
      });
      toast.success(`Ticket created: ${created.ticket_code}`);
      if (pendingFiles.length > 0) {
        for (const f of pendingFiles) {
          try {
            await uploadTicketAttachment(created.id, f);
          } catch (upErr) {
            toast.error(upErr instanceof Error ? upErr.message : "Attachment upload failed");
            break;
          }
        }
        setPendingFiles([]);
      }
      setSubject("");
      setDescription("");
      setAffectedUsers("");
      setCategoryId("");
      setSubcategoryId("");
      onCreated?.(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <GlassCard className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Raise a Ticket</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Create a support ticket with required details.</p>
        </div>

        {loadingProducts ? (
          <Loader label="Loading products..." />
        ) : products.length === 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            No products are enabled for your organisation. Contact your administrator.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs">
                <div className="mb-1 text-[11px] text-muted-foreground">
                  Product <span className="text-red-500">*</span>
                </div>
                <select
                  value={productId === "" ? "" : String(productId)}
                  onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}
                  required
                  className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 text-xs dark:border-white/10"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.default_ticket_prefix})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <div className="mb-1 text-[11px] text-muted-foreground">Affected Users (optional)</div>
                <input
                  type="number"
                  min={1}
                  value={affectedUsers}
                  onChange={(e) => setAffectedUsers(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 text-xs dark:border-white/10"
                />
              </label>
              <label className="text-xs">
                <div className="mb-1 text-[11px] text-muted-foreground">
                  Category <span className="text-red-500">*</span>
                </div>
                {loadingCategories ? (
                  <div className="text-[11px] text-muted-foreground">Loading categories…</div>
                ) : (
                  <select
                    value={categoryId === "" ? "" : String(categoryId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCategoryId(v ? Number(v) : "");
                      setSubcategoryId("");
                    }}
                    required={categories.length > 0}
                    className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 text-xs dark:border-white/10"
                  >
                    <option value="">— Select category —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="text-xs">
                <div className="mb-1 text-[11px] text-muted-foreground">Sub-category (optional)</div>
                <select
                  value={subcategoryId === "" ? "" : String(subcategoryId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSubcategoryId(v ? Number(v) : "");
                  }}
                  disabled={categoryId === ""}
                  className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 text-xs disabled:opacity-50 dark:border-white/10"
                >
                  {categoryId === "" ? (
                    <option value="">— Select category first —</option>
                  ) : (selectedCategory?.subcategories ?? []).length === 0 ? (
                    <option value="">— No sub-categories available —</option>
                  ) : (
                    <>
                      <option value="">— Select sub-category —</option>
                      {(selectedCategory?.subcategories ?? []).map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
            </div>

            <label className="block text-xs">
              <div className="mb-1 text-[11px] text-muted-foreground">
                Subject <span className="text-red-500">*</span>
              </div>
              <input
                type="text"
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 text-xs dark:border-white/10"
                placeholder="Brief summary of the issue"
              />
            </label>

            <label className="block text-xs">
              <div className="mb-1 text-[11px] text-muted-foreground">
                Description <span className="text-red-500">*</span>
              </div>
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 text-xs dark:border-white/10"
                placeholder="Provide detailed context (minimum 20 characters)..."
              />
            </label>

            <div className="space-y-2">
              <div className="text-[11px] text-muted-foreground">Attachments (optional)</div>
              <label
                className={`block cursor-pointer rounded-xl border border-dashed p-4 text-center transition-colors ${isDraggingFiles ? "border-primary bg-primary/10" : "border-black/20 bg-white/5 hover:bg-white/10 dark:border-white/20"}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);
                  handlePickFiles(e.dataTransfer.files ? Array.from(e.dataTransfer.files) : null);
                }}
              >
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv,.docx"
                  onChange={(e) => handlePickFiles(e.target.files ? Array.from(e.target.files) : null)}
                  className="hidden"
                />
                <div className="text-xs font-medium">Tap to upload or drag-and-drop</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Max 10 files, 20 MB each. Supported: PDF, JPG, PNG, XLSX, CSV, DOCX.
                </div>
              </label>

              {pendingFiles.length > 0 ? (
                <div className="rounded-xl border border-black/10 bg-white/5 p-3">
                  <div className="mb-2 text-[11px] text-muted-foreground">{pendingFiles.length} attachment(s) selected</div>
                  <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                    {pendingFiles.map((f, idx) => (
                      <div key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-[11px]">{f.name}</div>
                        <button
                          type="button"
                          onClick={() => removePendingFileAt(idx)}
                          className="shrink-0 rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-700 transition hover:bg-red-500 hover:text-white dark:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {filePreviews.map((p) => {
                      const previewKey = `${p.file.name}::${p.file.size}::${p.file.lastModified}`;
                      const parsed = parsedPreviews[previewKey];
                      if (p.isImage && p.url) {
                        return (
                        <div key={p.key} className="overflow-hidden rounded-lg border border-black/10 bg-black/5">
                          <img src={p.url} alt={p.file.name} className="h-20 w-full object-cover" />
                          <div className="truncate border-t border-black/10 px-2 py-1 text-[10px] text-muted-foreground">
                            {p.file.name}
                          </div>
                        </div>
                        );
                      }
                      if (parsed?.kind === "table") {
                        return (
                          <div key={p.key} className="overflow-hidden rounded-lg border border-black/10 bg-black/5 p-1">
                            <div className="max-h-20 overflow-auto rounded border border-black/10 bg-white/50 text-[9px] dark:bg-black/20">
                              <table className="w-full border-collapse">
                                <tbody>
                                  {parsed.rows.map((row, rowIdx) => (
                                    <tr key={`${p.key}-r-${rowIdx}`}>
                                      {row.map((cell, cellIdx) => (
                                        <td
                                          key={`${p.key}-c-${rowIdx}-${cellIdx}`}
                                          className="max-w-16 truncate border border-black/10 px-1 py-0.5"
                                        >
                                          {cell || "-"}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-1 truncate text-[10px] text-muted-foreground">{p.file.name}</div>
                          </div>
                        );
                      }
                      if (parsed?.kind === "text") {
                        return (
                          <div key={p.key} className="overflow-hidden rounded-lg border border-black/10 bg-black/5 p-2">
                            <div className="line-clamp-4 h-20 overflow-hidden text-[10px] text-muted-foreground">
                              {parsed.text}
                            </div>
                            <div className="mt-1 truncate text-[10px] text-muted-foreground">{p.file.name}</div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={p.key}
                          className="flex h-20 flex-col items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-black/5 px-2 text-[10px] font-medium text-muted-foreground"
                          title={p.file.name}
                        >
                          <div>{p.label}</div>
                          <div className="mt-1 max-w-full truncate text-[9px]">{p.file.name}</div>
                          <div className="text-[9px]">{formatFileSize(p.file.size)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">No attachments selected.</div>
              )}
            </div>

            <div className="flex items-center justify-end">
              <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
                <button
                  type="submit"
                  disabled={
                    !canModify ||
                    isSubmitting ||
                    productId === "" ||
                    (categories.length > 0 && categoryId === "")
                  }
                  className="rounded-lg bg-[#0F5EA8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {isSubmitting ? "Creating..." : "Create Ticket"}
                </button>
              </InstantTooltip>
            </div>
          </form>
        )}
      </GlassCard>
    </div>
  );
}
