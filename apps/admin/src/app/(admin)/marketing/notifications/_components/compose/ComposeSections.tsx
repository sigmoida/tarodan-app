"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { EmptyState } from "@tarodan/ui";
import {
  FormDateTimePicker,
  FormInput,
  FormSelect,
  FormTextarea,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { Panel } from "@/components/detail/Panel";
import { SectionCard } from "@/components/detail/SectionCard";
import { EmailHtmlEditor } from "@/components/email/EmailHtmlEditor";
import {
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  channelMeta,
  mailingTypeOptions,
  sendModeMeta,
  targetMeta,
  usesEmail,
  usesNotificationText,
  type NotificationChannel,
  type SendForm,
} from "../../_lib/types";
import type { AudienceCounts } from "../../_lib/useBroadcastEmailPreview";
import { UserPicker } from "../UserPicker";
import { ChoiceTile } from "./ChoiceTile";

/** E-posta HTML editörünün "Görsel ekle" yüklemesi: sunucudaki http(s) adresi. */
const uploadEmailImage = async (file: File): Promise<string> =>
  (await adminApi.uploadNotificationImage(file)).data.url;

/** datetime-local için YEREL "şimdi" (yyyy-mm-ddTHH:mm). */
function localDateTimeMin(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Adım kartı: numaralı başlık + açıklama; formun sırası adım sırasıdır. */
function StepCard({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-inverted">
            {step}
          </span>
          {title}
        </span>
      }
      bodyClassName="space-y-4"
    >
      {hint && <p className="-mt-2 text-sm text-muted">{hint}</p>}
      {children}
    </SectionCard>
  );
}

/** İçerik adımının kanal alt kartı (dış kart StepCard, içindekiler Panel). */
function ContentPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel className="space-y-5">
      <h3 className="text-base font-semibold text-heading">{title}</h3>
      {children}
    </Panel>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-danger-500">{message}</p> : null;
}

/** Etiket + sayaç (ör. 12/65); sınır aşılınca kırmızı. */
function CountedLabel({
  label,
  length,
  max,
}: {
  label: string;
  length: number;
  max: number;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-sm font-medium text-body">{label}</span>
      <span
        className={clsx(
          "text-xs",
          length > max ? "font-medium text-danger-500" : "text-muted",
        )}
      >
        {length}/{max}
      </span>
    </div>
  );
}

/** 1 — Kanallar (çoklu). Yalnız seçilenlerin içerik kartı ve önizlemesi görünür. */
export function ChannelStep({ channels }: { channels: SendForm["channels"] }) {
  const t = useTranslations();
  const { setValue, getValues, formState } = useFormContext<SendForm>();
  const toggle = (channel: NotificationChannel) => {
    const current = getValues("channels");
    setValue(
      "channels",
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
      { shouldDirty: true, shouldValidate: formState.isSubmitted },
    );
  };
  return (
    <StepCard
      step={1}
      title={t("admin.marketing.notifications.deliveryChannel")}
      hint={t("admin.marketing.notifications.channelHint")}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {channelMeta(t).map((channel) => (
          <ChoiceTile
            key={channel.key}
            active={channels.includes(channel.key)}
            icon={channel.icon}
            label={channel.label}
            desc={channel.desc}
            onClick={() => toggle(channel.key)}
          />
        ))}
      </div>
      <FieldError message={formState.errors.channels?.message} />
    </StepCard>
  );
}

