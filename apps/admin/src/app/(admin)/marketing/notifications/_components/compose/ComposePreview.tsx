"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { EmptyState } from "@tarodan/ui";
import { BellIcon } from "@heroicons/react/24/outline";
import { AdminTabs } from "@/components/AdminTabs";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionCard } from "@/components/detail/SectionCard";
import { EmailPreviewPane } from "@/components/email/EmailPreviewPane";
import { fmtDateTime } from "@/lib/format";
import {
  channelMeta,
  mailingTypeOptions,
  sendModeMeta,
  targetMeta,
  usesEmail,
  usesNotificationText,
  type SendForm,
} from "../../_lib/types";
import { useBroadcastEmailPreview } from "../../_lib/useBroadcastEmailPreview";
import { InAppPreview, PushPreview } from "../PushPreview";

type PreviewTab = "notification" | "email";

/**
 * Sağ sütun: yalnız seçili kanalların canlı önizlemesi (ikisi de varsa
 * sekmeli) + gönderim özeti. E-posta HTML'ini SUNUCU render eder (gerçekte
 * gidenle aynı); sandbox'lı iframe'de gösterilir.
 */
export function ComposePreview({
  values,
  canSend,
}: {
  values: SendForm;
  canSend: boolean;
}) {
  const t = useTranslations();
  const emailPreview = useBroadcastEmailPreview(values);
  const text = usesNotificationText(values.channels);
  const email = usesEmail(values.channels);
  const [tab, setTab] = useState<PreviewTab>("notification");
  // Seçili sekmenin kanalı kapatıldıysa kalan önizleme gösterilir.
  const active: PreviewTab | null =
    text && email ? tab : text ? "notification" : email ? "email" : null;

  const channels = channelMeta(t);
  const channelLabels = values.channels
    .map((key) => channels.find((c) => c.key === key)?.label)
    .filter(Boolean)
    .join(", ");

  return (
    <SectionCard
      title={t("admin.marketing.notifications.livePreview")}
      bodyClassName="space-y-5"
    >
      {text && email && (
        <AdminTabs
          tabs={[
            {
              key: "notification",
              label: t("admin.marketing.notifications.preview.notificationTab"),
            },
            {
              key: "email",
              label: t("admin.marketing.notifications.preview.emailTab"),
            },
          ]}
          value={tab}
          onChange={(key) => setTab(key as PreviewTab)}
        />
      )}

      {active === "notification" && (
        <div className="space-y-4">
          {values.channels.includes("push") && (
            <PushPreview
              title={values.title}
              body={values.body}
              link={values.link}
            />
          )}
          {values.channels.includes("in_app") && (
            <InAppPreview title={values.title} body={values.body} />
          )}
        </div>
      )}

      {active === "email" &&
        (values.emailHtml.trim() ? (
          <EmailPreviewPane
            className="h-[520px]"
            preview={emailPreview.preview}
            isPending={emailPreview.isPending}
            error={emailPreview.error}
            onRetry={emailPreview.refetch}
          />
        ) : (
          <EmptyState
            size="compact"
            icon={false}
            title={t("admin.marketing.notifications.emailPreviewEmpty")}
          />
        ))}

      {active === null && (
        <EmptyState
          size="compact"
          icon={<BellIcon className="h-6 w-6" />}
          title={t("admin.marketing.notifications.selectPreviewChannel")}
        />
      )}

      <DataList columns={1} className="gap-y-2 border-t border-border pt-2">
        <Field label={t("admin.marketing.notifications.channels")}>
          {channelLabels || "—"}
        </Field>
        <Field label={t("admin.marketing.notifications.mailingType.label")}>
          {mailingTypeOptions(t).find((o) => o.value === values.mailingType)
            ?.label ?? "—"}
        </Field>
        <Field label={t("admin.marketing.notifications.targetLabel")}>
          {targetMeta(t).find((o) => o.key === values.targetType)?.label}
        </Field>
        <Field label={t("admin.marketing.notifications.sendMode.title")}>
          {values.sendMode === "schedule" && values.scheduledFor
            ? fmtDateTime(values.scheduledFor)
            : sendModeMeta(t).find((o) => o.key === values.sendMode)?.label}
        </Field>
        <Field label={t("common.status")}>
          <span
            className={clsx(canSend ? "text-success-600" : "text-warning-600")}
          >
            {canSend
              ? t("admin.marketing.notifications.ready")
              : t("admin.marketing.notifications.missingFields")}
          </span>
        </Field>
      </DataList>
    </SectionCard>
  );
}
