"use client";

import clsx from "clsx";
import { Button, Spinner } from "@tarodan/ui";
import { extractErrorMessage } from "@/lib/error";
import { useTranslations } from "next-intl";

export interface EmailPreviewData {
  subject: string;
  html: string;
  /** Şablon önizlemesinde çözülemeyen değişkenler; toplu bildirimde yoktur. */
  unresolvedVariables?: string[];
}

/**
 * Sunucunun render ettiği e-postanın canlı önizlemesi (konu + sandbox iframe).
 * Şablon düzenleyicisi ve toplu bildirim formu aynı bölmeyi kullanır; HTML'i
 * her zaman API üretir, istemci kendisi render etmez — önizleme gerçekte
 * gidenle aynıdır.
 */
export function EmailPreviewPane({
  preview,
  isPending,
  error,
  onRetry,
  className,
}: {
  preview?: EmailPreviewData;
  isPending: boolean;
  error?: unknown;
  onRetry: () => void;
  className?: string;
}) {
  const t = useTranslations();
  return (
    <div
      className={clsx(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-alt/20",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-elevated px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("admin.marketing.emailTemplates.preview")}
        </span>
        {isPending && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Spinner size="sm" className="h-3 w-3" /> {t("common.updating")}
          </span>
        )}
      </div>

      {error ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div>
            <p className="text-sm text-muted">
              {extractErrorMessage(
                error,
                t("admin.marketing.emailTemplates.previewFailed"),
              )}
            </p>
            <Button
              variant="secondary"
              type="button"
              onClick={onRetry}
              className="mt-3"
            >
              {t("common.tryAgain")}
            </Button>
          </div>
        </div>
      ) : preview ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border bg-surface-elevated px-4 py-2">
            <p className="text-xs text-muted">
              <span className="font-medium">
                {t("admin.marketing.emailTemplates.subject")}:
              </span>{" "}
              <span className="text-heading">
                {preview.subject ||
                  t("admin.marketing.emailTemplates.noSubject")}
              </span>
            </p>
            {preview.unresolvedVariables &&
              preview.unresolvedVariables.length > 0 && (
                <p className="mt-1 text-xs text-warning-700">
                  {t("admin.marketing.emailTemplates.unresolvedVariables", {
                    variables: preview.unresolvedVariables
                      .map((variable) => `{{${variable}}}`)
                      .join(", "),
                  })}
                </p>
              )}
          </div>
          <iframe
            key={preview.html.substring(0, 100)}
            srcDoc={preview.html}
            className="w-full flex-1 border-0"
            title={t("admin.marketing.emailTemplates.emailPreview")}
            sandbox="allow-same-origin allow-top-navigation-by-user-activation"
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="md" />
        </div>
      )}
    </div>
  );
}
