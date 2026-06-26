"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TEMPLATE_FALLBACKS } from "@/lib/notifications/message-templates";
import {
  TEMPLATE_VARIABLE_REFERENCE,
  variablesForAutomation,
} from "@/lib/notifications/template-variable-reference";

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
  email_cta_url: string;
  email_cta_label: string;
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
  | "email_cta_url"
  | "email_cta_label"
  | "sms_enabled"
  | "sms_body"
>;

type MessageTemplatePatch = Partial<TemplateDraft>;

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In-app",
  email: "Email",
  sms: "SMS",
};

function effectiveEmailCta(
  automationKey: string,
  ctaUrl: string,
  ctaLabel: string,
): { url: string; label: string } {
  const fb = TEMPLATE_FALLBACKS[automationKey];
  return {
    url: ctaUrl.trim() || fb?.email_cta_url?.trim() || "",
    label: ctaLabel.trim() || fb?.email_cta_label?.trim() || "",
  };
}

function templateToDraft(t: MessageTemplate): TemplateDraft {
  const cta = effectiveEmailCta(t.automation_key, t.email_cta_url ?? "", t.email_cta_label ?? "");
  return {
    automation_description: t.automation_description,
    in_app_enabled: t.in_app_enabled,
    in_app_subject: t.in_app_subject,
    in_app_body: t.in_app_body,
    email_enabled: t.email_enabled,
    email_subject: t.email_subject,
    email_body: t.email_body,
    email_cta_url: cta.url,
    email_cta_label: cta.label,
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
    draft.email_cta_url === (saved.email_cta_url ?? "") &&
    draft.email_cta_label === (saved.email_cta_label ?? "") &&
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
  onPreviewEmail,
  previewBusy,
  ctaUrl,
  ctaLabel,
  onCtaUrlChange,
  onCtaLabelChange,
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
  onPreviewEmail?: () => void | Promise<void>;
  previewBusy?: boolean;
  ctaUrl?: string;
  ctaLabel?: string;
  onCtaUrlChange?: (v: string) => void;
  onCtaLabelChange?: (v: string) => void;
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
      {onCtaUrlChange && onCtaLabelChange ? (
        <div className="mt-2 space-y-2 rounded-md border border-dashed border-[#003049]/15 bg-[#003049]/[0.02] p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#003049]/65">
            Email button (optional)
          </p>
          <input
            type="text"
            placeholder="Button label, e.g. Join session"
            value={ctaLabel ?? ""}
            disabled={!enabled || readOnly}
            className="w-full rounded-md border border-[#003049]/15 bg-white px-2 py-1.5 text-xs text-[#003049] focus:border-[#003049]/40 focus:outline-none disabled:bg-muted/40"
            onChange={(e) => onCtaLabelChange(e.target.value)}
          />
          <input
            type="text"
            placeholder="Button URL, e.g. {{session_link}}"
            value={ctaUrl ?? ""}
            disabled={!enabled || readOnly}
            className="w-full rounded-md border border-[#003049]/15 bg-white px-2 py-1.5 text-xs text-[#003049] focus:border-[#003049]/40 focus:outline-none disabled:bg-muted/40"
            onChange={(e) => onCtaUrlChange(e.target.value)}
          />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Both fields required to show the button. Supports {"{{variables}}"} like the body.
          </p>
        </div>
      ) : null}
      {onPreviewEmail ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-8 border-[#003049]/20 text-xs"
          disabled={!enabled || previewBusy}
          onClick={() => void onPreviewEmail()}
        >
          {previewBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Preview email layout
        </Button>
      ) : null}
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
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewBusyId, setPreviewBusyId] = useState<string | null>(null);
  const [showVarReference, setShowVarReference] = useState(false);

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

  async function previewEmail(templateId: string) {
    const draft = drafts[templateId];
    const template = templates.find((t) => t.template_id === templateId);
    if (!draft?.email_body.trim() || !template) return;
    const cta = effectiveEmailCta(
      template.automation_key,
      draft.email_cta_url,
      draft.email_cta_label,
    );
    setPreviewBusyId(templateId);
    setErr(null);
    try {
      const res = await fetch("/api/admin/message-templates/preview-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_subject: draft.email_subject,
          email_body: draft.email_body,
          email_cta_url: cta.url,
          email_cta_label: cta.label,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Email preview failed");
        return;
      }
      setPreviewSubject(typeof data.subject === "string" ? data.subject : "Convene email preview");
      setPreviewHtml(typeof data.html === "string" ? data.html : null);
    } finally {
      setPreviewBusyId(null);
    }
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
              <code className="text-xs">{`{{recipient_name}}`}</code> are filled at send time — see the{" "}
              <button
                type="button"
                className="text-[#F77F00] underline underline-offset-2 hover:text-[#F77F00]/80"
                onClick={() => setShowVarReference((v) => !v)}
              >
                variable reference
              </button>{" "}
              for the full list.
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
        {showVarReference ? (
          <div className="mb-4 overflow-hidden rounded-xl border border-[#003049]/15 bg-white">
            <div className="flex items-center justify-between border-b border-[#003049]/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#003049]">Template variable reference</p>
                <p className="text-xs text-muted-foreground">
                  Use double braces in copy, e.g.{" "}
                  <code className="text-[11px]">{`{{session_fee}}`}</code>. Email buttons need both URL
                  and label; dashboard Booked Sessions ={" "}
                  <code className="text-[11px]">{`{{bookings_url}}`}</code> (
                  <code className="text-[11px]">/dashboard?view=sessions</code>).
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowVarReference(false)}
              >
                Hide
              </Button>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="sticky top-0 bg-[#003049]/[0.04] text-[10px] uppercase tracking-wide text-[#003049]/70">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Variable</th>
                    <th className="px-4 py-2 font-semibold">Description</th>
                    <th className="px-4 py-2 font-semibold">Example</th>
                    <th className="px-4 py-2 font-semibold">Automations</th>
                  </tr>
                </thead>
                <tbody>
                  {TEMPLATE_VARIABLE_REFERENCE.map((v) => (
                    <tr key={v.key} className="border-t border-[#003049]/8 align-top">
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-[#003049]">
                        {`{{${v.key}}}`}
                      </td>
                      <td className="px-4 py-2 text-[#003049]/85">{v.description}</td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-[10px] text-muted-foreground">
                        {v.example}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {v.automations.includes("*") ? "All" : v.automations.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

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
                    <div className="rounded-md border border-[#003049]/10 bg-white/80 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#003049]/60">
                        Variables for this template
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[#003049]/80">
                        {variablesForAutomation(t.automation_key)
                          .map((v) => `{{${v.key}}}`)
                          .join(", ")}
                      </p>
                    </div>
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
                      bodyPlaceholder="Plain text only — layout, logo, and footer are added automatically."
                      subjectPlaceholder="Email subject"
                      readOnly={readOnly}
                      wired={wired.has("email")}
                      ctaUrl={draft.email_cta_url}
                      ctaLabel={draft.email_cta_label}
                      onCtaUrlChange={(v) => updateDraft(t.template_id, { email_cta_url: v })}
                      onCtaLabelChange={(v) => updateDraft(t.template_id, { email_cta_label: v })}
                      onPreviewEmail={() => previewEmail(t.template_id)}
                      previewBusy={previewBusyId === t.template_id}
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
      {previewHtml ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#003049]/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#003049]">Email preview</p>
                <p className="text-xs text-muted-foreground">{previewSubject}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setPreviewHtml(null)}>
                Close
              </Button>
            </div>
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              className="min-h-[480px] w-full flex-1 border-0 bg-[#ECECEC]"
            />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
