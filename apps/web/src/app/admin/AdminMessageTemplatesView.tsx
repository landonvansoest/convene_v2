"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
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

type MessageTemplatePatch = Partial<
  Pick<
    MessageTemplate,
    | "automation_label"
    | "automation_description"
    | "in_app_enabled"
    | "in_app_subject"
    | "in_app_body"
    | "email_enabled"
    | "email_subject"
    | "email_body"
    | "sms_enabled"
    | "sms_body"
    | "display_order"
  >
>;

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In-app",
  email: "Email",
  sms: "SMS",
};

function TemplateChannelBlock({
  title,
  enabled,
  onEnabledChange,
  subject,
  onSubjectBlur,
  body,
  onBodyBlur,
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
  onSubjectBlur?: (v: string) => void;
  body: string;
  onBodyBlur: (v: string) => void;
  bodyRows: number;
  bodyPlaceholder: string;
  subjectPlaceholder?: string;
  readOnly: boolean;
  wired: boolean;
}) {
  const hasSubject = onSubjectBlur != null;
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
          defaultValue={subject}
          disabled={!enabled || readOnly}
          className="mb-2 w-full rounded-md border border-[#003049]/15 bg-white px-2 py-1.5 text-xs text-[#003049] focus:border-[#003049]/40 focus:outline-none disabled:bg-muted/40"
          onBlur={(e) => onSubjectBlur?.(e.target.value)}
        />
      ) : null}
      <textarea
        placeholder={bodyPlaceholder}
        defaultValue={body}
        disabled={!enabled || readOnly}
        rows={bodyRows}
        className="w-full resize-y rounded-md border border-[#003049]/15 bg-white px-2 py-1.5 text-xs leading-relaxed text-[#003049]/90 focus:border-[#003049]/40 focus:outline-none disabled:bg-muted/40"
        onBlur={(e) => onBodyBlur(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
    </div>
  );
}

export function AdminMessageTemplatesView() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [catalog, setCatalog] = useState<AutomationCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
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
    setTemplates((data.templates as MessageTemplate[]) ?? []);
    setCatalog((data.catalog as AutomationCatalogEntry[]) ?? []);
    setMigrationRequired(Boolean(data.migrationRequired));
    setReadOnly(Boolean(data.readOnly));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyLocalPatch(templateId: string, patch: MessageTemplatePatch) {
    setTemplates((prev) => prev.map((t) => (t.template_id === templateId ? { ...t, ...patch } : t)));
  }

  async function patchTemplate(templateId: string, patch: MessageTemplatePatch) {
    if (Object.keys(patch).length === 0 || readOnly) return;
    setErr(null);
    applyLocalPatch(templateId, patch);
    const res = await fetch(`/api/admin/message-templates/${encodeURIComponent(templateId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Update failed");
      await load();
      return;
    }
    if (data.template) {
      const updated = data.template as MessageTemplate;
      setTemplates((prev) => prev.map((t) => (t.template_id === updated.template_id ? updated : t)));
    }
  }

  function catalogEntry(key: string) {
    return catalog.find((c) => c.automation_key === key);
  }

  const sorted = [...templates].sort(
    (a, b) => a.display_order - b.display_order || a.automation_label.localeCompare(b.automation_label),
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
              Each automation lists <strong>when it sends</strong>, which channels are wired in code, and the
              editable copy. Placeholders like{" "}
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
      <CardContent className="space-y-4">
        {migrationRequired ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Database migrations not applied — showing default copy below (read-only). Run{" "}
            <code className="text-xs">034_message_templates.sql</code> and{" "}
            <code className="text-xs">049_message_templates_expansion.sql</code> in Supabase, then refresh to
            save edits.
          </p>
        ) : null}

        {err ? <p className="text-sm text-destructive">{err}</p> : null}

        {!loading && sorted.length === 0 && !err ? (
          <p className="text-sm text-muted-foreground">No message templates found.</p>
        ) : null}

        {sorted.map((t) => {
          const meta = catalogEntry(t.automation_key);
          const when = t.automation_description || meta?.when_it_sends || "—";
          const wired = new Set(meta?.wired_channels ?? []);
          return (
            <div
              key={t.template_id}
              className="rounded-xl border border-[#003049]/15 bg-[#003049]/[0.02] p-4 md:p-5"
            >
              <div className="mb-4 space-y-2 border-b border-[#003049]/10 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-[#003049]">{t.automation_label}</h3>
                  <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#003049]/60">
                    {t.automation_key}
                  </code>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#F77F00]">
                    When this sends
                  </p>
                  <textarea
                    defaultValue={when}
                    readOnly={readOnly}
                    rows={2}
                    className="mt-1 w-full resize-y rounded-md border border-[#003049]/10 bg-white px-2 py-1.5 text-sm leading-relaxed text-[#003049]/90 focus:border-[#003049]/30 focus:outline-none read-only:bg-muted/30"
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (!readOnly && next && next !== t.automation_description) {
                        void patchTemplate(t.template_id, { automation_description: next });
                      }
                    }}
                  />
                </div>
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
                  enabled={t.in_app_enabled}
                  onEnabledChange={(v) => void patchTemplate(t.template_id, { in_app_enabled: v })}
                  subject={t.in_app_subject}
                  onSubjectBlur={(next) => {
                    if (next !== t.in_app_subject) {
                      void patchTemplate(t.template_id, { in_app_subject: next });
                    }
                  }}
                  body={t.in_app_body}
                  onBodyBlur={(next) => {
                    if (next !== t.in_app_body) {
                      void patchTemplate(t.template_id, { in_app_body: next });
                    }
                  }}
                  bodyRows={5}
                  bodyPlaceholder="In-app body"
                  subjectPlaceholder="In-app subject"
                  readOnly={readOnly}
                  wired={wired.has("in_app")}
                />
                <TemplateChannelBlock
                  title="Email"
                  enabled={t.email_enabled}
                  onEnabledChange={(v) => void patchTemplate(t.template_id, { email_enabled: v })}
                  subject={t.email_subject}
                  onSubjectBlur={(next) => {
                    if (next !== t.email_subject) {
                      void patchTemplate(t.template_id, { email_subject: next });
                    }
                  }}
                  body={t.email_body}
                  onBodyBlur={(next) => {
                    if (next !== t.email_body) {
                      void patchTemplate(t.template_id, { email_body: next });
                    }
                  }}
                  bodyRows={8}
                  bodyPlaceholder="Email body"
                  subjectPlaceholder="Email subject"
                  readOnly={readOnly}
                  wired={wired.has("email")}
                />
                <TemplateChannelBlock
                  title="SMS"
                  enabled={t.sms_enabled}
                  onEnabledChange={(v) => void patchTemplate(t.template_id, { sms_enabled: v })}
                  body={t.sms_body}
                  onBodyBlur={(next) => {
                    if (next !== t.sms_body) {
                      void patchTemplate(t.template_id, { sms_body: next });
                    }
                  }}
                  bodyRows={4}
                  bodyPlaceholder="SMS body (≤ 160 chars ideal)"
                  readOnly={readOnly}
                  wired={wired.has("sms")}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
