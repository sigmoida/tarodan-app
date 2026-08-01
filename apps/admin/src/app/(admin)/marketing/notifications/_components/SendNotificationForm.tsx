"use client";

import { useState, type ComponentType } from "react";
import clsx from "clsx";
import { Button } from "@tarodan/ui";
import {
  FormDateTimePicker,
  FormInput,
  FormModal,
  FormSelect,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import {
  BellIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { useTranslations } from "next-intl";
import {
  type SendForm,
  type ScheduleNotificationForm,
  emptySendForm,
  channelMeta,
  targetMeta,
  sendFormToPayload,
  sendNotificationSchema,
  scheduleNotificationSchema,
} from "../_lib/types";
import { UserPicker } from "./UserPicker";

function Tile({
  active,
  icon: Icon,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={clsx(
        "relative h-auto flex-col items-center gap-2 rounded-xl border-2 p-4 text-center",
        active
          ? "border-primary-500 bg-primary-50 text-primary-700"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-body",
      )}
    >
      {active && (
        <CheckCircleIcon className="absolute right-2 top-2 h-4 w-4 text-primary-500" />
      )}
      <Icon
        className={clsx("h-6 w-6", active ? "text-primary-500" : "text-subtle")}
      />
      <span className="text-sm font-medium">{label}</span>
      <span
        className={clsx(
          "text-xs leading-tight",
          active ? "text-primary-600" : "text-muted",
        )}
      >
        {desc}
      </span>
    </Button>
  );
}

/**
 * "Bildirim Oluştur" modalı. Sayfa açılışında KENDİLİĞİNDEN açılmaz — sayfa
 * başlığındaki buton mount eder; kapatma/gönderme `onClose` ile sayfaya döner.
 */
export function SendNotificationForm({
  onClose,
  onScheduled,
}: {
  onClose: () => void;
  onScheduled: () => void;
}) {
  const t = useTranslations();
  const channels = channelMeta(t);
  const targets = targetMeta(t);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const form = useZodForm(sendNotificationSchema(t), {
    defaultValues: emptySendForm,
  });
  const scheduleForm = useZodForm(scheduleNotificationSchema(t), {
    defaultValues: { scheduledFor: "" },
  });
  const values = form.watch();

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
    (scheduleValues: ScheduleNotificationForm) =>
      adminApi.scheduleNotification({
        ...sendFormToPayload(form.getValues()),
        scheduledFor: new Date(scheduleValues.scheduledFor).toISOString(),
      }),
    {
      invalidates: ["scheduled-notifications"],
      successMessage: t("admin.marketing.notifications.scheduled"),
      onSuccess: () => {
        setScheduleOpen(false);
        scheduleForm.reset({ scheduledFor: "" });
        onScheduled();
      },
    },
  );

  const toggleChannel = (channel: SendForm["channels"][number]) => {
    const channels = form.getValues("channels");
    form.setValue(
      "channels",
      channels.includes(channel)
        ? channels.filter((item) => item !== channel)
        : [...channels, channel],
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const openSchedule = async () => {
    if (await form.trigger()) setScheduleOpen(true);
  };

  const titleOk = values.title.length > 0 && values.title.length <= 65;
  const bodyOk = values.body.length > 0 && values.body.length <= 240;
  const canSend = titleOk && bodyOk && values.channels.length > 0;

  return (
    <>
      <FormModal
        open
        onClose={onClose}
        title={t("admin.marketing.notifications.create")}
        form={form}
        onSubmit={(formValues) => send.mutate(formValues)}
        isSubmitting={send.isPending}
        submitLabel={t("admin.marketing.notifications.sendNow")}
        size="wide"
        closeOnBackdrop={false}
      >
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
          <div className="space-y-5 xl:col-span-3">
            <SectionCard title={t("common.message")} bodyClassName="space-y-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-body">
                    {t("common.title")}
                  </span>
                  <span
                    className={clsx(
                      "text-xs",
                      values.title.length > 65
                        ? "font-medium text-danger-500"
                        : "text-muted",
                    )}
                  >
                    {values.title.length}/65
                  </span>
                </div>
                <FormInput
                  name="title"
                  placeholder={t(
                    "admin.marketing.notifications.titlePlaceholder",
                  )}
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-body">
                    {t("admin.marketing.notifications.content")}
                  </span>
                  <span
                    className={clsx(
                      "text-xs",
                      values.body.length > 240
                        ? "font-medium text-danger-500"
                        : "text-muted",
                    )}
                  >
                    {values.body.length}/240
                  </span>
                </div>
                <FormTextarea
                  name="body"
                  rows={4}
                  placeholder={t(
                    "admin.marketing.notifications.bodyPlaceholder",
                  )}
                />
              </div>
            </SectionCard>

            <SectionCard
              title={t("admin.marketing.notifications.deliveryChannel")}
              bodyClassName="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                {channels.map((channel) => (
                  <Tile
                    key={channel.key}
                    active={values.channels.includes(channel.key)}
                    icon={channel.icon}
                    label={channel.label}
                    desc={channel.desc}
                    onClick={() => toggleChannel(channel.key)}
                  />
                ))}
              </div>
              {form.formState.errors.channels?.message && (
                <p className="text-xs text-danger-500">
                  {form.formState.errors.channels.message}
                </p>
              )}
            </SectionCard>

            <SectionCard
              title={t("admin.marketing.notifications.audience")}
              bodyClassName="space-y-4"
            >
              <div className="grid grid-cols-3 gap-3">
                {targets.map((target) => (
                  <Tile
                    key={target.key}
                    active={values.targetType === target.key}
                    icon={target.icon}
                    label={target.label}
                    desc={target.desc}
                    onClick={() =>
                      form.setValue(
                        "targetType",
                        target.key as SendForm["targetType"],
                        {
                          shouldDirty: true,
                          shouldValidate: true,
                        },
                      )
                    }
                  />
                ))}
              </div>

              {values.targetType === "user_ids" && <UserPicker />}

              {values.targetType === "segment" && (
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface-alt p-4">
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
                      { value: "premium", label: "Premium" },
                      { value: "business", label: "Business" },
                    ]}
                  />
                </div>
              )}
            </SectionCard>

            <Button
              type="button"
              variant="secondary"
              leftIcon={<ClockIcon className="h-4 w-4" />}
              onClick={openSchedule}
              disabled={!canSend}
              className="w-full justify-center"
            >
              {t("admin.marketing.notifications.schedule")}
            </Button>
          </div>

          <div className="xl:col-span-2">
            <SectionCard
              title={t("admin.marketing.notifications.livePreview")}
              className="sticky top-6"
              bodyClassName="space-y-5"
            >
              {values.channels.includes("push") && (
                <div>
                  <p className="mb-2 flex items-center gap-1 text-xs text-muted">
                    <DevicePhoneMobileIcon className="h-3.5 w-3.5" /> Push
                    {t("admin.marketing.notifications.notificationSuffix")}
                  </p>
                  <div className="rounded-2xl bg-heading p-4 shadow-lg">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500">
                        <BellIcon className="h-5 w-5 text-inverted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-inverted">
                          {values.title || (
                            <span className="font-normal italic text-inverted/50">
                              {t("admin.marketing.notifications.enterTitle")}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-inverted/70">
                          {values.body || (
                            <span className="italic">
                              {t("admin.marketing.notifications.enterContent")}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-inverted/50">
                        {t("admin.marketing.notifications.now")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {values.channels.includes("email") && (
                <div>
                  <p className="mb-2 flex items-center gap-1 text-xs text-muted">
                    <EnvelopeIcon className="h-3.5 w-3.5" />{" "}
                    {t("admin.marketing.notifications.channel.email")}
                  </p>
                  <div className="overflow-hidden rounded-xl border border-border bg-surface">
                    <div className="border-b border-border bg-surface-alt px-4 py-2.5">
                      <p className="text-xs text-muted">
                        {t("admin.marketing.emailTemplates.subject")}:
                      </p>
                      <p className="truncate text-sm font-medium text-heading">
                        {values.title || (
                          <span className="italic text-subtle">
                            {t("admin.marketing.notifications.enterTitle")}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="px-4 py-3">
                      <p className="line-clamp-3 text-sm leading-relaxed text-body">
                        {values.body || (
                          <span className="italic text-subtle">
                            {t("admin.marketing.notifications.enterContent")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {values.channels.length === 0 && (
                <div className="py-8 text-center text-muted">
                  <BellIcon className="mx-auto mb-2 h-10 w-10 text-subtle" />
                  <p className="text-sm">
                    {t("admin.marketing.notifications.selectPreviewChannel")}
                  </p>
                </div>
              )}

              <div className="space-y-2 border-t border-border pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">
                    {t("admin.marketing.notifications.targetLabel")}
                  </span>
                  <span className="font-medium text-body">
                    {
                      targets.find((target) => target.key === values.targetType)
                        ?.label
                    }
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">
                    {t("admin.marketing.notifications.channels")}
                  </span>
                  <span className="font-medium text-body">
                    {values.channels.length === 0
                      ? "—"
                      : values.channels
                          .map(
                            (channel) =>
                              channels.find((item) => item.key === channel)
                                ?.label,
                          )
                          .join(", ")}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">{t("common.status")}</span>
                  <span
                    className={clsx(
                      "font-medium",
                      canSend ? "text-success-600" : "text-warning-600",
                    )}
                  >
                    {canSend
                      ? t("admin.marketing.notifications.ready")
                      : t("admin.marketing.notifications.missingFields")}
                  </span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </FormModal>

      {scheduleOpen && (
        <FormModal
          open
          onClose={() => setScheduleOpen(false)}
          title={t("admin.marketing.notifications.scheduleTitle")}
          form={scheduleForm}
          onSubmit={(scheduleValues) => schedule.mutate(scheduleValues)}
          isSubmitting={schedule.isPending}
          submitLabel={t("admin.marketing.notifications.schedule")}
        >
          <FormDateTimePicker
            name="scheduledFor"
            label={t("admin.marketing.notifications.scheduleDateTime")}
            min={new Date().toISOString().slice(0, 16)}
          />
        </FormModal>
      )}
    </>
  );
}