/** 2 — Bildirim türü (duyuru / pazarlama): tüm kanalların kitlesini belirler. */
export function MailingTypeStep({
  mailingType,
}: {
  mailingType: SendForm["mailingType"];
}) {
  const t = useTranslations();
  const { setValue, formState } = useFormContext<SendForm>();
  return (
    <StepCard
      step={2}
      title={t("admin.marketing.notifications.mailingType.label")}
      hint={t("admin.marketing.notifications.mailingType.stepHint")}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {mailingTypeOptions(t).map((option) => (
          <ChoiceTile
            key={option.value}
            active={mailingType === option.value}
            label={option.label}
            desc={option.desc}
            onClick={() =>
              setValue("mailingType", option.value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        ))}
      </div>
      <FieldError message={formState.errors.mailingType?.message} />
    </StepCard>
  );
}

/**
 * 3 — İçerik: yalnız seçili kanalların kartları. Gizli kartın değerleri formda
 * kalır (kanal geri açılınca kaybolmaz) ama doğrulanmaz ve gönderilmez.
 */
export function ContentStep({
  channels,
  title,
  body,
}: {
  channels: SendForm["channels"];
  title: string;
  body: string;
}) {
  const t = useTranslations();
  const text = usesNotificationText(channels);
  const email = usesEmail(channels);
  return (
    <StepCard step={3} title={t("admin.marketing.notifications.content")}>
      {text && (
        <NotificationTextCard channels={channels} title={title} body={body} />
      )}
      {email && <EmailContentCard />}
      {!text && !email && (
        <EmptyState
          size="compact"
          icon={false}
          title={t("admin.marketing.notifications.selectChannelFirst")}
        />
      )}
    </StepCard>
  );
}

/** 3a — Push / zil metni: başlık, gövde, opsiyonel hedef link. */
function NotificationTextCard({
  channels,
  title,
  body,
}: {
  channels: SendForm["channels"];
  title: string;
  body: string;
}) {
  const t = useTranslations();
  const push = channels.includes("push");
  const inApp = channels.includes("in_app");
  const cardTitle =
    push && inApp
      ? t("admin.marketing.notifications.pushTextTitle")
      : push
        ? t("admin.marketing.notifications.pushOnlyTextTitle")
        : t("admin.marketing.notifications.inAppOnlyTextTitle");
  return (
    <ContentPanel title={cardTitle}>
      <div>
        <CountedLabel
          label={t("common.title")}
          length={title.length}
          max={PUSH_TITLE_MAX}
        />
        <FormInput
          name="title"
          placeholder={t("admin.marketing.notifications.titlePlaceholder")}
        />
      </div>
      <div>
        <CountedLabel
          label={t("admin.marketing.notifications.content")}
          length={body.length}
          max={PUSH_BODY_MAX}
        />
        <FormTextarea
          name="body"
          rows={4}
          placeholder={t("admin.marketing.notifications.bodyPlaceholder")}
        />
      </div>
      {/* Dokununca açılacak sayfa: push payload'ına ve zil satırına
          `data.link` olarak gider (anında ve zamanlanmış gönderim). */}
      <FormInput
        name="link"
        label={t("admin.marketing.notifications.link.label")}
        placeholder={t("admin.marketing.notifications.link.placeholder")}
        helperText={t("admin.marketing.notifications.link.hint")}
      />
    </ContentPanel>
  );
}

/**
 * 3b — E-posta: konu + HTML gövde. API HTML'i sunucuda süzer ve ortak mail
 * iskeletine oturtur (logo/altbilgi; pazarlamada çıkış linki otomatik);
 * ayrı şablon seçeneği yok. Önizleme sağ sütunda.
 */
function EmailContentCard() {
  const t = useTranslations();
  return (
    <ContentPanel title={t("admin.marketing.notifications.emailSectionTitle")}>
      <FormInput
        name="emailSubject"
        label={t("admin.marketing.emailTemplates.emailSubject")}
        placeholder={t("admin.marketing.notifications.emailSubjectPlaceholder")}
      />
      <EmailHtmlEditor
        name="emailHtml"
        placeholder={t("admin.marketing.notifications.emailHtmlPlaceholder")}
        className="h-[420px]"
        onUploadImage={uploadEmailImage}
      />
      <p className="text-xs text-muted">
        {t("admin.marketing.notifications.emailLayoutHint")}
      </p>
    </ContentPanel>
  );
}

/** 4 — Hedef kitle + alıcı sayısı (türe göre: herkes / pazarlama izinliler). */
export function AudienceStep({
  values,
  audienceCounts,
}: {
  values: Pick<SendForm, "targetType" | "mailingType">;
  audienceCounts?: AudienceCounts;
}) {
  const t = useTranslations();
  const { setValue } = useFormContext<SendForm>();
  return (
    <StepCard step={4} title={t("admin.marketing.notifications.audience")}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {targetMeta(t).map((target) => (
          <ChoiceTile
            key={target.key}
            active={values.targetType === target.key}
            icon={target.icon}
            label={target.label}
            desc={target.desc}
            onClick={() =>
              setValue("targetType", target.key, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        ))}
      </div>

      {values.targetType === "user_ids" && <UserPicker />}

      {values.targetType === "segment" && (
        <Panel tone="muted" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormSelect
            name="isSeller"
            label={t("admin.marketing.notifications.sellerStatus")}
            options={[
              {
                value: "",
                label: t("admin.marketing.notifications.allOption"),
              },
              {
                value: "true",
                label: t("admin.marketing.notifications.onlySellers"),
              },
              {
                value: "false",
                label: t("admin.marketing.notifications.onlyBuyers"),
              },
            ]}
          />
          <FormSelect
            name="membershipTier"
            label={t("admin.marketing.notifications.membershipType")}
            options={[
              {
                value: "",
                label: t("admin.marketing.notifications.allOption"),
              },
              { value: "free", label: "Free" },
              { value: "basic", label: "Basic" },
              { value: "premium", label: "Premium" },
              { value: "business", label: "Business" },
            ]}
          />
        </Panel>
      )}

      {audienceCounts && (
        <p className="text-sm font-medium text-body">
          {values.mailingType
            ? t("admin.marketing.notifications.recipientCount", {
                count:
                  values.mailingType === "marketing"
                    ? audienceCounts.marketing
                    : audienceCounts.total,
                total: audienceCounts.total,
              })
            : t("admin.marketing.notifications.recipientCountNoType", {
                total: audienceCounts.total,
              })}
        </p>
      )}
    </StepCard>
  );
}

/** 5 — Şimdi gönder / zamanla (tarih-saat yalnız zamanlamada). */
export function TimingStep({ sendMode }: { sendMode: SendForm["sendMode"] }) {
  const t = useTranslations();
  const { setValue, formState } = useFormContext<SendForm>();
  return (
    <StepCard
      step={5}
      title={t("admin.marketing.notifications.sendMode.title")}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sendModeMeta(t).map((mode) => (
          <ChoiceTile
            key={mode.key}
            active={sendMode === mode.key}
            icon={mode.icon}
            label={mode.label}
            desc={mode.desc}
            onClick={() =>
              setValue("sendMode", mode.key, {
                shouldDirty: true,
                shouldValidate: formState.isSubmitted,
              })
            }
          />
        ))}
      </div>
      {sendMode === "schedule" && (
        <FormDateTimePicker
          name="scheduledFor"
          label={t("admin.marketing.notifications.scheduleDateTime")}
          // min YEREL tarih olmalı: toISOString UTC döndürür ve TR'de
          // 00:00-03:00 arası takvim düne izin veriyordu. Saat sınırını zod
          // (scheduleFuture) tutar.
          min={localDateTimeMin()}
        />
      )}
    </StepCard>
  );
}
