"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type MessageTemplate = {
  template_id: string;
  automation_key: string;
  automation_label: string;
  automation_description: string;
  in_app_enabled: boolean;
  in_app_subject: string;
  in_app_body: string;
  email_enabled: boolean;
  email_subject: string;
  email_body: string;
  sms_enabled: boolean;
  sms_body: string;
  display_order: number;
  created_at: string | null;
  updated_at: string | null;
};

type AutomationCatalogEntry = {
  automation_key: string;
  automation_label: string;
  when_it_sends: string;
  wired_channels: ("in_app" | "email" | "sms")[];
  notes?: string;
};

type TemplateDraft = Pick<
  MessageTemplate,
  | "automation_description"
  | "in_app_enabled"
  | "in_app_subject"
  | "in_app_body"
  | "email_enabled"
  | "email_subject"
  | "email_body"
  | "sms_enabled"
  | "sms_body"
>;

type MessageTemplatePatch = Partial<TemplateDraft>;

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In-app",
  email: "Email",
  sms: "SMS",
};

function templateToDraft(t: MessageTemplate): TemplateDraft {
  return {
    automation_description: t.automation_description,
    in_app_enabled: t.in_app_enabled,
    in_app_subject: t.in_app_subject,
    in_app_body: t.in_app_body,
    email_enabled: t.email_enabled,
    email_subject: t.email_subject,
    email_body: t.email_body,
    sms_enabled: t.sms_enabled,
    sms_body: t.sms_body,
  };
}

function draftEqualsSaved(draft: TemplateDraft, saved: MessageTemplate): boolean {
  return (
    draft.automation_description === saved.automation_description &&
    draft.in_app_enabled === saved.in_app_enabled &&
    draft.in_app_subject === saved.in_app_subject &&
    draft.in_app_body === saved.in_app_body &&
    draft.email_enabled === saved.email_enabled &&
    draft.email_subject === saved.email_subject &&
    draft.email_body === saved.email_body &&
    draft.sms_enabled === saved.sms_enabled &&
    draft.sms_body === saved.sms_body
  );
}

