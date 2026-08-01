"use client";

import { useTranslations } from "next-intl";
import { Button, Slider } from "@tarodan/ui";
import { Form, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { SectionCard } from "@/components/detail/SectionCard";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { aiThresholdsSchema, type AiThresholdsValues } from "../_lib/schema";
import { type AiModerationConfig } from "../_lib/types";

/**
 * Relevance auto-accept + NSFW block thresholds (stored 0..1, edited as %).
 *
 * Config okunamadıysa sürgüler hiç GÖSTERİLMEZ: eskiden varsayılan 20/70'e
 * düşüp Kaydet aktif kalıyordu, yani admin hiç görmediği değerlerle canlı
 * eşikleri ezebiliyordu.
 */
export function AiThresholdsCard({
  config,
  isLoading = false,
  isError = false,
}: {
  config?: AiModerationConfig;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const t = useTranslations();
  // `values` reseeds the sliders from the server config (and after each save's
  // refetch) — no useEffect mirror. Sliders are controlled, so the values are
  // driven via watch/setValue rather than register.
  const form = useZodForm(aiThresholdsSchema, {
    defaultValues: { rel: 20, nsfw: 70 },
    values: config
      ? {
          rel: Math.round(config.relevanceThreshold * 100),
          nsfw: Math.round(config.nsfwThreshold * 100),
        }
      : undefined,
  });
  const { rel, nsfw } = form.watch();

  const save = useAdminMutation(
    (v: AiThresholdsValues) =>
      adminApi.setAiModerationConfig({
        relevanceThreshold: v.rel / 100,
        nsfwThreshold: v.nsfw / 100,
      }),
    {
      invalidates: ["ai-moderation-config"],
      successMessage: t("admin.aiModeration.thresholds.saved"),
    },
  );

  // Mevcut değerler bilinmeden kaydetmeye izin YOK.
  const disabled = !config || config.enabled === false;

  if (isLoading || isError) {
    return (
      <SectionCard
        title={t("admin.aiModeration.thresholds.title")}
        bodyClassName="py-8 text-center text-sm text-muted"
      >
        {isError
          ? t("admin.aiModeration.thresholds.unavailable")
          : t("common.loading")}
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t("admin.aiModeration.thresholds.title")}
      bodyClassName="space-y-4"
    >
      <Form form={form} onSubmit={(v) => save.mutate(v)} className="space-y-4">
        <Slider
          min={0}
          max={100}
          value={rel}
          onChange={(e) => form.setValue("rel", Number(e.target.value))}
          label={t("admin.aiModeration.thresholds.relevanceLabel")}
          valueLabel={t("admin.aiModeration.thresholds.percentValue", {
            value: rel,
          })}
          helperText={t("admin.aiModeration.thresholds.relevanceHelper")}
        />
        <Slider
          min={0}
          max={100}
          value={nsfw}
          onChange={(e) => form.setValue("nsfw", Number(e.target.value))}
          label={t("admin.aiModeration.thresholds.nsfwLabel")}
          valueLabel={t("admin.aiModeration.thresholds.percentValue", {
            value: nsfw,
          })}
          helperText={t("admin.aiModeration.thresholds.nsfwHelper")}
        />
        <div className="flex justify-end">
          <Button type="submit" isLoading={save.isPending} disabled={disabled}>
            {t("admin.aiModeration.thresholds.saveButton")}
          </Button>
        </div>
      </Form>
    </SectionCard>
  );
}
