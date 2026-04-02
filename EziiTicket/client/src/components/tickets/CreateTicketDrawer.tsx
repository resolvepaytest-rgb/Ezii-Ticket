import { createTicket, listTicketFormCategories, listTicketFormProducts, uploadTicketAttachment, type TicketFormCategory, type TicketFormProduct } from "@api/ticketApi";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { CirclePlus, X } from "lucide-react";

type CreateTicketDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (ticketId: number) => void;
};

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".csv", ".docx"] as const;

export function CreateTicketDrawer({ open, onClose, onCreated }: CreateTicketDrawerProps) {
  type ReviewSnapshot = {
    productName: string;
    categoryName: string;
    subcategoryName: string;
    subject: string;
    description: string;
  };

  type DrawerState =
    | { step: 1 }
    | {
      step: 2;
      reviewSnapshot: ReviewSnapshot;
    };

  const [drawerState, setDrawerState] = useState<DrawerState>({ step: 1 });
  const step = drawerState.step;
  const reviewSnapshot = drawerState.step === 2 ? drawerState.reviewSnapshot : null;

  const [products, setProducts] = useState<TicketFormProduct[]>([]);
  const [categories, setCategories] = useState<TicketFormCategory[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);

  const [productId, setProductId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [subcategoryId, setSubcategoryId] = useState<number | "">("");

  // Track latest selection ids without relying on async state propagation timing.
  const latestProductIdRef = useRef<number | "">("");
  const latestCategoryIdRef = useRef<number | "">("");
  const latestSubcategoryIdRef = useRef<number | "">("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId]
  );
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );
  const selectedSubcategory = useMemo(
    () => selectedCategory?.subcategories.find((s) => s.id === subcategoryId) ?? null,
    [selectedCategory, subcategoryId]
  );

  const filePreviews = useMemo(() => {
    return pendingFiles.map((f, idx) => {
      const isImage = f.type.startsWith("image/");
      const ext = f.name.includes(".") ? f.name.split(".").pop() ?? "" : "";
      return {
        key: `${f.name}-${f.size}-${f.lastModified}-${idx}`,
        file: f,
        isImage,
        label: (ext || f.name).toUpperCase(),
        // Only create object URL for images; other files get a generic preview card.
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

  const resetAndClose = () => {
    setDrawerState({ step: 1 });
    setProducts([]);
    setCategories([]);
    setLoadingProducts(false);
    setLoadingCategories(false);
    setProductId("");
    setCategoryId("");
    setSubcategoryId("");
    latestProductIdRef.current = "";
    latestCategoryIdRef.current = "";
    latestSubcategoryIdRef.current = "";
    setSubject("");
    setDescription("");
    setPendingFiles([]);
    setIsDraggingFiles(false);
    setIsSubmitting(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProducts([]);
    setCategories([]);
    setLoadingProducts(true);
    setLoadingCategories(false);
    setProductId("");
    setCategoryId("");
    setSubcategoryId("");
    latestProductIdRef.current = "";
    latestCategoryIdRef.current = "";
    latestSubcategoryIdRef.current = "";
    setSubject("");
    setDescription("");
    setPendingFiles([]);
    setIsDraggingFiles(false);
    setDrawerState({ step: 1 });
    void listTicketFormProducts()
      .then((data) => {
        if (cancelled) return;
        setProducts(data);
        if (data.length > 0) {
          setProductId((prev) => {
            if (prev !== "") return prev;
            latestProductIdRef.current = data[0]!.id;
            return data[0]!.id;
          });
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load products");
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (productId === "") {
      return;
    }

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCategories(true);
    setCategoryId("");
    setSubcategoryId("");
    latestCategoryIdRef.current = "";
    latestSubcategoryIdRef.current = "";
    void listTicketFormCategories(productId)
      .then((data) => {
        if (cancelled) return;
        setCategories(data);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Failed to load categories");
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, productId]);

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

  const canContinue = useMemo(() => {
    if (productId === "" || loadingCategories) return false; // Add loading check
    if (categoryId === "") return false;
    if (!subject.trim()) return false;
    if (description.trim().length < 20) return false;
    return true;
  }, [productId, categoryId, loadingCategories, subject, description]);

  const onContinueToReview = () => {
    const pid = latestProductIdRef.current;
    const cid = latestCategoryIdRef.current;
    const sid = latestSubcategoryIdRef.current;

    if (pid === "") {
      toast.error("Select a product");
      return;
    }
    if (cid === "") {
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

    const selectedProd = products.find((p) => p.id === pid);
    const selectedCat = categories.find((c) => c.id === cid);
    const selectedSub = selectedCat?.subcategories.find((s) => s.id === sid);

    const productName = selectedProd?.name ?? "-";
    const categoryName = selectedCat?.name ?? "-";
    const subcategoryName = selectedSub?.name ?? "-";

    setDrawerState({
      step: 2,
      reviewSnapshot: {
        productName,
        categoryName,
        subcategoryName,
        subject: subject.trim(),
        description: description.trim(),
      },
    });
  };

  const onCreateTicket = async () => {
    if (productId === "") {
      toast.error("Select a product");
      return;
    }
    if (categoryId === "") {
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
        category_id: categoryId,
        subcategory_id: subcategoryId === "" ? null : subcategoryId,
        subject: subject.trim(),
        description: description.trim(),
        channel: "portal",
        metadata_json: { source: "portal_raise_ticket" },
      });

      if (pendingFiles.length > 0) {
        for (const f of pendingFiles) {
          try {
            await uploadTicketAttachment(created.id, f);
          } catch (upErr) {
            toast.error(upErr instanceof Error ? upErr.message : "Attachment upload failed");
            break;
          }
        }
      }

      toast.success(`Ticket created: ${created.ticket_code}`);
      onCreated?.(created.id);
      resetAndClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create ticket");
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={resetAndClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="fixed right-0 top-0 z-50 flex h-svh w-full max-w-xl flex-col bg-background/95 shadow-xl backdrop-blur-xl dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 p-4">
          <div>
            <div className="text-base font-semibold">Create Ticket</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {step === 1 ? "Enter details and attachments" : "Review and create"}
            </div>
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={resetAndClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/5 transition hover:bg-white/10 hover:shadow-sm dark:hover:bg-white/[0.08]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loadingProducts ? (
            <div className="mt-6">
              <Loader label="Loading products..." />
            </div>
          ) : products.length === 0 ? (
            <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
              No products are enabled for your organisation. Contact your administrator.
            </div>
          ) : step === 1 ? (
            <GlassCard className="p-4">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  onContinueToReview();
                }}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-sm">
                    <div className="mb-1 text-xs text-muted-foreground">Product</div>
                    <select
                      value={productId === "" ? "" : String(productId)}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : "";
                        setProductId(v);
                        latestProductIdRef.current = v;
                      }}
                      className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 dark:border-white/10"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.default_ticket_prefix})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-xs text-muted-foreground">Category</div>
                    {loadingCategories ? (
                      <div className="mt-1 text-xs text-muted-foreground">Loading categories…</div>
                    ) : (
                      <select
                        value={categoryId === "" ? "" : String(categoryId)}
                        onChange={(e) => {
                          const v = e.target.value;
                          const nextCategoryId = v ? Number(v) : "";
                          setCategoryId(nextCategoryId);
                          latestCategoryIdRef.current = nextCategoryId;
                          setSubcategoryId("");
                          latestSubcategoryIdRef.current = "";
                        }}
                        className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 dark:border-white/10"
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

                  <label className="text-sm md:col-span-2">
                    <div className="mb-1 text-xs text-muted-foreground">Sub-category (optional)</div>
                    <select
                      value={subcategoryId === "" ? "" : String(subcategoryId)}
                      onChange={(e) => {
                        const v = e.target.value;
                        const nextSubcategoryId = v ? Number(v) : "";
                        setSubcategoryId(nextSubcategoryId);
                        latestSubcategoryIdRef.current = nextSubcategoryId;
                      }}
                      disabled={categoryId === "" || !selectedCategory?.subcategories?.length}
                      className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 disabled:opacity-50 dark:border-white/10"
                    >
                      <option value="">— Select sub-category —</option>
                      {(selectedCategory?.subcategories ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block text-sm">
                  <div className="mb-1 text-xs text-muted-foreground">Subject</div>
                  <input
                    type="text"
                    maxLength={200}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 dark:border-white/10"
                    placeholder="Brief summary of the issue"
                  />
                </label>

                <label className="block text-sm">
                  <div className="mb-1 text-xs text-muted-foreground">Description</div>
                  <textarea
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-black/10 bg-white/5 px-3 py-2 dark:border-white/10"
                    placeholder="Provide detailed context (minimum 20 characters)"
                  />
                </label>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Attachments (optional)</div>

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
                    <div className="text-sm font-medium">Tap to upload or drag-and-drop</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Max 10 files, 20 MB each. Supported: PDF, JPG, PNG, XLSX, CSV, DOCX.
                    </div>
                  </label>

                  {pendingFiles.length > 0 ? (
                    <div className="rounded-xl border border-black/10 bg-white/5 p-3">
                      <div className="mb-2 text-xs text-muted-foreground">
                        {pendingFiles.length} attachment(s) selected
                      </div>
                      <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                        {pendingFiles.map((f, idx) => (
                          <div key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2">
                            <div className="min-w-0 truncate text-xs">{f.name}</div>
                            <button
                              type="button"
                              onClick={() => removePendingFileAt(idx)}
                              className="shrink-0 rounded-lg border border-black/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/10"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {filePreviews.map((p) =>
                          p.isImage && p.url ? (
                            <div key={p.key} className="overflow-hidden rounded-lg border border-black/10 bg-black/5">
                              <img src={p.url} alt={p.label} className="h-20 w-full object-cover" />
                            </div>
                          ) : (
                            <div
                              key={p.key}
                              className="flex h-20 flex-col items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-black/5 px-1 text-[10px] font-medium text-muted-foreground"
                              title={p.file.name}
                            >
                              {p.label}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No attachments selected.</div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="rounded-lg border border-black/10 bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-white/5"
                  >
                    Cancel / Discard
                  </button>

                  <button
                    type="submit"
                    disabled={!canContinue}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F5EA8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Continue & Review <CirclePlus className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </GlassCard>
          ) : (
            <GlassCard className="p-4">
              <div className="space-y-4">
                <div className="rounded-xl border border-black/10 bg-white/5 p-3">
                  <div className="text-xs text-muted-foreground">Review</div>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <div className="text-muted-foreground">Product</div>
                      <div className="font-medium">{selectedProduct?.name || "-"}</div>
                    </div>
                    <div className="flex justify-between gap-3">
                      <div className="text-muted-foreground">Category</div>
                      <div className="font-medium">{selectedCategory?.name || "-"}</div>
                    </div>
                    <div className="flex justify-between gap-3">
                      <div className="text-muted-foreground">Sub-category</div>
                      <div className="font-medium">
                        {selectedSubcategory?.name || "-"}
                      </div>
                    </div>
                    <div className="flex justify-between gap-3">
                      <div className="text-muted-foreground">Subject</div>
                      <div className="font-medium">
                        {reviewSnapshot?.subject || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Description</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm">
                        {reviewSnapshot?.description || "-"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-white/5 p-3">
                  <div className="text-xs text-muted-foreground">Attachments</div>
                  {pendingFiles.length === 0 ? (
                    <div className="mt-2 text-sm text-muted-foreground">No attachments.</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {filePreviews.map((p) =>
                          p.isImage && p.url ? (
                            <div
                              key={p.key}
                              className="overflow-hidden rounded-lg border border-black/10 bg-black/5"
                            >
                              <img src={p.url} alt={p.label} className="h-16 w-full object-cover" />
                            </div>
                          ) : (
                            <div
                              key={p.key}
                              className="flex h-16 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-black/5 px-1 text-[10px] font-medium text-muted-foreground"
                              title={p.file.name}
                            >
                              {p.label || "FILE"}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDrawerState({ step: 1 })}
                      disabled={isSubmitting}
                      className="rounded-lg border border-black/10 bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-white/5 hover:shadow-sm disabled:opacity-60"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={resetAndClose}
                      disabled={isSubmitting}
                      className="rounded-lg border border-black/10 bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-white/5 hover:shadow-sm disabled:opacity-60"
                    >
                      Cancel / Discard
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onCreateTicket()}
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F5EA8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isSubmitting ? "Creating..." : "Create Ticket"}
                  </button>
                </div>

                {isSubmitting ? (
                  <div className="mt-2">
                    <Loader label="Creating ticket and uploading attachments..." size="sm" />
                  </div>
                ) : null}
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </>
  );
}

