"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@tarodan/ui";
import {
  FormInput,
  FormModal,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import {
  ArrowPathIcon,
  CheckIcon,
  PaperAirplaneIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { extractErrorMessage } from "@/lib/error";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import { sampleData } from "../_lib/sampleData";
import {
  emailTemplateEditorSchema,
  makeSourceData,
  type EmailTemplateEditorValues,
  type TemplateDetail,
} from "../_lib/types";
import { useTranslations } from "next-intl";

const EMPTY_FORM: EmailTemplateEditorValues = {
  name: "",
  subject: "",
  bodyHtml: "",
  testEmail: "",
};

export function EmailTemplateEditorModal({
  templateKey,
  onClose,
}: {
  templateKey: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const samples = sampleData(t);
  const confirm = useConfirm();
  const form = useZodForm(emailTemplateEditorSchema(t), {
    defaultValues: EMPTY_FORM,
  });
  const bodyHtml = form.watch("bodyHtml");
  const subject = form.watch("subject");
  const testEmail = form.watch("testEmail");

  const detailQuery = useQuery({
    queryKey: adminKeys.detail("email-templates", templateKey),
    queryFn: async () =>
      (await adminApi.getEmailTemplate(templateKey)).data as TemplateDetail,
  });

  const sourceQuery = useQuery({
    queryKey: adminKeys.preview("email-template-source", templateKey),
    queryFn: async () => {
      const sourceData = makeSourceData(samples[templateKey] || {});
      return (
        await adminApi.previewEmailTemplate(
          templateKey,
          sourceData as Record<string, any>,
        )
      ).data as { subject: string; html: string };
    },
    enabled: Boolean(detailQuery.data),
    staleTime: 5 * 60 * 1000,
  });

  const preview = useAdminMutation(
    async ({
      html,
      previewSubject,
    }: {
      html?: string;
      previewSubject?: string;
    }) =>
      (
        await adminApi.previewEmailTemplate(
          templateKey,
          samples[templateKey] || {},
          { html, subject: previewSubject },
        )
      ).data as { subject: string; html: string },
    { showErrorToast: false },
  );
  const mutatePreview = preview.mutate;

  const loadPreview = useCallback(
    (html?: string, previewSubject?: string) =>
      mutatePreview({ html, previewSubject }),
    [mutatePreview],
  );

  // Seed the form once per open. `sourceQuery` (the default template) may resolve
  // after `detailQuery`, so guard against a second reset that would discard edits
  // typed in the gap between the two loads.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    const detail = detailQuery.data;
    if (!detail) return;
    if (!detail.bodyHtml && !sourceQuery.data) return;
    seeded.current = true;
    form.reset({
      name: detail.name || templateKey,
      subject: detail.subject || "",
      bodyHtml: detail.bodyHtml || sourceQuery.data?.html || "",
      testEmail: form.getValues("testEmail"),
    });
  }, [detailQuery.data, sourceQuery.data, form, templateKey]);

  useEffect(() => {
    if (!detailQuery.isError) return;
    toast.error(
      extractErrorMessage(
        detailQuery.error,
        t("admin.marketing.emailTemplates.loadFailed"),
      ),
    );
    onClose();
  }, [detailQuery.error, detailQuery.isError, onClose, t]);

  useEffect(() => {
    if (!detailQuery.data) return;
    const timer = setTimeout(
      () => loadPreview(bodyHtml || undefined, subject || undefined),
      1200,
    );
    return () => clearTimeout(timer);
  }, [bodyHtml, subject, detailQuery.data, loadPreview]);

  const onTabKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    form.setValue(
      "bodyHtml",
      textarea.value.substring(0, start) + "  " + textarea.value.substring(end),
      { shouldDirty: true },
    );
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    });
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById(
      "html-editor",
    ) as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const insertion = `{{${variable}}}`;
    form.setValue(
      "bodyHtml",
      bodyHtml.substring(0, start) + insertion + bodyHtml.substring(end),
      { shouldDirty: true },
    );
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd =
        start + insertion.length;
      textarea.focus();
    });
  };

  const save = useAdminMutation(
    (values: EmailTemplateEditorValues) =>
      adminApi.updateEmailTemplate(templateKey, {
        name: values.name,
        subject: values.subject,
        bodyHtml: values.bodyHtml,
      }),
    {
      invalidates: ["email-templates"],
      successMessage: t("admin.marketing.emailTemplates.saved"),
      errorMessage: t("admin.marketing.emailTemplates.saveFailed"),
      onSuccess: () => loadPreview(bodyHtml || undefined, subject || undefined),
    },
  );

  const sendTest = useAdminMutation(
    (to: string) =>
      adminApi.sendTestEmail(templateKey, {
        to,
        templateData: samples[templateKey] || {},
      }),
    {
      successMessage: t("admin.marketing.emailTemplates.testQueued"),
      errorMessage: t("admin.marketing.emailTemplates.sendFailed"),
    },
  );

  const onSendTest = async () => {
    const valid = await form.trigger("testEmail");
    if (!valid || !testEmail.trim()) {
      if (!testEmail.trim())
        toast.error(t("admin.marketing.emailTemplates.enterEmail"));
      return;
    }
    sendTest.mutate(testEmail.trim());
  };

  const reset = useAdminMutation(
    () => adminApi.resetEmailTemplate(templateKey),
    {
      invalidates: ["email-templates"],
      successMessage: t("admin.marketing.emailTemplates.resetSuccess"),
      errorMessage: t("admin.marketing.emailTemplates.resetFailed"),
      onSuccess: () => {
        form.reset({
          name: detailQuery.data?.name || templateKey,
          subject: "",
          bodyHtml: sourceQuery.data?.html || "",
          testEmail,
        });
        loadPreview();
      },
    },
  );

  const onReset = async () => {
    await confirm({
      title: t("admin.marketing.emailTemplates.resetTitle"),
      description: t("admin.marketing.emailTemplates.resetConfirm"),
      confirmLabel: t("common.reset"),
      destructive: true,
      onConfirm: () => reset.mutateAsync(),
    });
  };

  const detail = detailQuery.data;
  const variables = (() => {
    if (detail?.variablesJson) {
      try {
        const parsed = JSON.parse(detail.variablesJson);
        if (typeof parsed === "object" && parsed !== null)
          return Object.keys(parsed);
      } catch {
        // Fall back to sample-data keys.
      }
    }
    return Object.keys(samples[templateKey] || {});
  })();

  return (
    <FormModal
      open
      onClose={onClose}
      title={detail?.name || templateKey}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      isSubmitting={save.isPending}
      submitLabel={t("common.save")}
      maxWidth="max-w-2xl"
      modalClassName="max-w-6xl"
      closeOnBackdrop={false}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-mono">{templateKey}</span>
        {detail?.isCustom && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-500/10 px-2 py-0.5 font-medium text-success-600">
            <CheckIcon className="h-3 w-3" />{" "}
            {t("admin.marketing.emailTemplates.custom")}
          </span>
        )}
      </div>

      <div className="grid h-[68vh] grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          {variables.length > 0 && (
            <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 p-3">
              <p className="mb-1.5 text-xs font-medium text-muted">
                {t("admin.marketing.emailTemplates.availableVariables")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((variable) => (
                  <Button
                    key={variable}
                    type="button"
                    variant="ghost"
                    onClick={() => insertVariable(variable)}
                    className="h-auto rounded bg-primary-500/10 px-1.5 py-0.5 font-mono text-xs text-primary-600 hover:bg-primary-500/20"
                  >
                    {`{{${variable}}}`}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <FormInput
            name="name"
            label={t("admin.marketing.emailTemplates.displayName")}
          />
          <FormInput
            name="subject"
            label={t("admin.marketing.emailTemplates.emailSubject")}
            placeholder={t.raw(
              "admin.marketing.emailTemplates.subjectPlaceholder",
            )}
          />

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">
                {t("admin.marketing.emailTemplates.htmlBody")}
              </span>
              <span className="text-xs text-subtle">
                {bodyHtml.length > 0
                  ? t("admin.marketing.emailTemplates.characterCount", {
                      count: bodyHtml.length,
                    })
                  : t("admin.marketing.emailTemplates.emptyUsesDefault")}
              </span>
            </div>
            <FormTextarea
              name="bodyHtml"
              bare
              id="html-editor"
              onKeyDown={onTabKey}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="min-h-[280px] flex-1 resize-none rounded-lg border border-border bg-heading p-3 font-mono text-xs leading-relaxed text-inverted"
            />
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <FormInput
              name="testEmail"
              type="email"
              label={t("admin.marketing.emailTemplates.testEmail")}
              placeholder="test@ornek.com"
              className="flex-1"
            />
            <Button
              variant="secondary"
              type="button"
              onClick={onSendTest}
              isLoading={sendTest.isPending}
              disabled={!testEmail.trim()}
              leftIcon={<PaperAirplaneIcon className="h-4 w-4" />}
            >
              {t("admin.marketing.emailTemplates.sendTest")}
            </Button>
            {detail?.isCustom && (
              <Button
                variant="secondary"
                type="button"
                onClick={onReset}
                isLoading={reset.isPending}
                leftIcon={<TrashIcon className="h-4 w-4" />}
                className="border-danger-300 text-danger-600 hover:bg-danger-50"
              >
                {t("admin.marketing.emailTemplates.resetTitle")}
              </Button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-alt/20">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-elevated px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t("admin.marketing.emailTemplates.preview")}
            </span>
            {preview.isPending && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <ArrowPathIcon className="h-3 w-3 animate-spin" />{" "}
                {t("common.updating")}
              </span>
            )}
          </div>

          {preview.isError ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm text-muted">
                  {extractErrorMessage(
                    preview.error,
                    t("admin.marketing.emailTemplates.previewFailed"),
                  )}
                </p>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() =>
                    loadPreview(bodyHtml || undefined, subject || undefined)
                  }
                  className="mt-3"
                >
                  {t("common.tryAgain")}
                </Button>
              </div>
            </div>
          ) : preview.data ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-border bg-surface-elevated px-4 py-2">
                <p className="text-xs text-muted">
                  <span className="font-medium">
                    {t("admin.marketing.emailTemplates.subject")}:
                  </span>{" "}
                  <span className="text-heading">
                    {preview.data.subject ||
                      t("admin.marketing.emailTemplates.noSubject")}
                  </span>
                </p>
              </div>
              <iframe
                key={preview.data.html.substring(0, 100)}
                srcDoc={preview.data.html}
                className="w-full flex-1 border-0"
                title={t("admin.marketing.emailTemplates.emailPreview")}
                sandbox="allow-same-origin allow-top-navigation-by-user-activation"
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <ArrowPathIcon className="h-6 w-6 animate-spin text-muted" />
            </div>
          )}
        </div>
      </div>
    </FormModal>
  );
}
