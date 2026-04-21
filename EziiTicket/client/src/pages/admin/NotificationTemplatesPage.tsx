import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { InstantTooltip } from "@components/common/InstantTooltip";
import { SwitchToggle } from "@components/common/SwitchToggle";
import { useScreenModifyAccess } from "@hooks/useScreenModifyAccess";
import {
  createNotificationTemplate,
  listNotificationTemplates,
  updateNotificationTemplate,
  type NotificationTemplate,
} from "@api/adminApi";
import { Bell, ChevronDown, ChevronUp, Mail, Plus, RefreshCcw, X } from "lucide-react";
import { EmailBodyRichToolbar } from "./NotificationEmailBodyToolbar";
import { getDefaultNotificationTemplate } from "./notificationTemplateDefaults";
import { NotificationTemplatePreview } from "./NotificationTemplatePreview";

type TriggerDef = {
  key: string;
  label: string;
  description: string;
  recipients: string;
};

const TRIGGERS: TriggerDef[] = [
  { key: "ticket_created", label: "Ticket Created", description: "Sent to requester when a new ticket is submitted.", recipients: "Reporter, assigned agent" },
  { key: "agent_reply_added", label: "Agent Reply Added", description: "Notify requester about a new agent reply.", recipients: "Reporter" },
  { key: "customer_reply_added", label: "Customer Reply Added", description: "Notify assigned agent about customer response.", recipients: "Assigned agent" },
  { key: "ticket_status_changed", label: "Ticket Status Changed", description: "Triggered when ticket status changes.", recipients: "Reporter, agent" },
  { key: "sla_warning", label: "SLA Warning (75%)", description: "Triggered near SLA breach threshold.", recipients: "Agent, Team Lead" },
  { key: "sla_breached", label: "SLA Breached", description: "Triggered when SLA has been breached.", recipients: "Agent, Team Lead, Admin" },
  { key: "team_lead_no_assignee", label: "No Available Agent (Team Lead)", description: "When least-loaded routing finds no active agent (e.g. OOO or capacity).", recipients: "Team leads (or org team_lead role)" },
  { key: "ticket_escalated", label: "Ticket Escalated", description: "Triggered on escalation routing.", recipients: "Reporter, old agent, new agent" },
  { key: "ticket_resolved", label: "Ticket Resolved", description: "Triggered on ticket resolution.", recipients: "Reporter (with CSAT link)" },
  { key: "ticket_reopened", label: "Ticket Reopened", description: "Triggered when resolved ticket reopens.", recipients: "Agent, Team Lead" },
];

const PLACEHOLDERS: Array<{ token: string; label: string }> = [
  { token: "{{ticket_id}}", label: "Unique Reference" },
  { token: "{{customer_name}}", label: "Requester Name" },
  { token: "{{ticket_subject}}", label: "Thread Title" },
  { token: "{{agent_name}}", label: "Assignee Name" },
  { token: "{{product}}", label: "Product" },
  { token: "{{sla_deadline}}", label: "SLA Deadline" },
  { token: "{{priority}}", label: "Priority" },
  { token: "{{csat_link}}", label: "CSAT survey link" },
  { token: "{{latest_message}}", label: "Latest reply body" },
  { token: "{{ticket_url}}", label: "Ticket deep link" },
  { token: "{{recipient_name}}", label: "Recipient display name" },
  { token: "{{team_name}}", label: "Target team name" },
  { token: "{{context_label}}", label: "Ticket creation vs escalation" },
  { token: "{{ticket_code}}", label: "Human-readable ticket code" },
];