function TemplateChannelBlock({
  title,
  enabled,
  onEnabledChange,
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  bodyRows,
  bodyPlaceholder,
  subjectPlaceholder,
  readOnly,
  wired,
}: {
  title: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  subject?: string;
  onSubjectChange?: (v: string) => void;
  body: string;
  onBodyChange: (v: string) => void;
  bodyRows: number;
  bodyPlaceholder: string;
  subjectPlaceholder?: string;
  readOnly: boolean;
  wired: boolean;
}) {
  const hasSubject = onSubjectChange != null;
  return (
    <div className="rounded-lg border border-[#003049]/15 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#003049]/80">
          {title}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            wired ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {wired ? "Live" : "Not wired"}
        </span>
      </div>
      <label className="mb-2 flex items-center gap-2 text-xs text-[#003049]/80">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-[#003049]/30 accent-[#F77F00]"
          checked={enabled}
          disabled={readOnly}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        Send on this channel
      </label>
      {hasSubject ? (
        <input
          type="text"
          placeholder={subjectPlaceholder ?? "Subject"}
          value={subject ?? ""}
          disabled={!enabled || readOnly}
          className="mb-2 w-full rounded-md border border-[#003049]/15 bg-white px-2 py-1.5 text-xs text-[#003049] focus:border-[#003049]/40 focus:outline-none disabled:bg-muted/40"
          onChange={(e) => onSubjectChange?.(e.target.value)}
        />
      ) : null}
      <textarea
        placeholder={bodyPlaceholder}
        value={body}
        disabled={!enabled || readOnly}
        rows={bodyRows}
        className="w-full resize-y rounded-md border border-[#003049]/15 bg-white px-2 py-1.5 text-xs leading-relaxed text-[#003049]/90 focus:border-[#003049]/40 focus:outline-none disabled:bg-muted/40"
        onChange={(e) => onBodyChange(e.target.value)}
      />
    </div>
  );
}

export function AdminMessageTemplatesView() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [catalog, setCatalog] = useState<AutomationCatalogEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TemplateDraft>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/admin/message-templates", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed to load templates");
      return;
    }
    const loaded = (data.templates as MessageTemplate[]) ?? [];
    setTemplates(loaded);
    const nextDrafts: Record<string, TemplateDraft> = {};
    for (const t of loaded) {
      nextDrafts[t.template_id] = templateToDraft(t);
    }
    setDrafts(nextDrafts);
    setCatalog((data.catalog as AutomationCatalogEntry[]) ?? []);
    setMigrationRequired(Boolean(data.migrationRequired));
    setReadOnly(Boolean(data.readOnly));
    setSavedId(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchTemplate(templateId: string, patch: MessageTemplatePatch) {
    if (Object.keys(patch).length === 0 || readOnly) return false;
    setErr(null);
    const res = await fetch(`/api/admin/message-templates/${encodeURIComponent(templateId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Update failed");
      await load();
      return false;
    }
    if (data.template) {
      const updated = data.template as MessageTemplate;
      setTemplates((prev) => prev.map((t) => (t.template_id === updated.template_id ? updated : t)));
      setDrafts((prev) => ({ ...prev, [updated.template_id]: templateToDraft(updated) }));
    }
    return true;
  }

  async function saveTemplate(templateId: string) {
    const draft = drafts[templateId];
    if (!draft || readOnly) return;
    setSavingId(templateId);
    setSavedId(null);
    const ok = await patchTemplate(templateId, draft);
    setSavingId(null);
    if (ok) {
      setSavedId(templateId);
      window.setTimeout(() => {
        setSavedId((current) => (current === templateId ? null : current));
      }, 2500);
    }
  }

  function updateDraft(templateId: string, patch: Partial<TemplateDraft>) {
    setDrafts((prev) => {
      const current = prev[templateId];
      if (!current) return prev;
      return { ...prev, [templateId]: { ...current, ...patch } };
    });
    setSavedId((current) => (current === templateId ? null : current));
  }

  function toggleExpanded(templateId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  }

  function catalogEntry(key: string) {
    return catalog.find((c) => c.automation_key === key);
  }

  const sorted = useMemo(
    () =>
      [...templates].sort(
        (a, b) => a.display_order - b.display_order || a.automation_label.localeCompare(b.automation_label),
      ),
    [templates],
  );

  return (
    <Card className="border-2 border-[#003049]/10 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-[#F77F00]" />
              <CardTitle className="text-lg text-[#003049]">Message Templates</CardTitle>
            </div>
            <CardDescription className="mt-1 max-w-3xl">
              Expand a template to edit copy and channels. Click <strong>Save</strong> on each template
              to persist changes. Placeholders like{" "}
              <code className="text-xs">{`{{recipient_name}}`}</code> are filled at send time.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[#003049] hover:bg-[#003049]/5"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </span>
            ) : (
              "Refresh"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {migrationRequired ? (
          <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Database migrations not applied — showing default copy below (read-only). Run{" "}
            <code className="text-xs">034_message_templates.sql</code> and{" "}
            <code className="text-xs">049_message_templates_expansion.sql</code> in Supabase, then refresh to
            save edits.
          </p>
        ) : null}

        {err ? <p className="mb-4 text-sm text-destructive">{err}</p> : null}

        {!loading && sorted.length === 0 && !err ? (
          <p className="text-sm text-muted-foreground">No message templates found.</p>
        ) : null}

        {sorted.map((t) => {
          const meta = catalogEntry(t.automation_key);
          const draft = drafts[t.template_id];
          if (!draft) return null;

          const expanded = expandedIds.has(t.template_id);
          const whenPreview =
            draft.automation_description.trim() || meta?.when_it_sends || "—";
          const wired = new Set(meta?.wired_channels ?? []);
          const isDirty = !draftEqualsSaved(draft, t);
          const isSaving = savingId === t.template_id;

          return (
            <div
              key={t.template_id}
              className="rounded-xl border border-[#003049]/15 bg-[#003049]/[0.02]"
            >
              <button
                type="button"
                className="flex w-full items-start gap-2 px-4 py-3 text-left md:px-5"
                onClick={() => toggleExpanded(t.template_id)}
                aria-expanded={expanded}
              >
                <ChevronDown
                  className={`mt-0.5 h-5 w-5 shrink-0 text-[#003049]/60 transition-transform duration-200 ${
                    expanded ? "" : "-rotate-90"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-[#003049]">{t.automation_label}</h3>
                    <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#003049]/60">
                      {t.automation_key}
                    </code>
                    {isDirty && !readOnly ? (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-[#F77F00]">
                        Unsaved
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-[#F77F00]">When this sends: </span>
                    {whenPreview}
                  </p>
                </div>
              </button>

              {expanded ? (
                <div className="border-t border-[#003049]/10 px-4 pb-4 pt-3 md:px-5 md:pb-5">
                  <div className="mb-4 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#F77F00]">
                      When this sends
                    </p>
                    <textarea
                      value={draft.automation_description}
                      readOnly={readOnly}
                      rows={2}
                      className="w-full resize-y rounded-md border border-[#003049]/10 bg-white px-2 py-1.5 text-sm leading-relaxed text-[#003049]/90 focus:border-[#003049]/30 focus:outline-none read-only:bg-muted/30"
                      onChange={(e) =>
                        updateDraft(t.template_id, { automation_description: e.target.value })
                      }
                    />
                    {meta?.notes ? (
                      <p className="text-xs text-muted-foreground">{meta.notes}</p>
                    ) : null}
                    {meta?.wired_channels?.length ? (
                      <p className="text-xs text-[#003049]/70">
                        Wired channels:{" "}
                        {meta.wired_channels.map((c) => CHANNEL_LABELS[c] ?? c).join(", ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <TemplateChannelBlock
                      title="In-app message"
                      enabled={draft.in_app_enabled}
                      onEnabledChange={(v) => updateDraft(t.template_id, { in_app_enabled: v })}
                      subject={draft.in_app_subject}
                      onSubjectChange={(v) => updateDraft(t.template_id, { in_app_subject: v })}
                      body={draft.in_app_body}
                      onBodyChange={(v) => updateDraft(t.template_id, { in_app_body: v })}
                      bodyRows={5}
                      bodyPlaceholder="In-app body"
                      subjectPlaceholder="In-app subject"
                      readOnly={readOnly}
                      wired={wired.has("in_app")}
                    />
                    <TemplateChannelBlock
                      title="Email"
                      enabled={draft.email_enabled}
                      onEnabledChange={(v) => updateDraft(t.template_id, { email_enabled: v })}
                      subject={draft.email_subject}
                      onSubjectChange={(v) => updateDraft(t.template_id, { email_subject: v })}
                      body={draft.email_body}
                      onBodyChange={(v) => updateDraft(t.template_id, { email_body: v })}
                      bodyRows={8}
                      bodyPlaceholder="Email body"
                      subjectPlaceholder="Email subject"
                      readOnly={readOnly}
                      wired={wired.has("email")}
                    />
                    <TemplateChannelBlock
                      title="SMS"
                      enabled={draft.sms_enabled}
                      onEnabledChange={(v) => updateDraft(t.template_id, { sms_enabled: v })}
                      body={draft.sms_body}
                      onBodyChange={(v) => updateDraft(t.template_id, { sms_body: v })}
                      bodyRows={4}
                      bodyPlaceholder="SMS body (≤ 160 chars ideal)"
                      readOnly={readOnly}
                      wired={wired.has("sms")}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-3 border-t border-[#003049]/10 pt-4">
                    {savedId === t.template_id ? (
                      <span className="text-sm text-emerald-600">Saved</span>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                      disabled={readOnly || !isDirty || isSaving}
                      onClick={() => void saveTemplate(t.template_id)}
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
