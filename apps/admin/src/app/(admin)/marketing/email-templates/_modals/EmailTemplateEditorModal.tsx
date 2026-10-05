"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button } from "@tarodan/ui";
import { FormInput, FormModal, useZodForm } from "@tarodan/ui/form";
import { PaperAirplaneIcon, TrashIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { extractErrorMessage } from "@/lib/error";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import { Panel } from "@/components/detail/Panel";
import { EmailHtmlEditor } from "@/components/email/EmailHtmlEditor";
import { EmailPreviewPane } from "@/components/email/EmailPreviewPane";
import { sampleData } from "../_lib/sampleData";
import {
  emailTemplateEditorSchema,
  makeSourceData,
  type EmailTemplateEditorValues,
  type TemplateDetail,
  type TemplatePreview,
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
      ).data as TemplatePreview;
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
      ).data as TemplatePreview,
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
      subject: detail.subject || sourceQuery.data?.subject || "",
      bodyHtml: detail.bodyHtml || sourceQuery.data?.bodyHtml || "",
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
        overrideHtml: bodyHtml,
        overrideSubject: subject,
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
          subject: sourceQuery.data?.subject || "",
          bodyHtml: sourceQuery.data?.bodyHtml || "",
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
    const discovered = new Set<string>(Object.keys(samples[templateKey] || {}));
    const source = `${sourceQuery.data?.subject || ""}\n${sourceQuery.data?.bodyHtml || ""}`;
    for (const match of source.matchAll(/\{\{([\w.]+)\}\}/g)) {
      discovered.add(match[1]);
    }

    if (detail?.variablesJson) {
      try {
        const parsed = JSON.parse(detail.variablesJson);
        if (Array.isArray(parsed)) {
          for (const value of parsed) {
            if (typeof value === "string") discovered.add(value);
          }
        } else if (typeof parsed === "object" && parsed !== null) {
          for (const value of Object.keys(parsed)) discovered.add(value);
        }
      } catch {
        // The source and sample variables above still remain available.
      }
    }
    return Array.from(discovered).sort();
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
      size="wide"
      closeOnBackdrop={false}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-mono">{templateKey}</span>
        {detail?.isCustom && (
          <Badge variant="success" size="sm">
            {t("admin.marketing.emailTemplates.custom")}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:h-[68vh] lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
          {variables.length > 0 && (
            <Panel tone="muted" padding="sm">
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
            </Panel>
          )}

          <FormInput
            name="name"
            label={t("admin.marketing.emailTemplates.displayName")}
            placeholder={t(
              "admin.marketing.emailTemplates.displayNamePlaceholder",
            )}
          />
          <FormInput
            name="subject"
            label={t("admin.marketing.emailTemplates.emailSubject")}
            placeholder={t.raw(
              "admin.marketing.emailTemplates.subjectPlaceholder",
            )}
          />

          <EmailHtmlEditor
            name="bodyHtml"
            id="html-editor"
            emptyHint={t("admin.marketing.emailTemplates.emptyUsesDefault")}
            placeholder={t(
              "admin.marketing.emailTemplates.htmlBodyPlaceholder",
            )}
          />

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

        <EmailPreviewPane
          preview={preview.data}
          isPending={preview.isPending}
          error={preview.isError ? preview.error : undefined}
          onRetry={() =>
            loadPreview(bodyHtml || undefined, subject || undefined)
          }
        />
      </div>
    </FormModal>
  );
}
