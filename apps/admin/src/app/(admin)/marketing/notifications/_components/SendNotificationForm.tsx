"use client";

import { FormModal, useZodForm } from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  type SendForm,
  emptySendForm,
  scheduleFormToPayload,
  sendFormToPayload,
  sendNotificationSchema,
} from "../_lib/types";
import { useAudienceCounts } from "../_lib/useBroadcastEmailPreview";
import {
  AudienceStep,
  ChannelStep,
  ContentStep,
  MailingTypeStep,
  TimingStep,
} from "./compose/ComposeSections";
import { ComposePreview } from "./compose/ComposePreview";

/**
 * "Bildirim Oluştur" modalı. Sayfa açılışında KENDİLİĞİNDEN açılmaz — sayfa
 * başlığındaki buton mount eder; kapatma/gönderme `onClose` ile sayfaya döner.
 *
 * Akış yukarıdan aşağı: 1 kanal → 2 tür → 3 yalnız seçili kanalların içerik
 * kartları → 4 hedef kitle → 5 şimdi gönder / zamanla. Sağda yapışkan canlı
 * önizleme; dar ekranda formun altına iner.
 */
export function SendNotificationForm({
  onClose,
  onScheduled,
}: {
  onClose: () => void;
  onScheduled: () => void;
}) {
  const t = useTranslations();
  const schema = sendNotificationSchema(t);
  const form = useZodForm(schema, { defaultValues: emptySendForm });
  const values = form.watch();
  const audienceCounts = useAudienceCounts(values);
  // Önizlemedeki "hazır" durumu gönderimle AYNI şemadan gelir (tek kaynak).
  const canSend = schema.safeParse(values).success;

  const send = useAdminMutation(
    (formValues: SendForm) =>
      adminApi.sendNotification(sendFormToPayload(formValues)),
    {
      invalidates: ["notification-history"],
      successMessage: t("admin.marketing.notifications.sent"),
      onSuccess: () => {
        form.reset(emptySendForm);
        onClose();
      },
    },
  );
  const schedule = useAdminMutation(
    (formValues: SendForm) =>
      adminApi.scheduleNotification(scheduleFormToPayload(formValues)),
    {
      invalidates: ["scheduled-notifications"],
      successMessage: t("admin.marketing.notifications.scheduled"),
      onSuccess: () => {
        form.reset(emptySendForm);
        onScheduled();
      },
    },
  );

  const scheduling = values.sendMode === "schedule";

  return (
    <FormModal
      open
      onClose={onClose}
      title={t("admin.marketing.notifications.create")}
      form={form}
      onSubmit={(formValues) =>
        formValues.sendMode === "schedule"
          ? schedule.mutate(formValues)
          : send.mutate(formValues)
      }
      isSubmitting={send.isPending || schedule.isPending}
      submitLabel={
        scheduling
          ? t("admin.marketing.notifications.schedule")
          : t("admin.marketing.notifications.sendNow")
      }
      size="full"
      modalClassName="h-[calc(100dvh-2rem)]"
      closeOnBackdrop={false}
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <ChannelStep channels={values.channels} />
          <MailingTypeStep mailingType={values.mailingType} />
          <ContentStep
            channels={values.channels}
            title={values.title}
            body={values.body}
          />
          <AudienceStep values={values} audienceCounts={audienceCounts} />
          <TimingStep sendMode={values.sendMode} />
        </div>
        {/* Modal gövdesi kaydırma kabıdır: sticky top-0 ona göre yapışır. */}
        <div className="lg:sticky lg:top-0 lg:col-span-5 lg:max-h-[calc(100dvh-11rem)] lg:self-start lg:overflow-y-auto">
          <ComposePreview values={values} canSend={canSend} />
        </div>
      </div>
    </FormModal>
  );
}