export function NotificationTemplatesPage({ orgId }: { orgId: string }) {
  const orgIdNum = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<NotificationTemplate[]>([]);
  const [selectedTrigger, setSelectedTrigger] = useState<string>("ticket_created");
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [triggersOpen, setTriggersOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [draft, setDraft] = useState({
    template_name: "",
    subject: "",
    body: "",
    channel_email: true,
    channel_in_app: false,
    is_active: true,
  });
  const [createDraft, setCreateDraft] = useState({
    template_name: "",
    trigger_event: "ticket_created",
    subject: "",
    body: "",
    enable: true,
  });
  const [createAttachedFiles, setCreateAttachedFiles] = useState<string[]>([]);
  const canModify = useScreenModifyAccess("notification_templates");
  const modifyAccessMessage = "You don't have modify access";
  const triggersDropdownRef = useRef<HTMLDivElement | null>(null);
  const variablesDropdownRef = useRef<HTMLDivElement | null>(null);
  const createEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const createFileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    if (!orgIdNum) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listNotificationTemplates(orgIdNum));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notification templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdNum]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggersDropdownRef.current && !triggersDropdownRef.current.contains(target)) {
        setTriggersOpen(false);
      }
      if (variablesDropdownRef.current && !variablesDropdownRef.current.contains(target)) {
        setVariablesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const templatesByTrigger = useMemo(() => {
    const map = new Map<string, NotificationTemplate[]>();
    for (const t of rows) {
      const arr = map.get(t.event_key) ?? [];
      arr.push(t);
      map.set(t.event_key, arr);
    }
    return map;
  }, [rows]);

  const selectedTemplates = templatesByTrigger.get(selectedTrigger) ?? [];
  const selectedEmail = selectedTemplates.find((t) => t.channel === "email") ?? null;
  const selectedInApp = selectedTemplates.find((t) => t.channel === "in_app") ?? null;

  useEffect(() => {
    const base = selectedEmail ?? selectedInApp;
    const defaults = getDefaultNotificationTemplate(selectedTrigger);
    const nameFromApi = base?.template_name?.trim() ?? "";
    const subjectFromApi = selectedEmail?.subject?.trim() ?? "";
    const bodyFromApi = base?.body?.trim() ?? "";
    setDraft({
      template_name: nameFromApi || defaults.template_name,
      subject: subjectFromApi || defaults.subject,
      body: bodyFromApi || defaults.body,
      channel_email: Boolean(selectedEmail),
      channel_in_app: Boolean(selectedInApp),
      is_active: base?.is_active ?? true,
    });
  }, [selectedEmail, selectedInApp, selectedTrigger]);

  function resetEditorToDefaults() {
    const defaults = getDefaultNotificationTemplate(selectedTrigger);
    setDraft((d) => ({
      ...d,
      template_name: defaults.template_name,
      subject: defaults.subject,
      body: defaults.body,
    }));
    toast.message("Editor reset", { description: "Restored default copy for this event. Save to persist." });
  }

  function onPickCreateAttachment() {
    createFileInputRef.current?.click();
  }

  function onCreateFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const names = files.map((f) => f.name);
    setCreateAttachedFiles((prev) => Array.from(new Set([...prev, ...names])));
    setCreateDraft((d) => ({
      ...d,
      body: `${d.body}${d.body ? "\n" : ""}${names.map((n) => `[Attachment: ${n}]`).join("\n")}`,
    }));
    e.target.value = "";
  }

  async function saveCurrent() {
    if (!orgIdNum) return;
    if (!draft.template_name.trim()) return toast.error("Template name is required");
    if (!draft.body.trim()) return toast.error("Email body is required");
    if (!draft.channel_email && !draft.channel_in_app) return toast.error("Select at least one delivery channel");
    setSaving(true);
    try {
      const channels = [
        ...(draft.channel_email ? (["email"] as const) : []),
        ...(draft.channel_in_app ? (["in_app"] as const) : []),
      ];
      for (const channel of channels) {
        const existing = selectedTemplates.find((t) => t.channel === channel) ?? null;
        if (existing) {
          await updateNotificationTemplate(existing.id, {
            template_name: draft.template_name.trim(),
            subject: channel === "email" ? draft.subject.trim() || null : null,
            body: draft.body,
            is_active: draft.is_active,
          });
        } else {
          await createNotificationTemplate({
            organisation_id: orgIdNum,
            event_key: selectedTrigger,
            channel,
            template_name: draft.template_name.trim(),
            subject: channel === "email" ? draft.subject.trim() || null : null,
            body: draft.body,
            is_active: draft.is_active,
          });
        }
      }
      const toDisable = selectedTemplates.filter((t) => !channels.includes(t.channel as "email" | "in_app"));
      for (const t of toDisable) {
        await updateNotificationTemplate(t.id, { is_active: false });
      }
      toast.success("Template saved.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateModalSave() {
    if (!orgIdNum) return;
    if (!createDraft.template_name.trim()) return toast.error("Template name is required");
    if (!createDraft.body.trim()) return toast.error("Email body is required");
    setSaving(true);
    try {
      await createNotificationTemplate({
        organisation_id: orgIdNum,
        event_key: createDraft.trigger_event,
        channel: "email",
        template_name: createDraft.template_name.trim(),
        subject: createDraft.subject.trim() || null,
        body: createDraft.body,
        is_active: createDraft.enable,
      });
      toast.success("Template created.");
      setCreateOpen(false);
      setSelectedTrigger(createDraft.trigger_event);
      setCreateDraft({
        template_name: "",
        trigger_event: "ticket_created",
        subject: "",
        body: "",
        enable: true,
      });
      setCreateAttachedFiles([]);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto min-w-0 max-w-[1300px] space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-slate-100">Notification Templates</h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Configure automated responses and delivery preferences across all system triggers.
          </p>
        </div>
        <div className="relative flex items-center gap-2">
          <div ref={triggersDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setTriggersOpen((v) => !v);
                setVariablesOpen(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
            >
              System Triggers
              {triggersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {triggersOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-[320px] rounded-xl border border-black/10 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#0f172a]">
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {TRIGGERS.map((t) => {
                    const active = selectedTrigger === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setSelectedTrigger(t.key);
                          setTriggersOpen(false);
                        }}
                        className={`w-full rounded-lg px-2.5 py-2 text-left ${
                          active ? "bg-[#1E88E5]/10 text-[#1E88E5]" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.08]"
                        }`}
                      >
                        <div className="text-xs font-semibold">{t.label}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-300">{t.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div ref={variablesDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setVariablesOpen((v) => !v);
                setTriggersOpen(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
            >
              Dynamic Variables
              {variablesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {variablesOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-[320px] rounded-xl border border-black/10 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#0f172a]">
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {PLACEHOLDERS.map((p) => (
                    <div key={p.token} className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-white/[0.06]">
                      <div className="font-mono text-[11px] text-[#1E88E5]">{p.token}</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">{p.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
            <button
              type="button"
              disabled={!canModify}
              onClick={() => {
                const d = getDefaultNotificationTemplate("ticket_created");
                setCreateDraft({
                  template_name: d.template_name,
                  trigger_event: "ticket_created",
                  subject: d.subject,
                  body: d.body,
                  enable: true,
                });
                setCreateAttachedFiles([]);
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#1E88E5] px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Create New Template
            </button>
          </InstantTooltip>
        </div>
      </div>

      {loading ? (
        <GlassCard className="p-6">
          <Loader className="min-h-[50vh]" label="Loading templates..." size="sm" />
        </GlassCard>
      ) : error ? (
        <GlassCard className="p-6">
          <div className="text-xs text-red-600 dark:text-red-300">{error}</div>
        </GlassCard>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4">
          <GlassCard className="min-w-0 overflow-hidden border-black/10 bg-white/75 p-0 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="min-w-0 space-y-4 overflow-x-hidden p-5">
                  <div className="flex flex-wrap items-center gap-4 rounded-xl border border-black/10 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#111827] dark:text-slate-100">
                      <SwitchToggle
                        className="scale-75 origin-left"
                        ariaLabel="Email delivery toggle"
                        checked={draft.channel_email}
                        onChange={(checked) => setDraft((d) => ({ ...d, channel_email: checked }))}
                      />
                      <Mail className="h-3.5 w-3.5 text-[#1E88E5]" />
                      EMAIL DELIVERY
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#111827] dark:text-slate-100">
                      <SwitchToggle
                        className="scale-75 origin-left"
                        ariaLabel="In-app push toggle"
                        checked={draft.channel_in_app}
                        onChange={(checked) => setDraft((d) => ({ ...d, channel_in_app: checked }))}
                      />
                      <Bell className="h-3.5 w-3.5 text-[#1E88E5]" />
                      IN-APP PUSH
                    </label>
                    <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                      MANDATORY
                    </span>
                  </div>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Template Name</span>
                    <input value={draft.template_name} onChange={(e) => setDraft((d) => ({ ...d, template_name: e.target.value }))} className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Subject Line</span>
                    <input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10" />
                  </label>

                  <div className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Email Body Preview</span>
                    <NotificationTemplatePreview
                      subject={draft.subject}
                      body={draft.body}
                      onChangeSubject={(next: string) => setDraft((d) => ({ ...d, subject: next }))}
                      onChangeBody={(next: string) => setDraft((d) => ({ ...d, body: next }))}
                      insertOptions={PLACEHOLDERS}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={resetEditorToDefaults}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-300"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                      Reset to Default
                    </button>
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded-xl border border-black/10 bg-white/80 px-4 py-2 text-xs font-semibold dark:border-white/15 dark:bg-white/10">Send Test Email</button>
                      <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
                        <button type="button" onClick={() => void saveCurrent()} disabled={!canModify || saving} className="rounded-xl bg-[#1E88E5] px-5 py-2 text-xs font-semibold text-white disabled:opacity-60">
                          {saving ? "Saving..." : "Save Template"}
                        </button>
                      </InstantTooltip>
                    </div>
                  </div>
            </div>
          </GlassCard>
        </div>
      )}

      {createOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
                <div>
                  <div className="text-xl font-semibold text-[#111827] dark:text-slate-100">Create New Template</div>
                  <div className="text-xs text-slate-500 dark:text-slate-300">Define logic and content for system-triggered notifications.</div>
                </div>
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Template Name</span>
                  <input value={createDraft.template_name} onChange={(e) => setCreateDraft((d) => ({ ...d, template_name: e.target.value }))} placeholder="e.g. Critical Ticket Alert" className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Trigger Event</span>
                  <select
                    value={createDraft.trigger_event}
                    onChange={(e) => {
                      const key = e.target.value;
                      const d = getDefaultNotificationTemplate(key);
                      setCreateDraft({
                        template_name: d.template_name,
                        trigger_event: key,
                        subject: d.subject,
                        body: d.body,
                        enable: true,
                      });
                    }}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  >
                    {TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Subject Line</span>
                  <input value={createDraft.subject} onChange={(e) => setCreateDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="Notification: {{ticket_id}} requires attention" className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10" />
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Email Body</span>
                    <div className="flex flex-wrap items-center gap-1">
                      {["{{ticket_id}}", "{{user_name}}", "{{priority}}"].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCreateDraft((d) => ({ ...d, body: `${d.body}${d.body ? " " : ""}${p}` }))}
                          className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-black/10 bg-white/85 dark:border-white/15 dark:bg-white/10">
                    <EmailBodyRichToolbar
                      compact
                      body={createDraft.body}
                      setBody={(next) => setCreateDraft((d) => ({ ...d, body: next }))}
                      editorRef={createEditorRef}
                      fileInputRef={createFileInputRef}
                      onPickAttachment={onPickCreateAttachment}
                      onFilesSelected={onCreateFilesSelected}
                    />
                    <textarea
                      ref={createEditorRef}
                      value={createDraft.body}
                      onChange={(e) => setCreateDraft((d) => ({ ...d, body: e.target.value }))}
                      rows={8}
                      placeholder="Hi {{user_name}}, ticket {{ticket_id}} has been updated..."
                      className="min-h-[160px] w-full resize-y bg-transparent px-3 py-2 text-xs outline-none"
                    />
                  </div>
                </label>
                {createAttachedFiles.length > 0 ? (
                  <div className="md:col-span-2 flex flex-wrap items-center gap-1.5">
                    {createAttachedFiles.map((file) => (
                      <span key={file} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200">
                        {file}
                      </span>
                    ))}
                  </div>
                ) : null}
                <label className="md:col-span-2 flex items-center justify-between rounded-xl border border-black/10 bg-white/80 px-3 py-2 dark:border-white/15 dark:bg-white/10">
                  <div>
                    <div className="text-xs font-semibold text-[#111827] dark:text-slate-100">Enable Notification</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-300">Activate this template immediately upon saving</div>
                  </div>
                  <input type="checkbox" checked={createDraft.enable} onChange={(e) => setCreateDraft((d) => ({ ...d, enable: e.target.checked }))} className="h-5 w-5 accent-[#1E88E5]" />
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-6 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Cancel</button>
                <InstantTooltip disabled={!canModify} message={modifyAccessMessage}>
                  <button type="button" onClick={() => void handleCreateModalSave()} disabled={!canModify || saving} className="rounded-lg bg-[#1E88E5] px-5 py-2 text-xs font-semibold text-white disabled:opacity-60">
                    {saving ? "Saving..." : "Save Template"}
                  </button>
                </InstantTooltip>
              </div>
            </div>
          </div>,
          document.body
        ) : null}
    </div>
  );
}

