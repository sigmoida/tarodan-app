"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@tarodan/ui";
import {
  FormCheckbox,
  FormInput,
  FormModal,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import {
  predefinedPages,
  defaultContent,
  buildPreviewDoc,
  pageEditorSchema,
  type PredefinedSlug,
  type StaticPage,
  type EditorForm,
} from "../_lib/content";
import { useLocale, useTranslations } from "next-intl";

const EMPTY: EditorForm = {
  title: "",
  content: "",
  metaTitle: "",
  metaDescription: "",
  metaKeywords: "",
  isPublished: true,
};

function pageToForm(page: StaticPage): EditorForm {
  return {
    title: page.title,
    content: page.content ?? "",
    metaTitle: page.metaTitle ?? "",
    metaDescription: page.metaDescription ?? "",
    metaKeywords: page.metaKeywords ?? "",
    isPublished: page.isPublished,
  };
}

export function PageEditorModal({
  slug,
  existing,
  onClose,
}: {
  slug: PredefinedSlug;
  existing?: StaticPage;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pages = predefinedPages(t);
  const defaultsBySlug = defaultContent(t);
  const confirm = useConfirm();
  const meta = pages.find((page) => page.slug === slug)!;
  const defaults = existing
    ? pageToForm(existing)
    : {
        ...EMPTY,
        title: defaultsBySlug[slug].title,
        content: defaultsBySlug[slug].content,
      };
  const form = useZodForm(pageEditorSchema(t), { defaultValues: defaults });
  const [seoOpen, setSeoOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(() =>
    buildPreviewDoc(
      defaults.content,
      t("admin.marketing.pages.emptyContent"),
      locale,
    ),
  );
  const content = form.watch("content");

  const pageQuery = useQuery({
    queryKey: adminKeys.detail("pages", existing?.id ?? slug),
    queryFn: async () =>
      (await adminApi.getPageById(existing!.id)).data as StaticPage,
    enabled: Boolean(existing),
  });

  useEffect(() => {
    if (!pageQuery.data) return;
    form.reset(pageToForm(pageQuery.data));
  }, [pageQuery.data, form]);

  useEffect(() => {
    if (!pageQuery.isError) return;
    toast.error(t("admin.marketing.pages.loadFailed"));
    onClose();
  }, [pageQuery.isError, onClose, t]);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        setPreviewHtml(
          buildPreviewDoc(
            content,
            t("admin.marketing.pages.emptyContent"),
            locale,
          ),
        ),
      600,
    );
    return () => clearTimeout(timer);
  }, [content, locale, t]);

  const onTabKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    form.setValue(
      "content",
      textarea.value.substring(0, start) + "  " + textarea.value.substring(end),
      { shouldDirty: true, shouldValidate: true },
    );
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    });
  };

  const save = useAdminMutation(
    (values: EditorForm) =>
      existing
        ? adminApi.updatePage(existing.id, values)
        : adminApi.createPage({ slug, ...values }),
    {
      invalidates: ["pages"],
      successMessage: t("admin.marketing.pages.saved"),
      errorMessage: t("admin.marketing.pages.saveFailed"),
    },
  );

  const onReset = async () => {
    const ok = await confirm({
      title: t("admin.marketing.pages.resetTitle"),
      description: t("admin.marketing.pages.resetConfirm", {
        title: meta.title,
      }),
      confirmLabel: t("common.reset"),
      destructive: true,
    });
    if (!ok) return;
    const next = defaultsBySlug[slug];
    form.setValue("title", next.title, { shouldDirty: true });
    form.setValue("content", next.content, {
      shouldDirty: true,
      shouldValidate: true,
    });
    toast.success(t("admin.marketing.pages.defaultLoaded"));
  };

  return (
    <FormModal
      open
      onClose={onClose}
      title={meta.title}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      isSubmitting={save.isPending}
      submitLabel={t("common.save")}
      maxWidth="max-w-2xl"
      modalClassName="max-w-6xl"
      closeOnBackdrop={false}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-mono">{meta.url}</span>
        {existing?.isPublished && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-500/10 px-2 py-0.5 font-medium text-success-600">
            <GlobeAltIcon className="h-3 w-3" />{" "}
            {t("admin.marketing.pages.published")}
          </span>
        )}
      </div>

      <div className="grid h-[68vh] grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          <FormInput
            name="title"
            label={t("admin.marketing.pages.pageTitle")}
            placeholder={t("common.title")}
          />

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">
                {t("admin.marketing.pages.htmlContent")}
              </span>
              <span className="text-xs text-subtle">
                {content.length > 0
                  ? t("admin.marketing.pages.characterCount", {
                      count: content.length,
                    })
                  : t("admin.marketing.pages.empty")}
              </span>
            </div>
            <FormTextarea
              name="content"
              bare
              id="page-editor"
              onKeyDown={onTabKey}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="min-h-[300px] flex-1 resize-none rounded-lg border border-border bg-heading p-3 font-mono text-xs leading-relaxed text-inverted"
              placeholder={t("admin.marketing.pages.htmlPlaceholder")}
            />
            <p className="mt-1 text-xs text-subtle">
              {t("admin.marketing.pages.supportedTags")}
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSeoOpen((open) => !open)}
              className="h-auto w-full justify-between px-3 py-2.5 text-xs font-semibold text-muted"
            >
              <span>{t("admin.marketing.pages.seoSettings")}</span>
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform ${seoOpen ? "rotate-180" : ""}`}
              />
            </Button>
            {seoOpen && (
              <div className="space-y-3 border-t border-border p-3">
                <FormInput
                  name="metaTitle"
                  label={t("admin.marketing.pages.metaTitle")}
                  placeholder={t("admin.marketing.pages.metaTitlePlaceholder")}
                />
                <FormTextarea
                  name="metaDescription"
                  label={t("admin.marketing.pages.metaDescription")}
                  placeholder={t(
                    "admin.marketing.pages.metaDescriptionPlaceholder",
                  )}
                  rows={2}
                />
                <FormInput
                  name="metaKeywords"
                  label={t("admin.marketing.pages.keywords")}
                  placeholder="kelime1, kelime2, kelime3"
                />
              </div>
            )}
          </div>

          <FormCheckbox
            name="isPublished"
            label={t("admin.marketing.pages.publishedLabel")}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={onReset}
            leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            className="self-start border-danger-300 text-danger-600 hover:bg-danger-50"
          >
            {t("admin.marketing.pages.resetTitle")}
          </Button>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-alt/20">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-elevated px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t("admin.marketing.pages.preview")}
            </span>
            <span className="rounded bg-warning-500/10 px-1.5 py-0.5 text-xs text-warning-700">
              {t("admin.marketing.pages.live")}
            </span>
          </div>
          <iframe
            srcDoc={previewHtml}
            className="w-full flex-1 border-0 bg-surface-elevated"
            title={t("admin.marketing.pages.pagePreview")}
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </FormModal>
  );
}
